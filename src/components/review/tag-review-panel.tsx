import { useEffect, useMemo, useState } from "react"
import { Circle, CircleCheck, Eye } from "lucide-react"

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

  if (groups.length === 0) {
    return <p className="tag-review-empty">No tags extracted yet.</p>
  }

  return (
    <div className={`tag-review tag-review-${variant}`}>
      {variant === "sidebar" ? (
        <aside aria-label="Extracted tags" className="tag-review-nav">
          <p className="tag-review-nav-label">Tags</p>
          <ul className="tag-review-nav-list">
            {groups.map((group) => {
              const occs = occurrencesByTag.get(group.tag.toUpperCase()) ?? []
              const progress = tagProgress(occs, decisions)
              const isComplete = progress.total > 0 && progress.resolved === progress.total
              const isActive = selectedGroup?.tag === group.tag

              return (
                <li key={group.tag}>
                  <button
                    aria-current={isActive ? "true" : undefined}
                    className={`tag-review-nav-item${isActive ? " is-active" : ""}${isComplete ? " is-complete" : ""}`}
                    onClick={() => selectTag(group.tag)}
                    title={isComplete ? "All occurrences reviewed" : undefined}
                    type="button"
                  >
                    {isComplete ? (
                      <CircleCheck
                        aria-label="All occurrences reviewed"
                        className="tag-review-nav-icon is-complete"
                        size={15}
                        strokeWidth={2.2}
                      />
                    ) : (
                      <Circle
                        aria-hidden="true"
                        className="tag-review-nav-icon is-pending"
                        size={15}
                        strokeWidth={1.75}
                      />
                    )}
                    <strong className="tag-review-nav-title">{group.tag}</strong>
                  </button>
                </li>
              )
            })}
          </ul>
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
              <div>
                <h3>{selectedGroup.tag}</h3>
                <p>
                  {pluralize(selectedGroup.occurrences, "occurrence")}
                  <span aria-hidden="true"> · </span>
                  {pluralize(selectedGroup.documents.length, "file")}
                </p>
              </div>
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
                              <strong>Page {occurrence.page}</strong>
                            </div>
                            <div className="tag-review-occurrence-meta">
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
                          <div className="tag-review-occurrence-actions">
                            {decisionStyle === "chip" && decision && (
                              <span className={`tag-decision-chip is-${decision}`}>
                                {DECISION_LABELS[decision]}
                              </span>
                            )}
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
