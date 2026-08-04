import type { ReviewDocumentInput, ReviewResult } from "@/lib/review"

/**
 * Mirrors `generate-pdfs-test/gen_pdf.py` — only tags drawn as contiguous
 * PDF text strings so the viewer can highlight them.
 *
 * Filename: drawing_{index}_batch_chemical_reactor.pdf
 * id = 500 + index
 */
const DRAWING_NAME_RE = /drawing_(\d+)_batch_chemical_reactor\.pdf$/i

export function parseGeneratedPidIndex(documentName: string): number | null {
  const base = documentName.split(/[/\\]/).pop() ?? documentName
  const match = base.match(DRAWING_NAME_RE)
  if (!match) return null
  const index = Number(match[1])
  if (!Number.isInteger(index) || index < 1 || index > 200) return null
  return index
}

/** Ground-truth tags for one generated P&ID sheet (same formulas as gen_pdf.py). */
export function tagsForGeneratedPid(index: number, documentName: string): ReviewResult {
  const id = 500 + index
  const line1 = `3"-RTA-${5000 + index}-SS316`
  const line2 = `2"-RTB-${5000 + index + 1}-SS316`
  const dwg = `P&ID-CHE-${id}-R1`

  const tags = [
    `R-${id}`,
    `M-${id}`,
    `E-${id}`,
    `PSV-${id}`,
    line1,
    line2,
    dwg,
  ]

  return tags.map((tag, i) => ({
    tag,
    document: documentName,
    page: 1,
    occurrences: tag === line1 ? 2 : 1,
    confidence: Math.min(0.98, Math.max(0.72, 0.94 - i * 0.02)),
  }))
}

/** Mock review for any uploaded docs that match the generated P&ID naming scheme. */
export function getGeneratedPidMockReview(items: ReviewDocumentInput[]): ReviewResult {
  const results: ReviewResult = []

  for (const item of items) {
    const index = parseGeneratedPidIndex(item.name)
    if (index == null) continue
    results.push(...tagsForGeneratedPid(index, item.name))
  }

  return results
}
