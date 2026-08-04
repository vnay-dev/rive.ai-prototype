import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MoreHorizontal } from "lucide-react"

import { JobHistoryDialog } from "@/components/review/job-history-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { RuntimeReviewJob } from "@/lib/review-jobs"

type JobActionsMenuProps = {
  job: RuntimeReviewJob
  onRename: () => void
  onDelete: () => void
}

type PopoverCoords = {
  top: number
  right: number
}

/** Kebab menu: Rename, View history, Delete — same actions as the prior sidebar. */
export function JobActionsMenu({ job, onRename, onDelete }: JobActionsMenuProps) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [coords, setCoords] = useState<PopoverCoords | null>(null)

  function updateCoords() {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    setCoords({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
  }

  useLayoutEffect(() => {
    if (!isMenuOpen) {
      setCoords(null)
      return
    }
    updateCoords()
  }, [isMenuOpen])

  useEffect(() => {
    if (!isMenuOpen) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setIsMenuOpen(false)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false)
    }

    function handleReposition() {
      updateCoords()
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    window.addEventListener("resize", handleReposition)
    window.addEventListener("scroll", handleReposition, true)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("resize", handleReposition)
      window.removeEventListener("scroll", handleReposition, true)
    }
  }, [isMenuOpen])

  return (
    <>
      <div
        className={`version5-jobs-menu${isMenuOpen ? " is-open" : ""}`}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        ref={rootRef}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-controls={isMenuOpen ? menuId : undefined}
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
              aria-label={`Actions for ${job.name}`}
              className="version5-jobs-kebab"
              onClick={() => setIsMenuOpen((open) => !open)}
              ref={triggerRef}
              type="button"
            >
              <MoreHorizontal aria-hidden="true" size={16} strokeWidth={2} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Job actions</TooltipContent>
        </Tooltip>
      </div>

      {isMenuOpen && coords
        ? createPortal(
            <div
              className="sidebar-job-popover version5-jobs-popover"
              id={menuId}
              onClick={(event) => event.stopPropagation()}
              ref={popoverRef}
              role="menu"
              style={{ top: coords.top, right: coords.right }}
            >
              <button
                className="sidebar-job-menu-item"
                onClick={() => {
                  setIsMenuOpen(false)
                  onRename()
                }}
                role="menuitem"
                type="button"
              >
                Rename
              </button>
              <button
                className="sidebar-job-menu-item"
                onClick={() => {
                  setIsMenuOpen(false)
                  setIsHistoryOpen(true)
                }}
                role="menuitem"
                type="button"
              >
                View history
              </button>
              <button
                className="sidebar-job-menu-item is-danger"
                onClick={() => {
                  setIsMenuOpen(false)
                  setIsDeleteConfirmOpen(true)
                }}
                role="menuitem"
                type="button"
              >
                Delete
              </button>
            </div>,
            document.body,
          )
        : null}

      {isDeleteConfirmOpen && (
        <ConfirmDialog
          cancelLabel="Cancel"
          confirmLabel="Delete"
          confirmTone="danger"
          description={(
            <>
              This will permanently remove <strong>{job.name}</strong> and its uploaded files.
              This can’t be undone.
            </>
          )}
          onCancel={() => setIsDeleteConfirmOpen(false)}
          onConfirm={() => {
            setIsDeleteConfirmOpen(false)
            onDelete()
          }}
          title="Delete review job?"
        />
      )}

      {isHistoryOpen && (
        <JobHistoryDialog job={job} onClose={() => setIsHistoryOpen(false)} />
      )}
    </>
  )
}
