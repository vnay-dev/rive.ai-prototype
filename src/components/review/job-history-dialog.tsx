import { useEffect, useId } from "react"
import { createPortal } from "react-dom"

import {
  buildJobHistoryEvents,
  formatJobTimestamp,
  getJobDetailsStatusLabel,
  getJobExtractedTagCount,
  getJobSidebarStatus,
  type RuntimeReviewJob,
} from "@/lib/review-jobs"

type JobHistoryDialogProps = {
  job: RuntimeReviewJob
  onClose: () => void
}

export function JobHistoryDialog({ job, onClose }: JobHistoryDialogProps) {
  const titleId = useId()
  const history = buildJobHistoryEvents(job)
  const statusLabel = getJobDetailsStatusLabel(job)
  const status = getJobSidebarStatus(job)
  const tagsExtracted = getJobExtractedTagCount(job)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  return createPortal(
    <div className="confirm-dialog-scrim job-history-scrim" role="presentation">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="job-history-dialog"
        role="dialog"
      >
        <header className="job-history-header">
          <div className="job-history-heading">
            <p className="job-history-eyebrow">Job details</p>
            <h2 id={titleId} title={job.name}>{job.name}</h2>
          </div>
          <button
            aria-label="Close job details"
            autoFocus
            className="export-summary-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="job-history-body">
          <dl className="job-history-meta">
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`job-status-tag is-${status}`}>{statusLabel}</span>
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatJobTimestamp(job.createdAt)}</dd>
            </div>
            <div>
              <dt>Last Updated</dt>
              <dd>{formatJobTimestamp(job.updatedAt)}</dd>
            </div>
            <div>
              <dt>Documents</dt>
              <dd>{job.items.length}</dd>
            </div>
            <div>
              <dt>Tags Extracted</dt>
              <dd>{tagsExtracted}</dd>
            </div>
          </dl>

          <section aria-label="History" className="job-history-timeline">
            <h3>History</h3>
            <ol>
              {history.map((event, index) => (
                <li
                  className={index === history.length - 1 ? "is-latest" : undefined}
                  key={`${event.label}-${event.at}`}
                >
                  <span className="job-history-dot" aria-hidden="true" />
                  <div>
                    <strong>{event.label}</strong>
                    <time dateTime={new Date(event.at).toISOString()}>
                      {formatJobTimestamp(event.at)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
