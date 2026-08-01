import { useEffect, useMemo, useState } from "react"
import { Check, Circle, CircleAlert, Eye, X } from "lucide-react"

import { useSidebarActiveIndicator } from "@/hooks/use-sidebar-active-indicator"
import {
  flattenTagOccurrences,
  type TagGroup,
  type TagOccurrence,
  type TagDecision,
} from "@/lib/review"
import { isResolvedTagDecision, type ReviewViewerTarget } from "@/lib/review-jobs"

export type { TagDecision }

export type TagReviewVariant = "sidebar" | "pills"
export type DecisionStatusStyle = "chip" | "button"

const DECISION_LABELS: Record<TagDecision, string> = {
  approved: "Approved",
  rejected: "Rejected",
  "needs-review": "Needs review",
}

/** Matches `.tag-review { max-height: min(640px, calc(100dvh - 220px)) }`. */
const TAG_REVIEW_VIEWPORT_OFFSET_PX = 220
const TAG_REVIEW_ABSOLUTE_MAX_PX = 640

/** Layout constants aligned to current tag-review CSS for session height precalc. */
const DETAIL_HEADER_PX = 56
const DOCUMENTS_PADDING_PX = 48
const DOCUMENT_GAP_PX = 24
const DOCUMENT_HEADER_PX = 40
const OCCURRENCE_ROW_PX = 74
const NAV_LIST_PADDING_PX = 20
const NAV_ITEM_PX = 36
const NAV_ITEM_GAP_PX = 6
/** Extra space so the densest tag view doesn't sit flush against the panel edge. */
const SESSION_HEIGHT_BREATHING_PX = 28

type TagReviewPanelProps = {
  variant: TagReviewVariant
  decisionStyle?: DecisionStatusStyle
  groups: TagGroup[]
  fallbackDocument: string
  review: import("@/lib/review").ReviewResult
  decisions: Record<string, TagDecision>
  activeOccurrence?: ReviewViewerTarget | null
  onDecide: (occurrenceKey: string, decision: TagDecision) => void
  onViewOccurrence: (target: ReviewViewerTarget) => void
}

function pluralize(count: number, singular: string) {
  if (count === 1) return `${count} ${singular}`
  const plural = /(?:s|x|z|ch|sh)$/i.test(singular) ? `${singular}es` : `${singular}s`
  return `${count} ${plural}`
}

function tagProgress(
  occurrences: TagOccurrence[],
  decisions: Record<string, TagDecision>,
) {
  const resolved = occurrences.filter((entry) => isResolvedTagDecision(decisions[entry.key])).length
  return { resolved, total: occurrences.length }
}

function occurrenceMatches(target: ReviewViewerTarget | null | undefined, occurrence: TagOccurrence) {
  if (!target) return false
  return target.tag === occurrence.tag
    && target.documentName === occurrence.documentName
    && target.page === occurrence.page
}

function groupOccurrencesByDocument(occurrences: TagOccurrence[]) {
  const map = new Map<string, TagOccurrence[]>()
  for (const occurrence of occurrences) {
    const list = map.get(occurrence.documentName) ?? []
    list.push(occurrence)
    map.set(occurrence.documentName, list)
  }
  return [...map.values()]
}

function estimateDetailHeight(documentGroups: TagOccurrence[][]) {
  if (documentGroups.length === 0) return DETAIL_HEADER_PX + DOCUMENTS_PADDING_PX

  let height = DETAIL_HEADER_PX + DOCUMENTS_PADDING_PX
  documentGroups.forEach((entries, index) => {
    if (index > 0) height += DOCUMENT_GAP_PX
    height += DOCUMENT_HEADER_PX + entries.length * OCCURRENCE_ROW_PX
  })
  return height
}

function estimateNavHeight(tagCount: number) {
  if (tagCount <= 0) return DETAIL_HEADER_PX + NAV_LIST_PADDING_PX
  return DETAIL_HEADER_PX
    + NAV_LIST_PADDING_PX
    + tagCount * NAV_ITEM_PX
    + Math.max(0, tagCount - 1) * NAV_ITEM_GAP_PX
}

function getTagReviewViewportMax() {
  if (typeof window === "undefined") return TAG_REVIEW_ABSOLUTE_MAX_PX
  return Math.min(TAG_REVIEW_ABSOLUTE_MAX_PX, window.innerHeight - TAG_REVIEW_VIEWPORT_OFFSET_PX)
}

export function TagReviewPanel({
  variant,
  decisionStyle = "chip",
  groups,
  fallbackDocument,
  review,
  decisions,
  activeOccurrence,
  onDecide,
  onViewOccurrence,
}: TagReviewPanelProps) {
  const allOccurrences = useMemo(
    () => flattenTagOccurrences(review, fallbackDocument),
    [review, fallbackDocument],
  )

  const occurrencesByTag = useMemo(() => {
    const map = new Map<string, TagOccurrence[]>()
    for (const occurrence of allOccurrences) {
      const key = occurrence.tag.toUpperCase()
      const list = map.get(key) ?? []
      list.push(occurrence)
      map.set(key, list)
    }
    return map
  }, [allOccurrences])

  const [selectedTag, setSelectedTag] = useState(groups[0]?.tag ?? "")

  useEffect(() => {
    if (groups.length === 0) {
      setSelectedTag("")
      return
    }
    if (!groups.some((group) => group.tag === selectedTag)) {
      setSelectedTag(groups[0].tag)
    }
  }, [groups, selectedTag])

  useEffect(() => {
    if (!activeOccurrence) return
    if (groups.some((group) => group.tag === activeOccurrence.tag)) {
      setSelectedTag(activeOccurrence.tag)
    }
  }, [activeOccurrence, groups])

  const selectedGroup = groups.find((group) => group.tag === selectedTag) ?? groups[0]
  const selectedOccurrences = selectedGroup
    ? occurrencesByTag.get(selectedGroup.tag.toUpperCase()) ?? []
    : []

  const documents = useMemo(() => {
    const map = new Map<string, TagOccurrence[]>()
    for (const occurrence of selectedOccurrences) {
      const list = map.get(occurrence.documentName) ?? []
      list.push(occurrence)
      map.set(occurrence.documentName, list)
    }
    return [...map.entries()].map(([name, entries]) => ({ name, entries }))
  }, [selectedOccurrences])

  function viewOccurrence(occurrence: TagOccurrence) {
    onViewOccurrence({
      tag: occurrence.tag,
      documentName: occurrence.documentName,
      page: occurrence.page,
    })
  }

  function selectTag(tag: string) {
    if (tag === selectedTag) return
    setSelectedTag(tag)

    if (!activeOccurrence) return

    const nextOccurrence = occurrencesByTag.get(tag.toUpperCase())?.[0]
    if (!nextOccurrence) return
    viewOccurrence(nextOccurrence)
  }

  const { listRef: tagListRef, activeIndicator: tagActiveIndicator } = useSidebarActiveIndicator(
    selectedTag,
    groups.length,
    groups.map((group) => group.tag).join("|"),
  )

  const [viewportMax, setViewportMax] = useState(getTagReviewViewportMax)

  useEffect(() => {
    function syncViewportMax() {
      setViewportMax(getTagReviewViewportMax())
    }

    syncViewportMax()
    window.addEventListener("resize", syncViewportMax)
    return () => window.removeEventListener("resize", syncViewportMax)
  }, [])

  /** Stable panel height for this review session — sized for the densest tag view, capped by max-height. */
  const sessionPanelHeight = useMemo(() => {
    const navHeight = estimateNavHeight(groups.length)
    let densestDetailHeight = 0

    for (const group of groups) {
      const occurrences = occurrencesByTag.get(group.tag.toUpperCase()) ?? []
      densestDetailHeight = Math.max(
        densestDetailHeight,
        estimateDetailHeight(groupOccurrencesByDocument(occurrences)),
      )
    }

    const contentHeight = Math.max(navHeight, densestDetailHeight, DETAIL_HEADER_PX + DOCUMENTS_PADDING_PX)
      + SESSION_HEIGHT_BREATHING_PX
    return Math.min(viewportMax, contentHeight)
  }, [groups, occurrencesByTag, viewportMax])

  if (groups.length === 0) {
    return <p className="tag-review-empty">No tags extracted yet.</p>
  }

  return (
    <div
      className={`tag-review tag-review-${variant}`}
      style={variant === "sidebar" ? { height: sessionPanelHeight } : undefined}
    >
      {variant === "sidebar" ? (
        <aside aria-label="Extracted tags" className="tag-review-nav">
          <div className="tag-review-nav-header">
            <p className="sidebar-label">Extracted tags</p>
          </div>
          <div className="sidebar-job-list" ref={tagListRef}>
            <div
              aria-hidden="true"
              className={[
                "sidebar-job-active-indicator",
                tagActiveIndicator.visible ? "is-visible" : "",
                tagActiveIndicator.animated ? "is-animated" : "",
              ].filter(Boolean).join(" ")}
              style={{
                transform: `translate3d(0, ${tagActiveIndicator.top}px, 0)`,
                height: tagActiveIndicator.height,
              }}
            />
            {groups.map((group) => {
              const occs = occurrencesByTag.get(group.tag.toUpperCase()) ?? []
              const progress = tagProgress(occs, decisions)
              const isComplete = progress.total > 0 && progress.resolved === progress.total
              const isActive = selectedGroup?.tag === group.tag

              return (
                <div
                  className={`sidebar-job${isActive ? " is-active" : ""}`}
                  key={group.tag}
                >
                  <button
                    aria-current={isActive ? "true" : undefined}
                    className="sidebar-job-select"
                    onClick={() => selectTag(group.tag)}
                    title={isComplete ? "All occurrences reviewed" : undefined}
                    type="button"
                  >
                    {isComplete ? (
                      <span aria-label="All occurrences reviewed" className="sidebar-job-icon is-completed">
                        <Check aria-hidden="true" size={14} strokeWidth={2.4} />
                      </span>
                    ) : (
                      <span aria-hidden="true" className="sidebar-job-icon is-ready">
                        <Circle size={14} strokeWidth={2.2} />
                      </span>
                    )}
                    <span className="sidebar-job-text">{group.tag}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </aside>
      ) : (
        <div aria-label="Extracted tags" className="tag-review-pills-wrap">
          <div className="tag-review-pill-track">
            {groups.map((group) => {
              const occs = occurrencesByTag.get(group.tag.toUpperCase()) ?? []
              const progress = tagProgress(occs, decisions)
              const isActive = selectedGroup?.tag === group.tag

              return (
                <button
                  aria-current={isActive ? "true" : undefined}
                  className={`tag-review-pill${isActive ? " is-active" : ""}`}
                  key={group.tag}
                  onClick={() => selectTag(group.tag)}
                  type="button"
                >
                  <span className="tag-review-pill-label">{group.tag}</span>
                  <span className="tag-review-pill-meta">
                    {progress.resolved}/{progress.total}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="tag-review-detail">
        {selectedGroup && (
          <>
            <header className="tag-review-detail-header">
              <h3>{selectedGroup.tag}</h3>
              <p>
                {pluralize(selectedGroup.occurrences, "occurrence")}
                <span aria-hidden="true"> · </span>
                {pluralize(selectedGroup.documents.length, "file")}
              </p>
            </header>

            <div className="tag-review-documents">
              {documents.map((document) => {
                const hasActiveOccurrence = document.entries.some((occurrence) => (
                  occurrenceMatches(activeOccurrence, occurrence)
                ))

                return (
                <section
                  className={`tag-review-document${hasActiveOccurrence ? " is-active" : ""}`}
                  key={document.name}
                >
                  <div className="tag-review-document-header">
                    <div className="tag-review-document-title">
                      <strong title={document.name}>{document.name}</strong>
                      <span>{pluralize(document.entries.length, "occurrence")}</span>
                    </div>
                  </div>

                  <ul className="tag-review-occurrence-list">
                    {document.entries.map((occurrence) => {
                      const decision = decisions[occurrence.key]
                      const isActive = occurrenceMatches(activeOccurrence, occurrence)

                      return (
                        <li
                          className={`tag-review-occurrence${isActive ? " is-active" : ""}`}
                          key={occurrence.key}
                        >
                          <div className="tag-review-occurrence-info">
                            <div className="tag-review-occurrence-title">
                              <span className="tag-review-occurrence-tag">{occurrence.tag}</span>
                            </div>
                            <div className="tag-review-occurrence-meta">
                              <span>Page {occurrence.page}</span>
                              <span aria-hidden="true" className="tag-review-occurrence-sep" />
                              <span>{pluralize(occurrence.occurrences, "match")}</span>
                              <span aria-hidden="true" className="tag-review-occurrence-sep" />
                              <button
                                className="tertiary-button tag-occurrence-view"
                                onClick={() => viewOccurrence(occurrence)}
                                type="button"
                              >
                                <Eye aria-hidden="true" size={14} strokeWidth={1.9} />
                                View
                              </button>
                            </div>
                          </div>
                          <div className="tag-review-occurrence-status">
                            {decisionStyle === "chip" && decision ? (
                              <span className={`tag-decision-chip is-${decision}`}>
                                {decision === "approved" && (
                                  <Check aria-hidden="true" size={12} strokeWidth={2.4} />
                                )}
                                {decision === "rejected" && (
                                  <X aria-hidden="true" size={12} strokeWidth={2.4} />
                                )}
                                {decision === "needs-review" && (
                                  <CircleAlert aria-hidden="true" size={12} strokeWidth={2.4} />
                                )}
                                {DECISION_LABELS[decision]}
                              </span>
                            ) : null}
                          </div>
                          <div className="tag-review-occurrence-actions">
                            <button
                              className={`secondary-button${
                                decision === "rejected"
                                  ? ` is-selected${decisionStyle === "button" ? " is-rejected" : ""}`
                                  : ""
                              }`}
                              onClick={() => onDecide(occurrence.key, "rejected")}
                              type="button"
                            >
                              {decisionStyle === "button" && decision === "rejected"
                                ? "Rejected"
                                : "Reject"}
                            </button>
                            <button
                              className={`tertiary-button${
                                decision === "needs-review"
                                  ? ` is-selected${decisionStyle === "button" ? " is-needs-review" : ""}`
                                  : ""
                              }`}
                              onClick={() => onDecide(occurrence.key, "needs-review")}
                              type="button"
                            >
                              Needs review
                            </button>
                            <button
                              className={`primary-button${
                                decision === "approved"
                                  ? ` is-selected${decisionStyle === "button" ? " is-approved" : ""}`
                                  : ""
                              }`}
                              onClick={() => onDecide(occurrence.key, "approved")}
                              type="button"
                            >
                              {decisionStyle === "button" && decision === "approved"
                                ? "Approved"
                                : "Approve"}
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </section>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
