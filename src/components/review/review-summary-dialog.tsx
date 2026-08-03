import { useId, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

import { ExportMenu } from "@/components/review/export-menu"
import { useModalFocus } from "@/hooks/use-modal-focus"
import type { ReviewExportRow } from "@/lib/export-review"
import type { TagDecision, TagOccurrence } from "@/lib/review"

type ReviewSummaryDialogProps = {
  jobName: string
  occurrences: TagOccurrence[]
  decisions: Record<string, TagDecision>
  activeKey?: string
  exportRows: ReviewExportRow[]
  onClose: () => void
  onSelectOccurrence: (index: number) => void
  onExported: () => void
}

function statusLabel(decision: TagDecision | undefined) {
  if (decision === "approved") return "Approved"
  if (decision === "rejected") return "Rejected"
  if (decision === "needs-review") return "Needs review"
  return "Open"
}

export function ReviewSummaryDialog({
  jobName,
  occurrences,
  decisions,
  activeKey,
  exportRows,
  onClose,
  onSelectOccurrence,
  onExported,
}: ReviewSummaryDialogProps) {
  const dialogId = useId()
  const titleId = `${dialogId}-title`
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useModalFocus({
    containerRef: dialogRef,
    initialFocusRef: closeRef,
    onEscape: onClose,
  })

  const counts = useMemo(() => {
    let approved = 0
    let rejected = 0
    let needsReview = 0
    let open = 0
    for (const occurrence of occurrences) {
      const decision = decisions[occurrence.key]
      if (decision === "approved") approved += 1
      else if (decision === "rejected") rejected += 1
      else if (decision === "needs-review") needsReview += 1
      else open += 1
    }
    return {
      approved,
      rejected,
      needsReview,
      open,
      decided: occurrences.length - open,
      total: occurrences.length,
    }
  }, [decisions, occurrences])

  const tableRows = useMemo(
    () => occurrences
      .map((occurrence, index) => ({ occurrence, index }))
      .filter(({ occurrence }) => Boolean(decisions[occurrence.key])),
    [decisions, occurrences],
  )

  return createPortal(
    <div
      className="review-summary-dialog-scrim"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="review-summary-dialog"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header className="review-summary-dialog-header">
          <div>
            <h2 id={titleId}>Summary</h2>
            <p className="review-summary-dialog-lede">
              {counts.decided} of {counts.total} occurrences reviewed
            </p>
          </div>
          <button
            aria-label="Close summary"
            className="review-summary-dialog-close"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden="true" size={16} strokeWidth={2} />
          </button>
        </header>

        <div className="review-summary-dialog-stats" aria-label="Decision counts">
          <span>
            <strong>{counts.approved}</strong>
            Approved
          </span>
          <span>
            <strong>{counts.rejected}</strong>
            Rejected
          </span>
          <span>
            <strong>{counts.needsReview}</strong>
            Needs review
          </span>
          <span>
            <strong>{counts.open}</strong>
            Open
          </span>
        </div>

        <div className="review-summary-dialog-body">
          <table className="review-summary-dialog-table">
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Document</th>
                <th scope="col">Page</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td className="review-summary-dialog-empty" colSpan={4}>
                    No reviewed occurrences yet
                  </td>
                </tr>
              ) : (
                tableRows.map(({ occurrence, index }) => {
                  const decision = decisions[occurrence.key]
                  return (
                    <tr
                      className={occurrence.key === activeKey ? "is-active" : undefined}
                      key={occurrence.key}
                    >
                      <td>
                        <button
                          className="review-summary-dialog-tag"
                          onClick={() => onSelectOccurrence(index)}
                          type="button"
                        >
                          {occurrence.tag}
                        </button>
                      </td>
                      <td title={occurrence.documentName}>{occurrence.documentName}</td>
                      <td>{occurrence.page}</td>
                      <td>
                        <span className={`review-summary-dialog-status${decision ? ` is-${decision}` : ""}`}>
                          {statusLabel(decision)}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <footer className="review-summary-dialog-footer">
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <ExportMenu
            jobName={jobName}
            onExported={onExported}
            rows={exportRows}
          />
        </footer>
      </div>
    </div>,
    document.body,
  )
}
