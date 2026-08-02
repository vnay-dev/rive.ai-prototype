import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { History } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  buildJobHistoryEvents,
  formatJobTimestampParts,
  getJobDetailsStatusLabel,
  getJobExtractedTagCount,
  getJobSidebarStatus,
  type RuntimeReviewJob,
} from "@/lib/review-jobs"

type JobHistoryDialogProps = {
  job: RuntimeReviewJob
  onClose: () => void
}

function JobTimestamp({ value }: { value: number }) {
  const { datePart, timePart } = formatJobTimestampParts(value)
  return (
    <>
      {datePart}
      <span aria-hidden="true" className="job-timestamp-sep">•</span>
      {timePart}
    </>
  )
}

export function JobHistoryDialog({ job, onClose }: JobHistoryDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const history = buildJobHistoryEvents(job)
  const statusLabel = getJobDetailsStatusLabel(job)
  const status = getJobSidebarStatus(job)
  const tagsExtracted = getJobExtractedTagCount(job)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

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
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="job-history-header">
          <div className="job-history-heading">
            <p className="job-history-eyebrow">Review job details</p>
            <h2 id={titleId} title={job.name}>{job.name}</h2>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="Close job details"
                className="export-summary-close"
                onClick={onClose}
                type="button"
              >
                ×
              </button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        </header>

        <div className="job-history-body">
          <section aria-label="Basic info" className="job-history-info">
            <dl className="job-history-meta">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`job-status-tag is-${status}`}>{statusLabel}</span>
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd><JobTimestamp value={job.createdAt} /></dd>
              </div>
              <div>
                <dt>Last Updated</dt>
                <dd><JobTimestamp value={job.updatedAt} /></dd>
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
          </section>

          <div aria-hidden="true" className="job-history-divider" />

          <section aria-label="Activity timeline" className="job-history-timeline">
            <h3>
              <History aria-hidden="true" size={14} strokeWidth={2} />
              Activity timeline
            </h3>
            <ol>
              {history.map((event, index) => (
                <li
                  className={index === history.length - 1 ? "is-latest" : undefined}
                  key={`${event.label}-${event.at}`}
                >
                  <span className="job-history-dot" aria-hidden="true" />
                  <div>
                    <time dateTime={new Date(event.at).toISOString()}>
                      <JobTimestamp value={event.at} />
                    </time>
                    <strong>{event.label}</strong>
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
