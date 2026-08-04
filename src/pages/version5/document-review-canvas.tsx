import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Check, X } from "lucide-react"

import { PdfViewerPanel } from "@/components/review/pdf-viewer-panel"
import { ReviewSummaryDialog } from "@/components/review/review-summary-dialog"
import type { ReviewExportRow } from "@/lib/export-review"
import {
  flattenTagOccurrences,
  type TagDecision,
} from "@/lib/review"
import {
  type ReviewViewerTarget,
  type RuntimeReviewJob,
  type RuntimeUploadItem,
} from "@/lib/review-jobs"

type HighlightRect = {
  left: number
  top: number
  width: number
  height: number
}

type DocumentReviewCanvasProps = {
  job: RuntimeReviewJob
  jobName: string
  fallbackDocument: string
  summaryOpen: boolean
  exportRows: ReviewExportRow[]
  onSummaryOpenChange: (open: boolean) => void
  onDecideTag: (occurrenceKey: string, decision: TagDecision) => void
  onDecideMany: (occurrenceKeys: string[], decision: TagDecision) => void
  onSetViewer: (viewer: ReviewViewerTarget | null) => void
  onMarkExported: () => void
  findDocumentFile: (items: RuntimeUploadItem[], documentName: string) => File | null
}

const BUBBLE_GAP = 8
const EDGE = 8
const SHORTCUT_HINT_MS = 5500

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function DocumentReviewCanvas({
  job,
  jobName,
  fallbackDocument,
  summaryOpen,
  exportRows,
  onSummaryOpenChange,
  onDecideTag,
  onDecideMany,
  onSetViewer,
  onMarkExported,
  findDocumentFile,
}: DocumentReviewCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const occurrences = useMemo(
    () => flattenTagOccurrences(job.review ?? [], fallbackDocument),
    [fallbackDocument, job.review],
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null)
  const [bubbleOpen, setBubbleOpen] = useState(true)
  const [bubbleSize, setBubbleSize] = useState({ width: 360, height: 40 })
  const [shortcutHintOpen, setShortcutHintOpen] = useState(true)
  const [shortcutHintFading, setShortcutHintFading] = useState(true)

  const activeOccurrence = occurrences[activeIndex] ?? null
  const activeDecision = activeOccurrence ? job.decisions[activeOccurrence.key] : undefined
  const onSetViewerRef = useRef(onSetViewer)
  onSetViewerRef.current = onSetViewer
  const markedPassSeenRef = useRef<Set<string>>(new Set())

  // Start (or resume) on the first undecided occurrence.
  useEffect(() => {
    if (occurrences.length === 0) return
    markedPassSeenRef.current = new Set()
    const firstOpen = occurrences.findIndex((occurrence) => (
      !job.decisions[occurrence.key]
    ))
    setActiveIndex(firstOpen >= 0 ? firstOpen : 0)
    setBubbleOpen(true)
    setShortcutHintOpen(true)
    setShortcutHintFading(true)
  }, [job.id]) // eslint-disable-line react-hooks/exhaustive-deps -- resume once per job open

  useEffect(() => {
    if (!shortcutHintOpen || summaryOpen) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let fadeOutTimer = 0
    let hideTimer = 0

    // Seamless fade in on the next frames.
    const enterFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setShortcutHintFading(false)
      })
    })

    fadeOutTimer = window.setTimeout(() => {
      setShortcutHintFading(true)
    }, reduceMotion ? SHORTCUT_HINT_MS : SHORTCUT_HINT_MS - 480)
    hideTimer = window.setTimeout(() => {
      setShortcutHintOpen(false)
      setShortcutHintFading(false)
    }, SHORTCUT_HINT_MS)

    return () => {
      window.cancelAnimationFrame(enterFrame)
      window.clearTimeout(fadeOutTimer)
      window.clearTimeout(hideTimer)
    }
  }, [job.id, shortcutHintOpen, summaryOpen])

  useEffect(() => {
    if (!activeOccurrence) {
      onSetViewerRef.current(null)
      return
    }
    onSetViewerRef.current({
      tag: activeOccurrence.tag,
      documentName: activeOccurrence.documentName,
      page: activeOccurrence.page,
    })
  }, [
    activeOccurrence?.tag,
    activeOccurrence?.documentName,
    activeOccurrence?.page,
  ])

  useLayoutEffect(() => {
    const node = bubbleRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    setBubbleSize({
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    })
  }, [bubbleOpen, activeOccurrence?.tag, activeDecision, highlightRect])

  function goToIndex(index: number) {
    if (index < 0 || index >= occurrences.length) return
    setActiveIndex(index)
    setHighlightRect(null)
    setBubbleOpen(true)
  }

  function decisionFor(key: string, justDecidedKey?: string, justDecision?: TagDecision) {
    if (justDecidedKey && key === justDecidedKey && justDecision !== undefined) {
      return justDecision
    }
    return job.decisions[key]
  }

  /** Prefer next Open; when none left, revisit Marked-for-review once each, then Summary. */
  function advanceAfterDone(justDecidedKey?: string, justDecision?: TagDecision) {
    if (occurrences.length === 0) return
    const from = activeIndex

    for (let offset = 1; offset <= occurrences.length; offset += 1) {
      const index = (from + offset) % occurrences.length
      const key = occurrences[index].key
      if (!decisionFor(key, justDecidedKey, justDecision)) {
        markedPassSeenRef.current = new Set()
        goToIndex(index)
        return
      }
    }

    // No Open left — circle Marked for review (one pass), then Summary.
    if (justDecidedKey) {
      const leaving = decisionFor(justDecidedKey, justDecidedKey, justDecision)
      if (leaving === "needs-review") {
        markedPassSeenRef.current.add(justDecidedKey)
      }
    }

    for (let offset = 1; offset <= occurrences.length; offset += 1) {
      const index = (from + offset) % occurrences.length
      const key = occurrences[index].key
      if (markedPassSeenRef.current.has(key)) continue
      if (decisionFor(key, justDecidedKey, justDecision) === "needs-review") {
        goToIndex(index)
        return
      }
    }

    markedPassSeenRef.current = new Set()
    setBubbleOpen(false)
    onSummaryOpenChange(true)
  }

  function handleDecide(decision: TagDecision) {
    if (!activeOccurrence) return
    const key = activeOccurrence.key
    setBubbleOpen(true)
    onDecideTag(key, decision)
    advanceAfterDone(key, decision)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (summaryOpen) return
      const target = event.target
      if (target instanceof HTMLElement) {
        const tagName = target.tagName
        if (tagName === "INPUT" || tagName === "TEXTAREA" || target.isContentEditable) return
      }

      if (event.key === "1") {
        event.preventDefault()
        handleDecide("rejected")
      } else if (event.key === "2") {
        event.preventDefault()
        handleDecide("needs-review")
      } else if (event.key === "3") {
        event.preventDefault()
        handleDecide("approved")
      } else if (event.key === "Enter") {
        event.preventDefault()
        if (activeDecision && activeOccurrence) {
          advanceAfterDone(activeOccurrence.key, activeDecision)
        }
      } else if (event.key === "Escape" && bubbleOpen) {
        event.preventDefault()
        setBubbleOpen(false)
      } else if (event.key === "ArrowDown") {
        event.preventDefault()
        goToIndex(Math.min(activeIndex + 1, occurrences.length - 1))
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        goToIndex(Math.max(activeIndex - 1, 0))
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  if (!activeOccurrence) {
    return (
      <section className="document-review-canvas is-empty" aria-label="Document review">
        <p>No tag occurrences to review.</p>
      </section>
    )
  }

  const tag = activeOccurrence.tag
  const file = findDocumentFile(job.items, activeOccurrence.documentName)
  const stageWidth = stageRef.current?.clientWidth ?? 720
  const stageHeight = stageRef.current?.clientHeight ?? 480
  const decisionClass = activeDecision ? ` is-${activeDecision}` : " is-open"
  const pinLabel = activeDecision === "approved"
    ? "Approved"
    : activeDecision === "rejected"
      ? "Rejected"
      : activeDecision === "needs-review"
        ? "Marked for review"
        : "Open"

  const anchor = highlightRect ?? {
    left: Math.max(EDGE, stageWidth / 2 - 20),
    top: Math.max(EDGE, stageHeight / 2 - 10),
    width: 40,
    height: 20,
  }
  const floatingWidth = bubbleSize.width
  const floatingHeight = bubbleSize.height

  const spaceBelow = stageHeight - (anchor.top + anchor.height) - EDGE
  const placeBelow = spaceBelow >= floatingHeight + BUBBLE_GAP
  const rawTop = placeBelow
    ? anchor.top + anchor.height + BUBBLE_GAP
    : anchor.top - floatingHeight - BUBBLE_GAP
  // Anchor like a tooltip under/above the highlight.
  const rawLeft = anchor.left

  const bubbleLeft = clamp(rawLeft, EDGE, Math.max(EDGE, stageWidth - floatingWidth - EDGE))
  const bubbleTop = clamp(rawTop, EDGE, Math.max(EDGE, stageHeight - floatingHeight - EDGE))

  return (
    <section className="document-review-canvas" aria-label="Document review">
      <div className="document-review-stage" ref={stageRef}>
        <PdfViewerPanel
          bodyOverlay={
            shortcutHintOpen && !summaryOpen ? (
              <aside
                aria-label="Keyboard shortcuts: 1 reject, 2 mark for review, 3 approve, up previous occurrence, down next occurrence"
                className={`document-review-shortcut-hint${shortcutHintFading ? " is-fading" : ""}`}
              >
                <div className="document-review-shortcut-hint-group" title="Reject">
                  <kbd>1</kbd>
                  <span>Reject</span>
                </div>
                <div className="document-review-shortcut-hint-group" title="Mark for review">
                  <kbd>2</kbd>
                  <span>Mark</span>
                </div>
                <div className="document-review-shortcut-hint-group" title="Approve">
                  <kbd>3</kbd>
                  <span>Approve</span>
                </div>
                <span aria-hidden="true" className="document-review-shortcut-hint-sep" />
                <div className="document-review-shortcut-hint-group" title="Previous occurrence">
                  <kbd>↑</kbd>
                  <span>Prev</span>
                </div>
                <div className="document-review-shortcut-hint-group" title="Next occurrence">
                  <kbd>↓</kbd>
                  <span>Next</span>
                </div>
                <button
                  aria-label="Dismiss shortcuts"
                  className="document-review-shortcut-hint-close"
                  onClick={() => {
                    setShortcutHintFading(true)
                    window.setTimeout(() => {
                      setShortcutHintOpen(false)
                      setShortcutHintFading(false)
                    }, 320)
                  }}
                  type="button"
                >
                  <X aria-hidden="true" size={12} strokeWidth={2.2} />
                </button>
              </aside>
            ) : null
          }
          canGoNext={activeIndex < occurrences.length - 1}
          canGoPrevious={activeIndex > 0}
          documentName={activeOccurrence.documentName}
          file={file}
          matchIndex={activeIndex}
          matchTotal={occurrences.length}
          onActiveHighlightChange={setHighlightRect}
          onClose={() => undefined}
          onNextMatch={() => goToIndex(activeIndex + 1)}
          onPreviousMatch={() => goToIndex(activeIndex - 1)}
          page={activeOccurrence.page}
          tag={activeOccurrence.tag}
          variant="canvas"
        />

        <div
          className={`document-review-bubble${decisionClass}${bubbleOpen ? " is-expanded" : " is-collapsed"}${placeBelow ? " is-below" : " is-above"}`}
          ref={bubbleRef}
          style={{ left: bubbleLeft, top: bubbleTop }}
        >
          {!bubbleOpen ? (
            <button
              aria-expanded={false}
              aria-label={`${tag}: ${pinLabel}. Open decision`}
              className="document-review-pin"
              onClick={() => setBubbleOpen(true)}
              title={tag}
              type="button"
            >
              {activeDecision === "approved" ? (
                <Check aria-hidden="true" className="document-review-pin-icon" size={13} strokeWidth={2.6} />
              ) : activeDecision === "rejected" ? (
                <X aria-hidden="true" className="document-review-pin-icon" size={13} strokeWidth={2.6} />
              ) : activeDecision === "needs-review" ? (
                <span aria-hidden="true" className="document-review-pin-icon is-mark">?</span>
              ) : null}
              <span className="document-review-pin-tag">{tag}</span>
              <span aria-hidden="true" className="document-review-pin-tail" />
            </button>
          ) : (
            <div
              className="document-review-bubble-row"
              role="group"
              aria-label={`Decide ${tag}`}
            >
              <span className="document-review-bubble-tag">{tag}</span>
              <span aria-hidden="true" className="document-review-bubble-divider" />
              <div className="document-review-bubble-actions">
                <button
                  aria-pressed={activeDecision === "rejected"}
                  className={`document-review-decision is-rejected${activeDecision === "rejected" ? " is-active" : ""}`}
                  onClick={() => handleDecide("rejected")}
                  type="button"
                >
                  {activeDecision === "rejected" ? "Rejected" : "Reject"}
                </button>
                <button
                  aria-pressed={activeDecision === "needs-review"}
                  className={`document-review-decision is-needs-review${activeDecision === "needs-review" ? " is-active" : ""}`}
                  onClick={() => handleDecide("needs-review")}
                  type="button"
                >
                  {activeDecision === "needs-review" ? "Marked for review" : "Mark for review"}
                </button>
                <button
                  aria-pressed={activeDecision === "approved"}
                  className={`document-review-decision is-approved${activeDecision === "approved" ? " is-active" : ""}`}
                  onClick={() => handleDecide("approved")}
                  type="button"
                >
                  {activeDecision === "approved" ? "Approved" : "Approve"}
                </button>
              </div>
              <button
                aria-label="Collapse decision bubble"
                className="document-review-bubble-close"
                onClick={() => setBubbleOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={14} strokeWidth={2.2} />
              </button>
            </div>
          )}
        </div>
      </div>

      {summaryOpen && (
        <ReviewSummaryDialog
          activeKey={activeOccurrence.key}
          decisions={job.decisions}
          exportRows={exportRows}
          jobName={jobName}
          occurrences={occurrences}
          onClose={() => onSummaryOpenChange(false)}
          onDecideMany={onDecideMany}
          onExported={onMarkExported}
          onSelectOccurrence={(index) => {
            goToIndex(index)
            onSummaryOpenChange(false)
          }}
        />
      )}
    </section>
  )
}
