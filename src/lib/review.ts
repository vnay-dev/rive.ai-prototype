export type ReviewDocumentKind = "file" | "folder" | "zip"

export type ExtractedTag = {
  tag: string
  page: number
  confidence: number
  document?: string
  occurrences?: number
}

export type ReviewResult = ExtractedTag[]

export type ReviewSource = "api" | "mock" | "local"

export type TagDecision = "approved" | "rejected" | "needs-review"

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

export type TagOccurrence = {
  key: string
  tag: string
  documentName: string
  page: number
  confidence: number
  occurrences: number
}

/** Stable key for per-occurrence decisions: TAG::document::page */
export function occurrenceDecisionKey(tag: string, document: string, page: number) {
  return `${tag.trim().toUpperCase()}::${document.trim()}::${Math.max(1, Math.round(page))}`
}

export function flattenTagOccurrences(
  tags: ReviewResult,
  fallbackDocument: string,
): TagOccurrence[] {
  const occurrences: TagOccurrence[] = []

  for (const entry of tags) {
    const tag = entry.tag.trim()
    if (!tag) continue
    const documentName = entry.document?.trim() || fallbackDocument
    const page = Math.max(1, Math.round(entry.page))
    occurrences.push({
      key: occurrenceDecisionKey(tag, documentName, page),
      tag,
      documentName,
      page,
      confidence: entry.confidence,
      occurrences: Math.max(1, Math.round(entry.occurrences ?? 1)),
    })
  }

  return occurrences
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

function documentBaseName(name: string) {
  const normalized = name.trim().replace(/\\/g, "/")
  const segments = normalized.split("/")
  return segments[segments.length - 1] || normalized
}

/** Remap API document names onto the exact uploaded document names so PDF lookup succeeds. */
export function alignReviewDocuments(
  review: ReviewResult,
  documentNames: string[],
): ReviewResult {
  if (documentNames.length === 0) return review

  const byLower = new Map(documentNames.map((name) => [name.toLowerCase(), name]))
  const byBase = new Map(
    documentNames.map((name) => [documentBaseName(name).toLowerCase(), name]),
  )

  return review.map((entry) => {
    const raw = entry.document?.trim()
    if (!raw) {
      return { ...entry, document: documentNames[0] }
    }

    const exact = byLower.get(raw.toLowerCase())
    if (exact) return { ...entry, document: exact }

    const base = byBase.get(documentBaseName(raw).toLowerCase())
    if (base) return { ...entry, document: base }

    const lowered = raw.toLowerCase()
    const fuzzy = documentNames.find((name) => {
      const candidate = name.toLowerCase()
      return candidate.includes(lowered) || lowered.includes(candidate)
    })

    return { ...entry, document: fuzzy ?? documentNames[0] }
  })
}

/** Pull engineering-tag-like tokens from extracted page text (highlightable fallback). */
export function extractLocalReviewFromDocuments(
  items: ReviewDocumentInput[],
): ReviewResult {
  const tagPatterns = [
    // PSV-4015A, HBG-0110, XV-200, FT 101
    /\b[A-Z]{1,8}[\s\-/]?[A-Z]{0,4}\d{2,6}[A-Z]?\d*\b/gi,
    // 2HV-101A, 10PA-203
    /\b\d{1,3}[A-Z]{1,6}[\s\-/]?\d{2,5}[A-Z]?\b/gi,
  ]

  const results: ReviewResult = []
  const seen = new Set<string>()

  for (const item of items) {
    for (const page of item.pages) {
      const searchTexts = [page.text, compactFragmentedTagText(page.text)]
      const matches = searchTexts.flatMap((text) => (
        tagPatterns.flatMap((pattern) => text.match(pattern) ?? [])
      ))

      for (const raw of matches) {
        // Prefer compact form with hyphens preserved from the source text.
        const tag = normalizeExtractedTag(raw)
        if (tag.length < 4) continue
        if (!/\d/.test(tag) || !/[A-Z]/.test(tag)) continue

        const key = `${tag}::${item.name}::${page.page}`
        if (seen.has(key)) {
          const existing = results.find((entry) => (
            entry.tag === tag
            && entry.document === item.name
            && entry.page === page.page
          ))
          if (existing) {
            existing.occurrences = (existing.occurrences ?? 1) + 1
          }
          continue
        }
        seen.add(key)
        results.push({
          tag,
          document: item.name,
          page: page.page,
          occurrences: 1,
          confidence: 0.78,
        })
      }
    }
  }

  return results
}

/** Rejoin CAD/PDF glyph spacing so "P - 1 0 1" / "PSV 4015 A" become tag-like tokens. */
function compactFragmentedTagText(text: string) {
  return text
    .replace(/\s*([-/–—])\s*/g, "$1")
    .replace(/\b([A-Z]{1,8})\s+(?=[A-Z]{1,4}\d)/gi, "$1")
    .replace(/\b([A-Z]{1,8})\s+(?=[-/]?\d)/gi, "$1")
    .replace(/\b(\d{1,3}[A-Z]{1,6})\s+(?=[-/]?\d)/gi, "$1")
    .replace(/(\d)\s+(?=\d)/g, "$1")
    .replace(/(\d)\s+(?=[A-Z]\b)/gi, "$1")
}

function normalizeExtractedTag(raw: string) {
  return raw
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .toUpperCase()
}

export function documentsHaveExtractableText(items: ReviewDocumentInput[]) {
  return items.some((item) => item.pages.some((page) => page.text.trim().length > 0))
}
