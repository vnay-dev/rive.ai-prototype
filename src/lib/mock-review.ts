import type { ReviewDocumentInput, ReviewResult } from "@/lib/review"

const SHARED_TAGS = [
  { tag: "PSV-4015A", confidence: 0.96 },
  { tag: "PSV-4020A", confidence: 0.89 },
  { tag: "HBG-0110", confidence: 0.81 },
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
    const maxPage = Math.max(item.pageCount ?? 1, 1)

    SHARED_TAGS.forEach((shared, sharedIndex) => {
      // Skip a tag in some documents so document counts differ between tags.
      if ((index + sharedIndex) % 4 === 3) return

      tags.push({
        tag: shared.tag,
        document: item.name,
        page: Math.min(maxPage, sharedIndex + 1),
        occurrences: ((index + sharedIndex) % 3) + 1,
        confidence: shared.confidence,
      })

      if (maxPage >= 3) {
        tags.push({
          tag: shared.tag,
          document: item.name,
          page: Math.min(maxPage, sharedIndex + 3),
          occurrences: 1,
          confidence: shared.confidence,
        })
      }
    })

    tags.push({
      tag: `${stem}-${1000 + index}`,
      document: item.name,
      page: 1,
      occurrences: 2,
      confidence: 0.91,
    })

    if (maxPage >= 3) {
      tags.push({
        tag: `XV-${200 + index}`,
        document: item.name,
        page: Math.min(maxPage, 4),
        occurrences: 1,
        confidence: 0.78,
      })
    }
  })

  return tags
}
