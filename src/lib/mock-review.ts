import type { ReviewDocumentInput, ReviewResult } from "@/lib/review"

const SHARED_TAGS: Array<{
  tag: string
  confidence: number
  /** Distinct page rows to show in the accordion body for this tag. */
  pages: number[]
}> = [
  { tag: "PSV-4015A", confidence: 0.96, pages: [1, 2, 3] },
  { tag: "PSV-4020A", confidence: 0.89, pages: [1, 4] },
  { tag: "HBG-0110", confidence: 0.81, pages: [1, 2, 3, 4, 5, 6] },
]

function tagStem(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 12) || "DOC"
}

export function getMockReview(items: ReviewDocumentInput[]): ReviewResult {
  const tags: ReviewResult = []

  items.forEach((item, index) => {
    const stem = tagStem(item.name)
    // Allow rich multi-page mock rows even when the upload is a short/single-page file.
    const maxPage = Math.max(item.pageCount ?? 1, 6)

    SHARED_TAGS.forEach((shared, sharedIndex) => {
      // Skip a tag in some documents so document counts differ between tags.
      if ((index + sharedIndex) % 4 === 3) return

      shared.pages.forEach((page, pageIndex) => {
        tags.push({
          tag: shared.tag,
          document: item.name,
          page: Math.min(maxPage, page),
          occurrences: ((index + sharedIndex + pageIndex) % 3) + 1,
          confidence: shared.confidence,
        })
      })
    })

    tags.push({
      tag: `${stem}-${1000 + index}`,
      document: item.name,
      page: 1,
      occurrences: 2,
      confidence: 0.91,
    })

    // Document-specific valve tag with three page occurrences.
    ;[2, 4, 6].forEach((page, pageIndex) => {
      tags.push({
        tag: `XV-${200 + index}`,
        document: item.name,
        page: Math.min(maxPage, page),
        occurrences: pageIndex === 0 ? 2 : 1,
        confidence: 0.78,
      })
    })
  })

  return tags
}
