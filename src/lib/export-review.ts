import writeXlsxFile, { type SheetData } from "write-excel-file/browser"

import type { TagDecision } from "@/components/review/tag-accordion"
import type { ReviewResult } from "@/lib/review"

export type ReviewExportRow = {
  tag: string
  document: string
  page: number
  occurrence: number
  confidence: number
  status: "Approved" | "Rejected"
}

function resolvedStatus(decision: TagDecision | undefined) {
  if (decision === "approved") return "Approved" as const
  if (decision === "rejected") return "Rejected" as const
  return null
}

export function buildReviewExportRows(
  review: ReviewResult,
  decisions: Record<string, TagDecision>,
  fallbackDocument: string,
) {
  const decisionByTag = new Map(
    Object.entries(decisions).map(([tag, decision]) => [tag.trim().toUpperCase(), decision]),
  )

  return review.flatMap<ReviewExportRow>((entry) => {
    const tag = entry.tag.trim()
    const status = resolvedStatus(decisionByTag.get(tag.toUpperCase()))
    if (!tag || !status) return []

    return [{
      tag,
      document: entry.document?.trim() || fallbackDocument,
      page: Math.max(1, Math.round(entry.page)),
      occurrence: Math.max(1, Math.round(entry.occurrences ?? 1)),
      confidence: Math.round(entry.confidence * 100),
      status,
    }]
  })
}

function safeFileName(name: string) {
  const sanitized = name.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
  return sanitized || "review-results"
}

export async function downloadReviewWorkbook(jobName: string, rows: ReviewExportRow[]) {
  const header = ["Tag", "Document", "Page", "Occurrence", "Confidence", "Status"]
    .map((value) => ({
      value,
      fontWeight: "bold" as const,
      backgroundColor: "#F3F4F6",
      borderColor: "#D1D5DB",
    }))

  const data: SheetData = [
    header,
    ...rows.map((row) => [
      row.tag,
      row.document,
      row.page,
      row.occurrence,
      { value: row.confidence / 100, format: "0%" },
      row.status,
    ]),
  ]

  const workbook = await writeXlsxFile(data, {
    columns: [
      { width: 20 },
      { width: 32 },
      { width: 10 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
    ],
    stickyRowsCount: 1,
  })

  await workbook.toFile(`${safeFileName(jobName)}.xlsx`)
}
