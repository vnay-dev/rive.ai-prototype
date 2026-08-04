import { getGeneratedPidMockReview } from "@/lib/mock-pid-fixtures"
import {
  extractLocalReviewFromDocuments,
  type ReviewDocumentInput,
  type ReviewResult,
} from "@/lib/review"

/**
 * Offline mock review.
 *
 * 1. Generated P&ID fixtures (`drawing_N_batch_chemical_reactor.pdf`) →
 *    ground-truth tags from the same formulas as gen_pdf.py (highlightable).
 * 2. Anything else → tags parsed from real document text only.
 */
export function getMockReview(items: ReviewDocumentInput[]): ReviewResult {
  const fixture = getGeneratedPidMockReview(items)
  if (fixture.length > 0) {
    const covered = new Set(
      fixture.map((entry) => entry.document).filter(Boolean),
    )
    const remainder = items.filter((item) => !covered.has(item.name))
    if (remainder.length === 0) return fixture

    const local = extractLocalReviewFromDocuments(remainder).map((entry, index) => ({
      ...entry,
      confidence: Math.min(0.98, Math.max(0.62, 0.9 - (index % 7) * 0.03)),
    }))
    return [...fixture, ...local]
  }

  const local = extractLocalReviewFromDocuments(items)
  if (local.length === 0) return []

  return local.map((entry, index) => ({
    ...entry,
    confidence: Math.min(0.98, Math.max(0.62, 0.9 - (index % 7) * 0.03)),
  }))
}
