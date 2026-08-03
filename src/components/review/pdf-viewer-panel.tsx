import { ChevronLeft, ChevronRight, GripVertical, Highlighter, Minus, Plus, X } from "lucide-react"
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useModalFocus } from "@/hooks/use-modal-focus"
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
  /** `drawer` (default) = fixed right panel; `canvas` = fill parent for document-primary review. */
  variant?: "drawer" | "canvas"
  onClose: () => void
  onPreviousMatch: () => void
  onNextMatch: () => void
  /** Active highlight box relative to the panel element (canvas mode bubble anchor). */
  onActiveHighlightChange?: (rect: Highlight | null) => void
}

type Highlight = {
  left: number
  top: number
  width: number
  height: number
}

type CharBox = {
  char: string
  left: number
  top: number
  width: number
  height: number
}

type ViewportRect = {
  left: number
  top: number
  width: number
  height: number
}

const AUTO_ZOOM = 2.25
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25
const HIGHLIGHT_PAD_X = 12
const HIGHLIGHT_PAD_Y = 10
const MINIMAP_WIDTH = 112
const DEFAULT_PANEL_WIDTH = 560
const MIN_PANEL_WIDTH = 420
const MAX_PANEL_WIDTH = 920
const MAIN_CONTENT_RESERVE = 380
const PANEL_WIDTH_STORAGE_KEY = "rive.pdf-viewer-width"
const HIGHLIGHTS_STORAGE_KEY = "rive.pdf-viewer-highlights"

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value / ZOOM_STEP) * ZOOM_STEP))
}

function maxPanelWidthForViewport(viewportWidth = typeof window === "undefined" ? DEFAULT_PANEL_WIDTH : window.innerWidth) {
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, viewportWidth - MAIN_CONTENT_RESERVE))
}

function clampPanelWidth(width: number, viewportWidth?: number) {
  return Math.round(Math.min(maxPanelWidthForViewport(viewportWidth), Math.max(MIN_PANEL_WIDTH, width)))
}

function readStoredPanelWidth() {
  try {
    const raw = sessionStorage.getItem(PANEL_WIDTH_STORAGE_KEY)
    if (!raw) return DEFAULT_PANEL_WIDTH
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return DEFAULT_PANEL_WIDTH
    return clampPanelWidth(parsed)
  } catch {
    return DEFAULT_PANEL_WIDTH
  }
}

function readHighlightsVisible() {
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_STORAGE_KEY)
    if (raw === null) return true
    return raw !== "0"
  } catch {
    return true
  }
}

function persistHighlightsVisible(visible: boolean) {
  try {
    localStorage.setItem(HIGHLIGHTS_STORAGE_KEY, visible ? "1" : "0")
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function persistPanelWidth(width: number) {
  try {
    sessionStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // Ignore private-mode / storage quota failures.
  }
}

function normalizeTagChar(char: string) {
  if (/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/.test(char)) return "-"
  return char.toUpperCase()
}

function compactTag(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, "")
}

function alnumTag(value: string) {
  return compactTag(value).replace(/[^A-Z0-9]/g, "")
}

function findHighlights(items: PdfTextItems, viewport: PdfPageViewport, tag: string): Highlight[] {
  const needle = compactTag(tag)
  const needleAlnum = alnumTag(tag)
  if (!needle && !needleAlnum) return []

  const chars: CharBox[] = []

  for (const item of items) {
    if (!("str" in item) || !item.str) continue

    const transform = Util.transform(viewport.transform, item.transform)
    const fontSize = Math.hypot(transform[2], transform[3]) || Math.max(item.height * viewport.scale, 8)
    const totalWidth = item.width * viewport.scale || fontSize * 0.55 * item.str.length
    const perChar = totalWidth / Math.max(item.str.length, 1)
    const left0 = transform[4]
    // Baseline Y in CSS space; glyph box sits above the baseline for upright text.
    const top = transform[5] - fontSize
    const height = Math.max(fontSize * 1.15, 10)

    for (let i = 0; i < item.str.length; i++) {
      chars.push({
        char: normalizeTagChar(item.str[i]!),
        left: left0 + perChar * i,
        top,
        width: Math.max(perChar, 1),
        height,
      })
    }
  }

  // Ignore whitespace so fragmented PDF glyphs (e.g. "PSV- 4015A") still match.
  const compactIndexes: number[] = []
  let compactHaystack = ""
  const alnumIndexes: number[] = []
  let alnumHaystack = ""
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!.char
    if (/\s/.test(char)) continue
    compactIndexes.push(i)
    compactHaystack += char
    if (/[A-Z0-9]/.test(char)) {
      alnumIndexes.push(i)
      alnumHaystack += char
    }
  }

  function collect(haystack: string, indexes: number[], search: string) {
    const highlights: Highlight[] = []
    if (!search) return highlights
    let from = haystack.indexOf(search)
    while (from !== -1) {
      const start = indexes[from]
      const end = indexes[from + search.length - 1]
      if (start !== undefined && end !== undefined) {
        const slice = chars.slice(start, end + 1)
        const left = Math.min(...slice.map((entry) => entry.left))
        const top = Math.min(...slice.map((entry) => entry.top))
        const right = Math.max(...slice.map((entry) => entry.left + entry.width))
        const bottom = Math.max(...slice.map((entry) => entry.top + entry.height))
        highlights.push({
          left: left - HIGHLIGHT_PAD_X,
          top: top - HIGHLIGHT_PAD_Y,
          width: Math.max(right - left + HIGHLIGHT_PAD_X * 2, 28),
          height: Math.max(bottom - top + HIGHLIGHT_PAD_Y * 2, 32),
        })
      }
      from = haystack.indexOf(search, from + 1)
    }
    return highlights
  }

  const exact = collect(compactHaystack, compactIndexes, needle)
  if (exact.length > 0) return exact

  // Fallback: ignore punctuation differences (PSV4015A vs PSV-4015A).
  return collect(alnumHaystack, alnumIndexes, needleAlnum)
}

function isCancelled(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException"
}

function centerHighlightInStage(stage: HTMLElement, highlight: HTMLElement) {
  const stageRect = stage.getBoundingClientRect()
  const highlightRect = highlight.getBoundingClientRect()
  const nextLeft =
    stage.scrollLeft +
    (highlightRect.left + highlightRect.width / 2) -
    (stageRect.left + stageRect.width / 2)
  const nextTop =
    stage.scrollTop +
    (highlightRect.top + highlightRect.height / 2) -
    (stageRect.top + stageRect.height / 2)
  stage.scrollTo({
    left: Math.max(0, nextLeft),
    top: Math.max(0, nextTop),
    behavior: "smooth",
  })
}

function textItemsToReadableString(items: PdfTextItems) {
  return items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
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
  variant = "drawer",
  onClose,
  onPreviousMatch,
  onNextMatch,
  onActiveHighlightChange,
}: PdfViewerPanelProps) {
  const isCanvas = variant === "canvas"
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null)
  const activeHighlightRef = useRef<HTMLSpanElement>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const textItemsRef = useRef<PdfTextItems>([])
  const viewportRef = useRef<PdfPageViewport | null>(null)
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [isPageRendering, setIsPageRendering] = useState(false)
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 })
  const [stageWidth, setStageWidth] = useState(0)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [pageText, setPageText] = useState("")
  const [zoom, setZoom] = useState(AUTO_ZOOM)
  const [highlightsVisible, setHighlightsVisible] = useState(readHighlightsVisible)
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [minimapSize, setMinimapSize] = useState({ width: MINIMAP_WIDTH, height: 0 })
  const [viewportRect, setViewportRect] = useState<ViewportRect | null>(null)
  const [isMinimapDragging, setIsMinimapDragging] = useState(false)
  const [closeTooltipOpen, setCloseTooltipOpen] = useState(false)
  const resizeStartRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const minimapDragRef = useRef<{ pointerId: number } | null>(null)
  const minimapRef = useRef<HTMLDivElement>(null)

  const currentPage = Math.max(1, page)
  const showSkeleton = status === "loading" || isPageRendering
  const skeletonWidth = pageSize.width > 0 ? pageSize.width : Math.max(stageWidth - 32, 240)
  const skeletonHeight = pageSize.height > 0
    ? pageSize.height
    : Math.round(skeletonWidth * 1.28)
  const zoomPercent = Math.round(zoom * 100)
  const canZoomOut = zoom > MIN_ZOOM
  const canZoomIn = zoom < MAX_ZOOM
  const showMinimap = status === "ready" && !showSkeleton && pageSize.width > 0 && pageSize.height > 0

  useModalFocus({
    containerRef: panelRef,
    initialFocusRef: closeRef,
    onEscape: onClose,
    enableInert: false,
    enabled: !isCanvas && !isClosing,
  })

  function scrollStageToMinimapPoint(clientX: number, clientY: number, smooth = false) {
    const stage = stageRef.current
    const pageEl = pageRef.current
    const minimap = minimapRef.current
    if (!stage || !pageEl || !minimap || pageSize.width === 0 || pageSize.height === 0) return

    const rect = minimap.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    const ratioX = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const ratioY = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    stage.scrollTo({
      left: pageEl.offsetLeft + ratioX * pageSize.width - stage.clientWidth / 2,
      top: pageEl.offsetTop + ratioY * pageSize.height - stage.clientHeight / 2,
      behavior: smooth ? "smooth" : "auto",
    })
  }

  function beginMinimapDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some environments (tests / unsupported pointers) reject capture.
    }
    minimapDragRef.current = { pointerId: event.pointerId }
    setIsMinimapDragging(true)
    scrollStageToMinimapPoint(event.clientX, event.clientY)
  }

  function moveMinimapDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = minimapDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    scrollStageToMinimapPoint(event.clientX, event.clientY)
  }

  function endMinimapDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = minimapDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    minimapDragRef.current = null
    setIsMinimapDragging(false)
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Ignore capture release failures.
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      const panel = panelRef.current
      if (!panel?.contains(document.activeElement)) return
      if (event.target instanceof Element && event.target.closest(".pdf-viewer-resize")) return

      if (event.key === "ArrowLeft" && canGoPrevious) {
        event.preventDefault()
        onPreviousMatch()
      }
      if (event.key === "ArrowRight" && canGoNext) {
        event.preventDefault()
        onNextMatch()
      }
      if ((event.key === "+" || event.key === "=") && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        setZoom((current) => clampZoom(current + ZOOM_STEP))
      }
      if (event.key === "-" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        setZoom((current) => clampZoom(current - ZOOM_STEP))
      }
      if (event.key === "0" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        setZoom(1)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [canGoNext, canGoPrevious, onNextMatch, onPreviousMatch])

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
    setPanelWidth(readStoredPanelWidth())
  }, [])

  useEffect(() => {
    if (isCanvas) {
      document.body.classList.remove("has-pdf-viewer")
      return
    }
    document.body.classList.toggle("has-pdf-viewer", !isClosing)
    return () => document.body.classList.remove("has-pdf-viewer")
  }, [isCanvas, isClosing])

  useEffect(() => {
    if (isCanvas) return
    document.body.classList.toggle("is-pdf-viewer-resizing", isResizing && !isClosing)
    return () => document.body.classList.remove("is-pdf-viewer-resizing")
  }, [isCanvas, isClosing, isResizing])

  useEffect(() => {
    if (isCanvas) return
    document.body.style.setProperty("--pdf-viewer-width", `${panelWidth}px`)
  }, [isCanvas, panelWidth])

  useEffect(() => {
    if (isCanvas) return
    return () => {
      document.body.style.removeProperty("--pdf-viewer-width")
    }
  }, [isCanvas])

  useEffect(() => {
    function onWindowResize() {
      setPanelWidth((current) => clampPanelWidth(current))
    }

    window.addEventListener("resize", onWindowResize)
    return () => window.removeEventListener("resize", onWindowResize)
  }, [])

  function beginPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    resizeStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelWidth,
    }
    setIsResizing(true)
  }

  function movePanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    const nextWidth = clampPanelWidth(start.startWidth + (start.startX - event.clientX))
    setPanelWidth(nextWidth)
  }

  function endPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    const start = resizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    resizeStartRef.current = null
    setIsResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setPanelWidth((current) => {
      const next = clampPanelWidth(current)
      persistPanelWidth(next)
      return next
    })
  }

  function nudgePanelWidth(delta: number) {
    setPanelWidth((current) => {
      const next = clampPanelWidth(current + delta)
      persistPanelWidth(next)
      return next
    })
  }

  // Auto-zoom whenever the user jumps to a different occurrence.
  useEffect(() => {
    setZoom(AUTO_ZOOM)
  }, [tag, currentPage, documentName, matchIndex])

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
    setPageText("")
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
        const fitScale = Math.max(0.25, stageWidth / unscaled.width)
        const scale = fitScale * zoom
        const viewport = pageProxy.getViewport({ scale })
        const ratio = window.devicePixelRatio || 1

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
        setPageText(textItemsToReadableString(content.items))
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
  }, [currentPage, pdfDocument, stageWidth, zoom])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || isPageRendering || status !== "ready") return
    setHighlights(findHighlights(textItemsRef.current, viewport, tag))
  }, [tag, isPageRendering, status])

  useEffect(() => {
    if (showSkeleton || status !== "ready" || pageSize.width === 0 || pageSize.height === 0) return
    const canvas = canvasRef.current
    const minimap = minimapCanvasRef.current
    if (!canvas || !minimap) return

    const ratio = window.devicePixelRatio || 1
    const miniHeight = Math.max(1, Math.round(MINIMAP_WIDTH * (pageSize.height / pageSize.width)))
    minimap.width = MINIMAP_WIDTH * ratio
    minimap.height = miniHeight * ratio
    minimap.style.width = `${MINIMAP_WIDTH}px`
    minimap.style.height = `${miniHeight}px`
    const ctx = minimap.getContext("2d")
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, minimap.width, minimap.height)
      ctx.drawImage(canvas, 0, 0, minimap.width, minimap.height)
    }
    setMinimapSize({ width: MINIMAP_WIDTH, height: miniHeight })
  }, [showSkeleton, status, pageSize.width, pageSize.height])

  useEffect(() => {
    if (highlights.length === 0 || showSkeleton) return
    const stage = stageRef.current
    const highlight = activeHighlightRef.current
    if (!stage || !highlight) return

    const frame = window.requestAnimationFrame(() => {
      centerHighlightInStage(stage, highlight)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [highlights, showSkeleton, currentPage, documentName, matchIndex, zoom])

  useEffect(() => {
    if (!onActiveHighlightChange) return

    function report() {
      const highlight = activeHighlightRef.current
      const panel = panelRef.current
      if (!highlight || !panel || showSkeleton || highlights.length === 0) {
        onActiveHighlightChange?.(null)
        return
      }
      const highlightRect = highlight.getBoundingClientRect()
      const panelRect = panel.getBoundingClientRect()
      onActiveHighlightChange?.({
        left: highlightRect.left - panelRect.left,
        top: highlightRect.top - panelRect.top,
        width: highlightRect.width,
        height: highlightRect.height,
      })
    }

    const frame = window.requestAnimationFrame(report)
    const stage = stageRef.current
    stage?.addEventListener("scroll", report, { passive: true })
    window.addEventListener("resize", report)
    return () => {
      window.cancelAnimationFrame(frame)
      stage?.removeEventListener("scroll", report)
      window.removeEventListener("resize", report)
      onActiveHighlightChange(null)
    }
  }, [highlights, showSkeleton, zoom, pageSize, matchIndex, onActiveHighlightChange])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    function syncViewport() {
      const currentStage = stageRef.current
      const pageEl = pageRef.current
      if (!currentStage || !pageEl || minimapSize.height === 0) {
        setViewportRect(null)
        return
      }

      const stageRect = currentStage.getBoundingClientRect()
      const pageRect = pageEl.getBoundingClientRect()
      if (pageRect.width === 0 || pageRect.height === 0) {
        setViewportRect(null)
        return
      }

      const visibleLeft = Math.max(0, stageRect.left - pageRect.left)
      const visibleTop = Math.max(0, stageRect.top - pageRect.top)
      const visibleRight = Math.min(pageRect.width, stageRect.right - pageRect.left)
      const visibleBottom = Math.min(pageRect.height, stageRect.bottom - pageRect.top)
      const scaleX = minimapSize.width / pageRect.width
      const scaleY = minimapSize.height / pageRect.height

      setViewportRect({
        left: visibleLeft * scaleX,
        top: visibleTop * scaleY,
        width: Math.max((visibleRight - visibleLeft) * scaleX, 8),
        height: Math.max((visibleBottom - visibleTop) * scaleY, 8),
      })
    }

    stage.addEventListener("scroll", syncViewport, { passive: true })
    syncViewport()
    return () => stage.removeEventListener("scroll", syncViewport)
  }, [pageSize.width, pageSize.height, minimapSize.height, showSkeleton, zoom, highlights])

  useEffect(() => {
    return () => renderTaskRef.current?.cancel()
  }, [])

  return (
    <aside
      aria-keyshortcuts="Escape ArrowLeft ArrowRight + - 0"
      aria-label={`${tag} occurrences in ${documentName}. Keyboard: Escape closes, arrows change match, plus and minus zoom, zero resets zoom.`}
      className={[
        "pdf-viewer-panel",
        isCanvas ? "is-canvas" : "",
        isClosing ? "is-closing" : "",
        isResizing ? "is-resizing" : "",
        highlightsVisible ? "" : "highlights-off",
      ].filter(Boolean).join(" ")}
      ref={panelRef}
    >
      {!isCanvas && (
      <div
        aria-label="Resize document viewer"
        aria-orientation="vertical"
        aria-valuemax={maxPanelWidthForViewport()}
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuenow={panelWidth}
        className="pdf-viewer-resize"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault()
            event.stopPropagation()
            nudgePanelWidth(24)
          }
          if (event.key === "ArrowRight") {
            event.preventDefault()
            event.stopPropagation()
            nudgePanelWidth(-24)
          }
          if (event.key === "Home") {
            event.preventDefault()
            event.stopPropagation()
            const next = clampPanelWidth(MIN_PANEL_WIDTH)
            setPanelWidth(next)
            persistPanelWidth(next)
          }
          if (event.key === "End") {
            event.preventDefault()
            event.stopPropagation()
            const next = clampPanelWidth(maxPanelWidthForViewport())
            setPanelWidth(next)
            persistPanelWidth(next)
          }
        }}
        onPointerCancel={endPanelResize}
        onPointerDown={beginPanelResize}
        onPointerMove={movePanelResize}
        onPointerUp={endPanelResize}
        role="slider"
        tabIndex={0}
        title="Drag to resize"
      >
        <span aria-hidden="true" className="pdf-viewer-resize-thumb">
          <GripVertical size={12} strokeWidth={2.2} />
        </span>
      </div>
      )}
      <header className="pdf-viewer-header">
        <div className="pdf-viewer-heading">
          <p className="pdf-viewer-file" title={documentName}>{documentName}</p>
          <p className="pdf-viewer-tag">{tag} · Page {currentPage}</p>
        </div>
        <div className="pdf-viewer-header-actions">
          <div className="pdf-viewer-toolbar" role="toolbar" aria-label="Zoom controls">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="pdf-viewer-tooltip-target">
                  <button
                    aria-label="Zoom out"
                    className="pdf-viewer-zoom-button"
                    disabled={!canZoomOut || status !== "ready"}
                    onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
                    type="button"
                  >
                    <Minus aria-hidden="true" size={14} strokeWidth={2} />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!canZoomOut && status === "ready" ? "Minimum zoom reached" : "Zoom out"}
              </TooltipContent>
            </Tooltip>
            <span className="pdf-viewer-zoom-value" aria-live="polite">{zoomPercent}%</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="pdf-viewer-tooltip-target">
                  <button
                    aria-label="Zoom in"
                    className="pdf-viewer-zoom-button"
                    disabled={!canZoomIn || status !== "ready"}
                    onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={14} strokeWidth={2} />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {!canZoomIn && status === "ready" ? "Maximum zoom reached" : "Zoom in"}
              </TooltipContent>
            </Tooltip>
            <button
              aria-label="Fit width"
              className="pdf-viewer-zoom-button pdf-viewer-zoom-fit"
              disabled={status !== "ready"}
              onClick={() => setZoom(1)}
              type="button"
            >
              Fit width
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="pdf-viewer-tooltip-target">
                  <button
                    aria-label={highlightsVisible ? "Hide highlights" : "Show highlights"}
                    aria-pressed={highlightsVisible}
                    className={`pdf-viewer-zoom-button pdf-viewer-highlight-toggle${highlightsVisible ? " is-on" : ""}`}
                    onClick={() => {
                      setHighlightsVisible((current) => {
                        const next = !current
                        persistHighlightsVisible(next)
                        return next
                      })
                    }}
                    type="button"
                  >
                    <Highlighter aria-hidden="true" size={14} strokeWidth={1.9} />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {highlightsVisible ? "Hide highlights" : "Show highlights"}
              </TooltipContent>
            </Tooltip>
          </div>
          {!isCanvas && (
            <Tooltip open={closeTooltipOpen}>
              <TooltipTrigger asChild>
                <button
                  aria-label="Close viewer"
                  className="pdf-viewer-close"
                  onClick={onClose}
                  onPointerEnter={() => setCloseTooltipOpen(true)}
                  onPointerLeave={() => setCloseTooltipOpen(false)}
                  ref={closeRef}
                  type="button"
                >
                  <X aria-hidden="true" size={16} strokeWidth={1.9} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Close viewer</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      <div className="pdf-viewer-body">
        <div className="pdf-viewer-stage" ref={stageRef}>
          {status === "error" ? (
            <p className="pdf-viewer-note">Preview unavailable for this document.</p>
          ) : (
            <div
              className={`pdf-viewer-page${showSkeleton ? " is-loading" : ""}`}
              ref={pageRef}
              style={{ width: skeletonWidth, height: skeletonHeight }}
            >
              {showSkeleton && (
                <div aria-hidden="true" className="pdf-viewer-skeleton" />
              )}
              <canvas
                aria-hidden="true"
                className={`pdf-viewer-canvas${showSkeleton ? " is-pending" : ""}`}
                ref={canvasRef}
              />
              {!showSkeleton && pageText ? (
                <div className="sr-only" aria-live="polite">
                  {`Page ${currentPage} of ${documentName}. Tag ${tag}: match ${matchIndex} of ${matchTotal}.`}
                  {highlights.length > 0
                    ? ` ${highlights.length} highlight${highlights.length === 1 ? "" : "s"} on this page.`
                    : " No highlights on this page."}
                  {` Page text: ${pageText}`}
                </div>
              ) : null}
              {!showSkeleton && highlights.map((highlight, index) => (
                <span
                  className={`pdf-viewer-highlight${index === 0 ? " is-active" : ""}`}
                  key={`${highlight.left}-${highlight.top}-${highlight.width}-${index}`}
                  ref={index === 0 ? activeHighlightRef : undefined}
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

        {showMinimap && (
          <div
            aria-label="Page minimap"
            className={`pdf-viewer-minimap${isMinimapDragging ? " is-dragging" : ""}`}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                const rect = event.currentTarget.getBoundingClientRect()
                scrollStageToMinimapPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, true)
              }
            }}
            onPointerCancel={endMinimapDrag}
            onPointerDown={beginMinimapDrag}
            onPointerMove={moveMinimapDrag}
            onPointerUp={endMinimapDrag}
            ref={minimapRef}
            role="button"
            tabIndex={0}
            title="Drag to pan"
          >
            <canvas aria-hidden="true" className="pdf-viewer-minimap-canvas" ref={minimapCanvasRef} />
            {highlights.map((highlight, index) => (
              <span
                aria-hidden="true"
                className={`pdf-viewer-minimap-mark${index === 0 ? " is-active" : ""}`}
                key={`mini-${highlight.left}-${highlight.top}-${index}`}
                style={{
                  left: (highlight.left / pageSize.width) * minimapSize.width,
                  top: (highlight.top / pageSize.height) * minimapSize.height,
                  width: Math.max((highlight.width / pageSize.width) * minimapSize.width, 4),
                  height: Math.max((highlight.height / pageSize.height) * minimapSize.height, 4),
                }}
              />
            ))}
            {viewportRect && (
              <span
                aria-hidden="true"
                className="pdf-viewer-minimap-viewport"
                style={{
                  left: viewportRect.left,
                  top: viewportRect.top,
                  width: viewportRect.width,
                  height: viewportRect.height,
                }}
              />
            )}
          </div>
        )}
      </div>

      <footer className="pdf-viewer-footer">
        <Tooltip open={canGoPrevious ? false : undefined}>
          <TooltipTrigger asChild>
            <span className="pdf-viewer-tooltip-target">
              <button
                className="pdf-viewer-nav"
                disabled={!canGoPrevious}
                onClick={onPreviousMatch}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={15} strokeWidth={1.9} />
                Previous
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent>No previous occurrence</TooltipContent>
        </Tooltip>
        <span className="pdf-viewer-position" aria-live="polite">
          <strong>
            {matchTotal > 0
              ? `${Math.min(matchIndex + 1, matchTotal)} of ${matchTotal}`
              : "—"}
          </strong>
          <small>Occurrence · Page {currentPage}</small>
        </span>
        <Tooltip open={canGoNext ? false : undefined}>
          <TooltipTrigger asChild>
            <span className="pdf-viewer-tooltip-target">
              <button
                className="pdf-viewer-nav"
                disabled={!canGoNext}
                onClick={onNextMatch}
                type="button"
              >
                Next
                <ChevronRight aria-hidden="true" size={15} strokeWidth={1.9} />
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent>No next occurrence</TooltipContent>
        </Tooltip>
      </footer>
    </aside>
  )
}
