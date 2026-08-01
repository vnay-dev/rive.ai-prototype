import { useMemo } from "react"
import { Check, X } from "lucide-react"

import type { ReviewExportRow } from "@/lib/export-review"
import type { TagGroup } from "@/lib/review"

type ReviewSummaryPanelProps = {
  rows: ReviewExportRow[]
  tagGroups: TagGroup[]
}

type TagFindingRow = {
  tag: string
  documents: number
  occurrences: number
  approved: number
  rejected: number
}

function TagStatusCell({ approved, rejected }: { approved: number; rejected: number }) {
  if (approved === 0 && rejected === 0) return <>—</>

  if (rejected === 0) {
    return <span className="tag-decision-chip is-approved">Approved</span>
  }

  if (approved === 0) {
    return <span className="tag-decision-chip is-rejected">Rejected</span>
  }

  return (
    <span
      aria-label={`${approved} approved, ${rejected} rejected`}
      className="tag-status-split"
    >
      <span className="tag-status-split-part is-approved">
        <Check aria-hidden="true" size={12} strokeWidth={2.4} />
        <span>{approved}</span>
      </span>
      <span className="tag-status-split-part is-rejected">
        <X aria-hidden="true" size={12} strokeWidth={2.4} />
        <span>{rejected}</span>
      </span>
    </span>
  )
}

export function ReviewSummaryPanel({ rows, tagGroups }: ReviewSummaryPanelProps) {
  const tagRows = useMemo<TagFindingRow[]>(() => {
    return tagGroups.map((group) => {
      const matching = rows.filter(
        (row) => row.tag.toUpperCase() === group.tag.toUpperCase(),
      )
      const approved = matching.filter((row) => row.status === "Approved").length
      const rejected = matching.length - approved
      return {
        tag: group.tag,
        documents: group.documents.length,
        occurrences: group.occurrences,
        approved,
        rejected,
      }
    })
  }, [rows, tagGroups])

  const summary = useMemo(() => {
    const documents = new Set(
      tagGroups.flatMap((group) => group.documents.map((document) => document.name)),
    ).size
    return {
      tags: tagRows.length,
      documents,
      approved: tagRows.filter((row) => row.approved > 0 && row.rejected === 0).length,
      rejected: tagRows.filter((row) => row.rejected > 0 && row.approved === 0).length,
      progress: rows.length === 0 ? 0 : 100,
    }
  }, [rows.length, tagGroups, tagRows])

  return (
    <section className="review-summary" aria-label="Review summary">
      <div className="summary-stats is-five" aria-label="Completion metrics">
        <span>
          <strong>{summary.tags}</strong>
          Tags identified
        </span>
        <span>
          <strong>{summary.documents}</strong>
          Documents
        </span>
        <span>
          <strong>{summary.approved}</strong>
          Approved
        </span>
        <span>
          <strong>{summary.rejected}</strong>
          Rejected
        </span>
        <span>
          <strong>{summary.progress}%</strong>
          Review progress
        </span>
      </div>

      <div className="review-summary-panel">
        <div className="review-summary-table-wrap">
          <table className="review-summary-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Documents</th>
                <th>Occurrences</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tagRows.length > 0 ? (
                tagRows.map((row) => (
                  <tr key={row.tag}>
                    <td title={row.tag}>{row.tag}</td>
                    <td>{row.documents}</td>
                    <td>{row.occurrences}</td>
                    <td>
                      <TagStatusCell approved={row.approved} rejected={row.rejected} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No validated findings to summarise.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
