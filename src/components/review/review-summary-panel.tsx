import { useMemo } from "react"

import type { ReviewExportRow } from "@/lib/export-review"
import type { TagGroup } from "@/lib/review"

type ReviewSummaryPanelProps = {
  rows: ReviewExportRow[]
  tagGroups: TagGroup[]
}

function pluralize(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

export function ReviewSummaryPanel({ rows, tagGroups }: ReviewSummaryPanelProps) {
  const summary = useMemo(() => {
    const approved = rows.filter((row) => row.status === "Approved").length
    const documents = new Set(rows.map((row) => row.document)).size
    const tags = new Set(rows.map((row) => row.tag.toUpperCase())).size
    const occurrences = rows.reduce((total, row) => total + row.occurrence, 0)
    return {
      approved,
      rejected: rows.length - approved,
      documents,
      tags,
      occurrences,
      progress: rows.length === 0 ? 0 : 100,
    }
  }, [rows])

  const documentRows = useMemo(() => {
    return tagGroups.flatMap((group) =>
      group.documents.map((document) => {
        const matching = rows.filter(
          (row) =>
            row.tag.toUpperCase() === group.tag.toUpperCase()
            && row.document === document.name,
        )
        const approved = matching.filter((row) => row.status === "Approved").length
        const rejected = matching.length - approved
        let status = "—"
        if (matching.length > 0) {
          if (rejected === 0) status = "Approved"
          else if (approved === 0) status = "Rejected"
          else status = "Mixed"
        }
        return {
          key: `${group.tag}::${document.name}`,
          tag: group.tag,
          document: document.name,
          occurrences: document.occurrences,
          pages: document.pages.length,
          status,
        }
      }),
    )
  }, [rows, tagGroups])

  return (
    <section className="review-summary" aria-label="Review summary">
      <div className="review-summary-stats" aria-label="Completion metrics">
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
        <div className="review-summary-panel-header">
          <h3>Findings by document</h3>
          <p>
            {pluralize(summary.occurrences, "occurrence")} across{" "}
            {pluralize(summary.documents, "document")}
          </p>
        </div>

        <div className="review-summary-table-wrap">
          <table className="review-summary-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Document</th>
                <th>Occurrences</th>
                <th>Pages</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {documentRows.length > 0 ? (
                documentRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.tag}</td>
                    <td title={row.document}>{row.document}</td>
                    <td>{row.occurrences}</td>
                    <td>{row.pages}</td>
                    <td>
                      {row.status === "—" ? (
                        row.status
                      ) : (
                        <span
                          className={`tag-decision-chip is-${
                            row.status === "Mixed" ? "mixed" : row.status.toLowerCase()
                          }`}
                        >
                          {row.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No validated findings to summarise.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
