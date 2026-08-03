import writeXlsxFile, { type SheetData } from "write-excel-file/browser"

import {
  occurrenceDecisionKey,
  type ReviewResult,
  type TagDecision,
} from "@/lib/review"

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
  return review.flatMap<ReviewExportRow>((entry) => {
    const tag = entry.tag.trim()
    if (!tag) return []

    const document = entry.document?.trim() || fallbackDocument
    const page = Math.max(1, Math.round(entry.page))
    const status = resolvedStatus(decisions[occurrenceDecisionKey(tag, document, page)])
    if (!status) return []

    return [{
      tag,
      document,
      page,
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
  const header = ["Tag", "Document", "Page", "Count", "Confidence", "Status"]
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
