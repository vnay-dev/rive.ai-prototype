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
  page: number
  matchIndex: number
  matchTotal: number
  canGoPrevious: boolean
  canGoNext: boolean
  isClosing?: boolean
  onClose: () => void
  onPreviousMatch: () => void
  onNextMatch: () => void
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

export function PdfViewerPanel({
  tag,
  documentName,
  file,
  page,
  matchIndex,
  matchTotal,
  canGoPrevious,
  canGoNext,
  isClosing = false,
  onClose,
  onPreviousMatch,
  onNextMatch,
}: PdfViewerPanelProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const textItemsRef = useRef<PdfTextItems>([])
  const viewportRef = useRef<PdfPageViewport | null>(null)
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [isPageRendering, setIsPageRendering] = useState(false)
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
  const [stageWidth, setStageWidth] = useState(0)
  const [highlights, setHighlights] = useState<Highlight[]>([])

  const currentPage = Math.max(1, page)
  const showSkeleton = status === "loading" || isPageRendering
  const skeletonWidth = pageSize.width > 0 ? pageSize.width : Math.max(stageWidth - 32, 240)
  const skeletonHeight = pageSize.height > 0
    ? pageSize.height
    : Math.round(skeletonWidth * 1.28)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose()
        return
      }
      if (event.key === "ArrowLeft" && canGoPrevious) {
        event.preventDefault()
        onPreviousMatch()
      }
      if (event.key === "ArrowRight" && canGoNext) {
        event.preventDefault()
        onNextMatch()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [canGoNext, canGoPrevious, onClose, onNextMatch, onPreviousMatch])

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
    document.body.classList.toggle("has-pdf-viewer", !isClosing)
    return () => document.body.classList.remove("has-pdf-viewer")
  }, [isClosing])

  useEffect(() => {
    if (!file) {
      setStatus("error")
      setPdfDocument(null)
      setIsPageRendering(false)
      setHighlights([])
      textItemsRef.current = []
      viewportRef.current = null
      return
    }

    let cancelled = false
    let loadingTask: ReturnType<typeof getDocument> | null = null
    setStatus("loading")
    setIsPageRendering(true)
    setPdfDocument(null)
    setHighlights([])
    textItemsRef.current = []
    viewportRef.current = null

    void (async () => {
      try {
        const data = new Uint8Array(await file.arrayBuffer())
        loadingTask = getDocument({ data })
        const loaded = await loadingTask.promise
        if (cancelled) return
        setPdfDocument(loaded)
        setStatus("ready")
      } catch {
        if (!cancelled) {
          setStatus("error")
          setIsPageRendering(false)
        }
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
    setIsPageRendering(true)
    setHighlights([])

    void (async () => {
      try {
        const pageProxy = await pdfDocument.getPage(pageNumber)
        if (cancelled) return

        const unscaled = pageProxy.getViewport({ scale: 1 })
        const scale = Math.max(0.25, stageWidth / unscaled.width)
        const viewport = pageProxy.getViewport({ scale })
        const ratio = window.devicePixelRatio || 1

        // Keep previous pixels visible under the skeleton until dimensions are applied.
        const nextWidth = Math.floor(viewport.width * ratio)
        const nextHeight = Math.floor(viewport.height * ratio)
        setPageSize({ width: viewport.width, height: viewport.height })

        renderTaskRef.current?.cancel()
        canvas.width = nextWidth
        canvas.height = nextHeight

        const task = pageProxy.render({
          canvas,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        })
        renderTaskRef.current = task
        await task.promise
        if (cancelled) return

        const content = await pageProxy.getTextContent()
        if (cancelled) return

        textItemsRef.current = content.items
        viewportRef.current = viewport
        setHighlights(findHighlights(content.items, viewport, tag))
        setIsPageRendering(false)
      } catch (error) {
        if (!cancelled && !isCancelled(error)) {
          setStatus("error")
          setIsPageRendering(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [currentPage, pdfDocument, stageWidth])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || isPageRendering || status !== "ready") return
    setHighlights(findHighlights(textItemsRef.current, viewport, tag))
  }, [tag, isPageRendering, status])

  useEffect(() => {
    return () => renderTaskRef.current?.cancel()
  }, [])

  return (
    <aside
      aria-label={`${tag} occurrences in ${documentName}`}
      className={`pdf-viewer-panel${isClosing ? " is-closing" : ""}`}
    >
      <header className="pdf-viewer-header">
        <div className="pdf-viewer-heading">
          <p className="pdf-viewer-file" title={documentName}>{documentName}</p>
          <p className="pdf-viewer-tag">{tag} · Page {currentPage}</p>
        </div>
        <button aria-label="Close viewer" className="pdf-viewer-close" onClick={onClose} type="button">
          <X aria-hidden="true" size={16} strokeWidth={1.9} />
        </button>
      </header>

      <div className="pdf-viewer-stage" ref={stageRef}>
        {status === "error" ? (
          <p className="pdf-viewer-note">Preview unavailable for this document.</p>
        ) : (
          <div
            className={`pdf-viewer-page${showSkeleton ? " is-loading" : ""}`}
            style={{ width: skeletonWidth, height: skeletonHeight }}
          >
            {showSkeleton && (
              <div aria-hidden="true" className="pdf-viewer-skeleton" />
            )}
            <canvas
              aria-hidden={showSkeleton}
              className={`pdf-viewer-canvas${showSkeleton ? " is-pending" : ""}`}
              ref={canvasRef}
            />
            {!showSkeleton && highlights.map((highlight) => (
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
        )}
      </div>

      <footer className="pdf-viewer-footer">
        <button
          className="pdf-viewer-nav"
          disabled={!canGoPrevious}
          onClick={onPreviousMatch}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={15} strokeWidth={1.9} />
          Previous
        </button>
        <span className="pdf-viewer-position" aria-live="polite">
          <strong>
            {matchTotal > 0
              ? `${Math.min(matchIndex + 1, matchTotal)} of ${matchTotal}`
              : "—"}
          </strong>
          <small>Occurrence · Page {currentPage}</small>
        </span>
        <button
          className="pdf-viewer-nav"
          disabled={!canGoNext}
          onClick={onNextMatch}
          type="button"
        >
          Next
          <ChevronRight aria-hidden="true" size={15} strokeWidth={1.9} />
        </button>
      </footer>
    </aside>
  )
}
