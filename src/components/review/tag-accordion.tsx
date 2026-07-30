import { ChevronDown, Eye } from "lucide-react"

import type { TagGroup } from "@/lib/review"

export type TagDecision = "approved" | "rejected" | "needs-review"

const DECISION_LABELS: Record<TagDecision, string> = {
  approved: "Approved",
  rejected: "Rejected",
  "needs-review": "Needs review",
}

type TagAccordionProps = {
  groups: TagGroup[]
  decisions: Record<string, TagDecision>
  expandedTags: string[]
  activeOccurrence?: { tag: string; documentName: string } | null
  onToggle: (tag: string) => void
  onDecide: (tag: string, decision: TagDecision) => void
  onViewOccurrence: (tag: string, documentName: string) => void
}

function pluralize(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

function tagPanelId(tag: string) {
  return `tag-panel-${tag.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`
}

export function TagAccordion({
  groups,
  decisions,
  expandedTags,
  activeOccurrence,
  onToggle,
  onDecide,
  onViewOccurrence,
}: TagAccordionProps) {
  return (
    <ul className="tag-accordion">
      {groups.map((group) => {
        const isOpen = expandedTags.includes(group.tag)
        const decision = decisions[group.tag]
        const panelId = tagPanelId(group.tag)

        return (
          <li
            className={`tag-accordion-item${isOpen ? " is-open" : ""}${decision ? ` is-${decision}` : ""}`}
            key={group.tag}
          >
            <button
              aria-controls={panelId}
              aria-expanded={isOpen}
              className="tag-accordion-trigger"
              onClick={() => onToggle(group.tag)}
              type="button"
            >
              <span className="tag-accordion-title">
                {group.tag}
                <span className="tag-accordion-confidence">({Math.round(group.confidence * 100)}%)</span>
              </span>
              {decision && (
                <span className={`tag-decision-chip is-${decision}`}>
                  {DECISION_LABELS[decision]}
                </span>
              )}
              {!isOpen && (
                <span className="tag-accordion-meta">
                  {pluralize(group.occurrences, "occurrence")}
                  <span aria-hidden="true">·</span>
                  {pluralize(group.documents.length, "file")}
                </span>
              )}
              <ChevronDown aria-hidden="true" className="tag-accordion-chevron" size={16} strokeWidth={2} />
            </button>

            {isOpen && (
              <div className="tag-accordion-panel" id={panelId} role="region">
                <p className="tag-accordion-panel-summary">
                  {pluralize(group.documents.length, "document")}
                  <span aria-hidden="true">•</span>
                  {pluralize(group.occurrences, "occurrence")}
                </p>

                <ul className="tag-occurrence-list">
                  {group.documents.map((document) => {
                    const isActive = activeOccurrence?.tag === group.tag
                      && activeOccurrence?.documentName === document.name

                    return (
                      <li className={`tag-occurrence${isActive ? " is-active" : ""}`} key={document.name}>
                        <span className="tag-occurrence-name" title={document.name}>{document.name}</span>
                        <span className="tag-occurrence-count">
                          {pluralize(document.occurrences, "occurrence")}
                        </span>
                        <button
                          className="tag-occurrence-view"
                          onClick={() => onViewOccurrence(group.tag, document.name)}
                          type="button"
                        >
                          <Eye aria-hidden="true" size={14} strokeWidth={1.9} />
                          View
                        </button>
                      </li>
                    )
                  })}
                </ul>

                <div className="tag-accordion-actions">
                  <button
                    className="secondary-button"
                    onClick={() => onDecide(group.tag, "rejected")}
                    type="button"
                  >
                    {decision === "rejected" ? "Rejected" : "Reject"}
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => onDecide(group.tag, "needs-review")}
                    type="button"
                  >
                    Needs review
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => onDecide(group.tag, "approved")}
                    type="button"
                  >
                    {decision === "approved" ? "Approved" : "Approve"}
                  </button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
