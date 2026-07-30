import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  getDocument,
  Util,
  type PdfPageViewport,
  type PdfTextItems,
  type PDFDocumentProxy,
  type RenderTask,
} from "@/lib/pdf"

type PdfViewerPanelProps = {
  tag: string
  documentName: string
  file: File | null
  pages: number[]
  onClose: () => void
}

type Highlight = {
  left: number
  top: number
  width: number
  height: number
}

function findHighlights(items: PdfTextItems, viewport: PdfPageViewport, tag: string): Highlight[] {
  const needle = tag.trim().toUpperCase()
  if (!needle) return []

  const highlights: Highlight[] = []

  for (const item of items) {
    if (!("str" in item) || !item.str) continue

    const text = item.str.toUpperCase()
    const perChar = (item.width * viewport.scale) / Math.max(item.str.length, 1)
    const transform = Util.transform(viewport.transform, item.transform)
    const height = Math.hypot(transform[2], transform[3]) || item.height * viewport.scale

    let from = text.indexOf(needle)
    while (from !== -1) {
      highlights.push({
        left: transform[4] + perChar * from - 1,
        top: transform[5] - height,
        width: Math.max(perChar * needle.length + 2, 6),
        height: Math.max(height, 8),
      })
      from = text.indexOf(needle, from + needle.length)
    }
  }

  return highlights
}

function isCancelled(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException"
}

export function PdfViewerPanel({ tag, documentName, file, pages, onClose }: PdfViewerPanelProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
  const [stageWidth, setStageWidth] = useState(0)
  const [highlights, setHighlights] = useState<Highlight[]>([])

  const pageNumbers = pages.length > 0 ? pages : [1]
  const currentPage = pageNumbers[Math.min(pageIndex, pageNumbers.length - 1)]

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      if (width > 0) setStageWidth(width)
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    document.body.classList.add("has-pdf-viewer")
    return () => document.body.classList.remove("has-pdf-viewer")
  }, [])

  useEffect(() => {
    if (!file) {
      setStatus("error")
      return
    }

    let cancelled = false
    let loadingTask: ReturnType<typeof getDocument> | null = null
    setStatus("loading")
    setPdfDocument(null)

    void (async () => {
      try {
        const data = new Uint8Array(await file.arrayBuffer())
        loadingTask = getDocument({ data })
        const loaded = await loadingTask.promise
        if (cancelled) return
        setPdfDocument(loaded)
        setStatus("ready")
      } catch {
        if (!cancelled) setStatus("error")
      }
    })()

    return () => {
      cancelled = true
      void loadingTask?.destroy()
    }
  }, [file])

  useEffect(() => {
    if (!pdfDocument || stageWidth === 0) return
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    const pageNumber = Math.min(Math.max(currentPage, 1), pdfDocument.numPages)

    void (async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber)
        if (cancelled) return

        const unscaled = page.getViewport({ scale: 1 })
        const scale = Math.max(0.25, stageWidth / unscaled.width)
        const viewport = page.getViewport({ scale })
        const ratio = window.devicePixelRatio || 1

        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        setPageSize({ width: viewport.width, height: viewport.height })
        setHighlights([])

        renderTaskRef.current?.cancel()
        const task = page.render({
          canvas,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        })
        renderTaskRef.current = task
        await task.promise
        if (cancelled) return

        const content = await page.getTextContent()
        if (cancelled) return
        setHighlights(findHighlights(content.items, viewport, tag))
      } catch (error) {
        if (!cancelled && !isCancelled(error)) setStatus("error")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentPage, pdfDocument, stageWidth, tag])

  useEffect(() => {
    return () => renderTaskRef.current?.cancel()
  }, [])

  return (
    <aside aria-label={`${tag} occurrences in ${documentName}`} className="pdf-viewer-panel">
      <header className="pdf-viewer-header">
        <div className="pdf-viewer-heading">
          <p className="pdf-viewer-file" title={documentName}>{documentName}</p>
          <p className="pdf-viewer-tag">{tag}</p>
        </div>
        <button aria-label="Close viewer" className="pdf-viewer-close" onClick={onClose} type="button">
          <X aria-hidden="true" size={16} strokeWidth={1.9} />
        </button>
      </header>

      <div className="pdf-viewer-stage" ref={stageRef}>
        {status === "error" ? (
          <p className="pdf-viewer-note">Preview unavailable for this document.</p>
        ) : (
          <>
            {status === "loading" && <p className="pdf-viewer-note">Loading preview…</p>}
            <div
              className="pdf-viewer-page"
              style={pageSize.width > 0 ? { width: pageSize.width, height: pageSize.height } : undefined}
            >
              <canvas className="pdf-viewer-canvas" ref={canvasRef} />
              {highlights.map((highlight) => (
                <span
                  className="pdf-viewer-highlight"
                  key={`${highlight.left}-${highlight.top}-${highlight.width}`}
                  style={{
                    left: highlight.left,
                    top: highlight.top,
                    width: highlight.width,
                    height: highlight.height,
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="pdf-viewer-footer">
        <button
          className="pdf-viewer-nav"
          disabled={pageIndex === 0}
          onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={15} strokeWidth={1.9} />
          Previous
        </button>
        <span className="pdf-viewer-position">
          <strong>{Math.min(pageIndex, pageNumbers.length - 1) + 1} / {pageNumbers.length}</strong>
          <small>Page {currentPage}</small>
        </span>
        <button
          className="pdf-viewer-nav"
          disabled={pageIndex >= pageNumbers.length - 1}
          onClick={() => setPageIndex((index) => Math.min(pageNumbers.length - 1, index + 1))}
          type="button"
        >
          Next
          <ChevronRight aria-hidden="true" size={15} strokeWidth={1.9} />
        </button>
      </footer>
    </aside>
  )
}
