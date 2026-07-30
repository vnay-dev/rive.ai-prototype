export type ReviewDocumentKind = "file" | "folder" | "zip"

export type ExtractedTag = {
  tag: string
  page: number
  confidence: number
  document?: string
  occurrences?: number
}

export type ReviewResult = ExtractedTag[]

export type ReviewSource = "api" | "mock"

export type ReviewResponse = {
  source: ReviewSource
  data: ReviewResult
}

export type ReviewPageContent = {
  page: number
  text: string
}

export type ReviewDocumentInput = {
  name: string
  kind: ReviewDocumentKind
  byteSize: number
  pageCount: number | null
  pages: ReviewPageContent[]
}

export type TagGroupDocument = {
  name: string
  occurrences: number
  pages: number[]
}

export type TagGroup = {
  tag: string
  confidence: number
  occurrences: number
  documents: TagGroupDocument[]
}

export function isReviewResult(value: unknown): value is ReviewResult {
  if (!Array.isArray(value)) return false

  return value.every((entry) => {
    if (!entry || typeof entry !== "object") return false
    const candidate = entry as ExtractedTag
    if (typeof candidate.tag !== "string") return false
    if (typeof candidate.page !== "number") return false
    if (typeof candidate.confidence !== "number") return false
    if (candidate.document !== undefined && typeof candidate.document !== "string") return false
    if (candidate.occurrences !== undefined && typeof candidate.occurrences !== "number") return false
    return true
  })
}

/** Collapses flat tag hits into one entry per tag, with the documents it was found in. */
export function groupExtractedTags(tags: ReviewResult, fallbackDocument: string): TagGroup[] {
  type PendingGroup = {
    tag: string
    confidence: number
    documents: Map<string, TagGroupDocument>
  }

  const groups = new Map<string, PendingGroup>()

  for (const entry of tags) {
    const tag = entry.tag.trim()
    if (!tag) continue

    const key = tag.toUpperCase()
    const group = groups.get(key) ?? { tag, confidence: 0, documents: new Map() }
    group.confidence = Math.max(group.confidence, entry.confidence)

    const documentName = entry.document?.trim() || fallbackDocument
    const document = group.documents.get(documentName) ?? { name: documentName, occurrences: 0, pages: [] }
    const page = Math.max(1, Math.round(entry.page))

    document.occurrences += Math.max(1, Math.round(entry.occurrences ?? 1))
    if (!document.pages.includes(page)) document.pages.push(page)

    group.documents.set(documentName, document)
    groups.set(key, group)
  }

  return [...groups.values()].map((group) => {
    const documents = [...group.documents.values()].map((document) => ({
      ...document,
      pages: [...document.pages].sort((a, b) => a - b),
    }))

    return {
      tag: group.tag,
      confidence: group.confidence,
      occurrences: documents.reduce((total, document) => total + document.occurrences, 0),
      documents,
    }
  })
}
