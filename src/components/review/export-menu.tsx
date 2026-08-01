import { useEffect, useRef, useState } from "react"
import { ChevronDown, Download } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  downloadReviewExport,
  type ReviewExportFormat,
  type ReviewExportRow,
} from "@/lib/export-review"

type ExportMenuProps = {
  jobName: string
  rows: ReviewExportRow[]
  onExported?: () => void
}

export function ExportMenu({ jobName, rows, onExported }: ExportMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  async function exportAs(format: ReviewExportFormat) {
    if (isExporting || rows.length === 0) return
    setIsExporting(true)
    setIsOpen(false)
    try {
      await downloadReviewExport(jobName, rows, format)
      onExported?.()
    } finally {
      setIsExporting(false)
    }
  }

  const canExport = !isExporting && rows.length > 0

  return (
    <div className={`export-menu${isOpen ? " is-open" : ""}`} ref={rootRef}>
      <Tooltip open={canExport ? false : undefined}>
        <TooltipTrigger asChild>
          <span className="review-complete-tooltip-target">
            <button
              aria-expanded={isOpen}
              aria-haspopup="menu"
              className="primary-button export-menu-trigger"
              disabled={!canExport}
              onClick={() => setIsOpen((open) => !open)}
              type="button"
            >
              <Download aria-hidden="true" size={15} strokeWidth={2.2} />
              Export
              <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {isExporting ? "Export in progress" : "No validated results to export"}
        </TooltipContent>
      </Tooltip>

      {isOpen && (
        <div className="export-menu-popover" role="menu">
          <button
            className="export-menu-item"
            onClick={() => void exportAs("excel")}
            role="menuitem"
            type="button"
          >
            Excel (.xlsx)
          </button>
          <button
            className="export-menu-item"
            onClick={() => void exportAs("csv")}
            role="menuitem"
            type="button"
          >
            CSV (.csv)
          </button>
        </div>
      )}
    </div>
  )
}
