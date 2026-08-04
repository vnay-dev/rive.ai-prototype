import { useId, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { useModalFocus } from "@/hooks/use-modal-focus"

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
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useModalFocus({
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onEscape: onCancel,
  })

  return createPortal(
    <div
      className="confirm-dialog-scrim"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="confirm-dialog"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="alertdialog"
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        <div className="confirm-dialog-actions">
          <button
            className="secondary-button"
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
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
