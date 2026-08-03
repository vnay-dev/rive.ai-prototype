import { useRef, useState } from "react"
import { Download } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { downloadReviewWorkbook, type ReviewExportRow } from "@/lib/export-review"

type ExportMenuProps = {
  jobName: string
  rows: ReviewExportRow[]
  onExported?: () => void
}

export function ExportMenu({ jobName, rows, onExported }: ExportMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [isExporting, setIsExporting] = useState(false)

  async function exportExcel() {
    if (isExporting || rows.length === 0) return
    setIsExporting(true)
    try {
      await downloadReviewWorkbook(jobName, rows)
      onExported?.()
    } finally {
      setIsExporting(false)
      triggerRef.current?.focus()
    }
  }

  const canExport = !isExporting && rows.length > 0

  return (
    <Tooltip open={canExport ? false : undefined}>
      <TooltipTrigger asChild>
        <span className="review-complete-tooltip-target">
          <button
            className="primary-button export-excel-button"
            disabled={!canExport}
            onClick={() => void exportExcel()}
            ref={triggerRef}
            type="button"
          >
            <Download aria-hidden="true" size={15} strokeWidth={2.2} />
            Export as Excel
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {isExporting ? "Export in progress" : "No approved or rejected tags to export"}
      </TooltipContent>
    </Tooltip>
  )
}
