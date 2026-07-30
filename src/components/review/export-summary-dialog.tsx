import { useEffect, useId, useMemo, useState } from "react"
import { createPortal } from "react-dom"

import {
  downloadReviewWorkbook,
  type ReviewExportRow,
} from "@/lib/export-review"

type ExportSummaryDialogProps = {
  jobName: string
  rows: ReviewExportRow[]
  onClose: () => void
}

export function ExportSummaryDialog({
  jobName,
  rows,
  onClose,
}: ExportSummaryDialogProps) {
  const titleId = useId()
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const summary = useMemo(() => {
    const approved = rows.filter((row) => row.status === "Approved").length
    const documents = new Set(rows.map((row) => row.document)).size
    const tags = new Set(rows.map((row) => row.tag.toUpperCase())).size
    return { approved, rejected: rows.length - approved, documents, tags }
  }, [rows])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isDownloading) onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isDownloading, onClose])

  async function download() {
    setIsDownloading(true)
    setDownloadError(null)
    try {
      await downloadReviewWorkbook(jobName, rows)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to create the Excel file.")
    } finally {
      setIsDownloading(false)
    }
  }

  return createPortal(
    <div className="confirm-dialog-scrim export-summary-scrim" role="presentation">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="export-summary-dialog"
        role="dialog"
      >
        <header className="export-summary-header">
          <div>
            <h2 id={titleId}>Export summary</h2>
            <p>Preview the completed findings before downloading the Excel file.</p>
          </div>
          <button
            aria-label="Close export summary"
            className="export-summary-close"
            disabled={isDownloading}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="export-summary-stats" aria-label="Review summary">
          <span><strong>{summary.tags}</strong> Tags</span>
          <span><strong>{summary.documents}</strong> Documents</span>
          <span><strong>{summary.approved}</strong> Approved</span>
          <span><strong>{summary.rejected}</strong> Rejected</span>
        </div>

        <div className="export-summary-table-wrap">
          <table className="export-summary-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Document</th>
                <th>Page</th>
                <th>Occurrence</th>
                <th>Confidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.tag}-${row.document}-${row.page}-${index}`}>
                  <td>{row.tag}</td>
                  <td>{row.document}</td>
                  <td>{row.page}</td>
                  <td>{row.occurrence}</td>
                  <td>{row.confidence}%</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {downloadError && <p className="export-summary-error" role="alert">{downloadError}</p>}

        <footer className="export-summary-actions">
          <button className="secondary-button" disabled={isDownloading} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={isDownloading || rows.length === 0}
            onClick={() => void download()}
            type="button"
          >
            {isDownloading ? "Preparing Excel…" : "Download Excel"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
