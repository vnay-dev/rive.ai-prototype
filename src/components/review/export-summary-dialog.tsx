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
  onExported?: () => void
}

export function ExportSummaryDialog({
  jobName,
  rows,
  onClose,
  onExported,
}: ExportSummaryDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const summary = useMemo(() => {
    const approved = rows.filter((row) => row.status === "Approved").length
    return {
      approved,
      rejected: rows.length - approved,
      tags: new Set(rows.map((row) => row.tag.toUpperCase())).size,
    }
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
      onExported?.()
      onClose()
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Unable to create the Excel file.")
    } finally {
      setIsDownloading(false)
    }
  }

  return createPortal(
    <div className="confirm-dialog-scrim export-summary-scrim" role="presentation">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="export-results-dialog"
        role="dialog"
      >
        <header className="export-results-header">
          <div>
            <h2 id={titleId}>Export results</h2>
            <p id={descriptionId}>
              Download an Excel workbook with the validated findings from this review.
            </p>
          </div>
          <button
            aria-label="Close export dialog"
            className="export-summary-close"
            disabled={isDownloading}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <p className="export-results-meta" aria-label="Export contents">
          <span>{summary.tags} {summary.tags === 1 ? "tag" : "tags"}</span>
          <span aria-hidden="true">·</span>
          <span>{summary.approved} approved</span>
          <span aria-hidden="true">·</span>
          <span>{summary.rejected} rejected</span>
        </p>

        {downloadError && <p className="export-results-error" role="alert">{downloadError}</p>}

        <footer className="export-results-actions">
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
