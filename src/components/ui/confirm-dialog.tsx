import { useEffect, useId, type ReactNode } from "react"
import { createPortal } from "react-dom"

type ConfirmDialogProps = {
  title: string
  description: ReactNode
  cancelLabel: string
  confirmLabel: string
  confirmTone?: "primary" | "danger"
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Renders into `document.body` so the scrim is never trapped inside an ancestor
 * stacking context (the sidebar and page content both create their own).
 */
export function ConfirmDialog({
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmTone = "primary",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const dialogId = useId()
  const titleId = `${dialogId}-title`
  const descriptionId = `${dialogId}-description`

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel()
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onCancel])

  return createPortal(
    <div className="confirm-dialog-scrim" role="presentation">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-dialog"
        role="alertdialog"
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirm-dialog-actions">
          <button autoFocus className="secondary-button" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            className={confirmTone === "danger" ? "danger-button" : "primary-button"}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
