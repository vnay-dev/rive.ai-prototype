import { useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowUpRight, Search, X } from "lucide-react"

import { ExportMenu } from "@/components/review/export-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
  onDecideMany: (occurrenceKeys: string[], decision: TagDecision) => void
  onExported: () => void
}

function statusLabel(decision: TagDecision | undefined) {
  if (decision === "approved") return "Approved"
  if (decision === "rejected") return "Rejected"
  if (decision === "needs-review") return "Needs review"
  return "Open"
}

type StatusFilter = "all" | "open" | "needs-review" | "approved" | "rejected"

function statusBucket(decision: TagDecision | undefined): Exclude<StatusFilter, "all"> {
  if (decision === "approved") return "approved"
  if (decision === "rejected") return "rejected"
  if (decision === "needs-review") return "needs-review"
  return "open"
}

/** Bulk only updates Open or Marked — never overwrites Approved/Rejected. */
function isBulkEligible(decision: TagDecision | undefined) {
  return decision !== "approved" && decision !== "rejected"
}

export function ReviewSummaryDialog({
  jobName,
  occurrences,
  decisions,
  activeKey,
  exportRows,
  onClose,
  onSelectOccurrence,
  onDecideMany,
  onExported,
}: ReviewSummaryDialogProps) {
  const dialogId = useId()
  const titleId = `${dialogId}-title`
  const searchId = `${dialogId}-search`
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [pendingBulk, setPendingBulk] = useState<"approved" | "rejected" | null>(null)

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

  const canBulk = counts.open > 0 || counts.needsReview > 0

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return occurrences
      .map((occurrence, index) => ({ occurrence, index }))
      .filter(({ occurrence }) => {
        const decision = decisions[occurrence.key]
        if (statusFilter !== "all" && statusBucket(decision) !== statusFilter) {
          return false
        }
        if (!normalized) return true
        const haystack = [
          occurrence.tag,
          occurrence.documentName,
          String(occurrence.page),
          statusLabel(decision),
        ].join(" ").toLocaleLowerCase()
        return haystack.includes(normalized)
      })
  }, [decisions, occurrences, query, statusFilter])

  const filteredKeys = useMemo(
    () => filteredRows.map(({ occurrence }) => occurrence.key),
    [filteredRows],
  )

  const selectedCount = selectedKeys.size
  const allFilteredSelected = canBulk
    && filteredKeys.length > 0
    && filteredKeys.every((key) => selectedKeys.has(key))
  const someFilteredSelected = canBulk
    && filteredKeys.some((key) => selectedKeys.has(key))

  const eligibleSelectedKeys = useMemo(
    () => [...selectedKeys].filter((key) => isBulkEligible(decisions[key])),
    [decisions, selectedKeys],
  )

  useEffect(() => {
    if (canBulk) return
    setQuery("")
    setSelectedKeys(new Set())
    setPendingBulk(null)
  }, [canBulk])

  useEffect(() => {
    setSelectedKeys((current) => {
      const valid = new Set(occurrences.map((occurrence) => occurrence.key))
      let changed = false
      const next = new Set<string>()
      for (const key of current) {
        if (valid.has(key)) next.add(key)
        else changed = true
      }
      return changed ? next : current
    })
  }, [occurrences])

  function toggleStatusFilter(next: Exclude<StatusFilter, "all">) {
    setStatusFilter((current) => (current === next ? "all" : next))
  }

  function toggleKey(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelectAllFiltered() {
    setSelectedKeys((current) => {
      if (allFilteredSelected) {
        const next = new Set(current)
        for (const key of filteredKeys) next.delete(key)
        return next
      }
      const next = new Set(current)
      for (const key of filteredKeys) next.add(key)
      return next
    })
  }

  function requestBulk(decision: "approved" | "rejected") {
    if (eligibleSelectedKeys.length === 0) return
    setPendingBulk(decision)
  }

  function confirmBulk() {
    if (!pendingBulk || eligibleSelectedKeys.length === 0) {
      setPendingBulk(null)
      return
    }
    onDecideMany(eligibleSelectedKeys, pendingBulk)
    setSelectedKeys(new Set())
    setStatusFilter("all")
    setQuery("")
    setPendingBulk(null)
  }

  const leftoverNote = counts.open > 0
    ? `${counts.open} open — jump back anytime, or continue reviewing.`
    : counts.needsReview > 0
      ? `${counts.needsReview} marked for review — revisit anytime.`
      : null

  const bulkLabel = pendingBulk === "approved" ? "Approve" : "Reject"
  const bulkTone = pendingBulk === "rejected" ? "danger" : "primary"
  const colSpan = canBulk ? 6 : 5

  const statusFilters: Array<{
    id: Exclude<StatusFilter, "all">
    label: string
    count: number
  }> = [
    { id: "approved", label: "Approved", count: counts.approved },
    { id: "rejected", label: "Rejected", count: counts.rejected },
    { id: "needs-review", label: "Needs review", count: counts.needsReview },
    { id: "open", label: "Open", count: counts.open },
  ]

  return createPortal(
    <>
      <div
        className="review-summary-dialog-scrim"
        onClick={onClose}
        role="presentation"
      >
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className={`review-summary-dialog${selectedCount > 0 ? " is-selecting" : ""}`}
          onClick={(event) => event.stopPropagation()}
          ref={dialogRef}
          role="dialog"
        >
          <header className="review-summary-dialog-header">
            <div>
              <h2 id={titleId}>Summary</h2>
              <p className="review-summary-dialog-lede">
                {selectedCount > 0
                  ? `${selectedCount} selected`
                  : (
                    <>
                      {counts.decided} of {counts.total} occurrences reviewed
                      {leftoverNote ? ` · ${leftoverNote}` : ""}
                    </>
                  )}
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

          <div className="review-summary-dialog-stats" aria-label="Filter by status">
            {statusFilters.map((filter) => (
              <button
                aria-pressed={statusFilter === filter.id}
                className={`review-summary-dialog-stat${statusFilter === filter.id ? " is-active" : ""}`}
                key={filter.id}
                onClick={() => toggleStatusFilter(filter.id)}
                type="button"
              >
                <strong>{filter.count}</strong>
                {filter.label}
              </button>
            ))}
          </div>

          {canBulk && (
            <div className="review-summary-dialog-toolbar">
              <label className="review-summary-dialog-search" htmlFor={searchId}>
                <Search aria-hidden="true" size={15} strokeWidth={2.2} />
                <input
                  autoComplete="off"
                  id={searchId}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tags, documents, status…"
                  type="search"
                  value={query}
                />
              </label>
            </div>
          )}

          <div className="review-summary-dialog-body">
            <div className="review-summary-dialog-table-scroll">
              <table className="review-summary-dialog-table">
                <thead>
                  <tr>
                    {canBulk && (
                      <th className="review-summary-dialog-check-cell" scope="col">
                        <input
                          aria-label="Select all filtered findings"
                          checked={allFilteredSelected}
                          disabled={filteredKeys.length === 0}
                          onChange={toggleSelectAllFiltered}
                          ref={(node) => {
                            if (node) {
                              node.indeterminate = someFilteredSelected && !allFilteredSelected
                            }
                          }}
                          type="checkbox"
                        />
                      </th>
                    )}
                    <th scope="col">Tag</th>
                    <th scope="col">Document</th>
                    <th scope="col">Page</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Go to finding</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td className="review-summary-dialog-empty" colSpan={colSpan}>
                        {occurrences.length === 0 ? "No occurrences yet" : "No matching findings"}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map(({ occurrence, index }) => {
                      const decision = decisions[occurrence.key]
                      const isSelected = selectedKeys.has(occurrence.key)
                      return (
                        <tr
                          className={`review-summary-dialog-row${occurrence.key === activeKey ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                          key={occurrence.key}
                        >
                          {canBulk && (
                            <td className="review-summary-dialog-check-cell">
                              <input
                                aria-label={`Select ${occurrence.tag}`}
                                checked={isSelected}
                                onChange={() => toggleKey(occurrence.key)}
                                type="checkbox"
                              />
                            </td>
                          )}
                          <td>
                            <span className="review-summary-dialog-tag">{occurrence.tag}</span>
                          </td>
                          <td title={occurrence.documentName}>{occurrence.documentName}</td>
                          <td>{occurrence.page}</td>
                          <td>
                            <span
                              className={`review-summary-dialog-status${decision ? ` is-${decision}` : " is-open"}`}
                            >
                              {statusLabel(decision)}
                            </span>
                          </td>
                          <td className="review-summary-dialog-jump-cell">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  aria-label={`Go to ${occurrence.tag} on page ${occurrence.page}`}
                                  className="review-summary-dialog-jump"
                                  onClick={() => onSelectOccurrence(index)}
                                  type="button"
                                >
                                  <ArrowUpRight aria-hidden="true" size={15} strokeWidth={2.2} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Go to this finding</TooltipContent>
                            </Tooltip>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="review-summary-dialog-footer">
            {canBulk && selectedCount > 0 ? (
              <>
                <button
                  className="secondary-button"
                  onClick={() => setSelectedKeys(new Set())}
                  type="button"
                >
                  Clear selection
                </button>
                <div className="review-summary-dialog-bulk-actions">
                  <button
                    className="secondary-button"
                    disabled={eligibleSelectedKeys.length === 0}
                    onClick={() => requestBulk("rejected")}
                    type="button"
                  >
                    Bulk reject
                  </button>
                  <button
                    className="primary-button"
                    disabled={eligibleSelectedKeys.length === 0}
                    onClick={() => requestBulk("approved")}
                    type="button"
                  >
                    Bulk approve
                  </button>
                </div>
              </>
            ) : (
              <>
                <button className="secondary-button" onClick={onClose} type="button">
                  Cancel
                </button>
                <ExportMenu
                  jobName={jobName}
                  onExported={onExported}
                  rows={exportRows}
                />
              </>
            )}
          </footer>
        </div>
      </div>

      {pendingBulk && (
        <ConfirmDialog
          cancelLabel="Cancel"
          confirmLabel={bulkLabel}
          confirmTone={bulkTone}
          description={
            eligibleSelectedKeys.length === selectedCount
              ? `${bulkLabel} ${eligibleSelectedKeys.length} selected finding${eligibleSelectedKeys.length === 1 ? "" : "s"}? Already approved or rejected items are left unchanged.`
              : `${bulkLabel} ${eligibleSelectedKeys.length} of ${selectedCount} selected finding${selectedCount === 1 ? "" : "s"}? Already approved or rejected items are skipped.`
          }
          onCancel={() => setPendingBulk(null)}
          onConfirm={confirmBulk}
          title={`${bulkLabel} selected findings`}
        />
      )}
    </>,
    document.body,
  )
}
