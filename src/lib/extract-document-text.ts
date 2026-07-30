import { getDocument } from "@/lib/pdf"
import type { ReviewDocumentInput, ReviewDocumentKind } from "@/lib/review"

const MAX_CHARS_PER_PAGE = 6_000
const MAX_TOTAL_CHARS = 40_000

function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

function isPlainText(file: File) {
  return (
    file.type.startsWith("text/")
    || /\.(txt|csv|md|log)$/i.test(file.name)
  )
}

function truncate(text: string, max: number) {
  const cleaned = text.replace(/\s+/g, " ").trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max)}…`
}

async function extractPdfPages(file: File) {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const pages: Array<{ page: number; text: string }> = []
  let used = 0

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (used >= MAX_TOTAL_CHARS) break

    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const raw = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")

    const remaining = MAX_TOTAL_CHARS - used
    const text = truncate(raw, Math.min(MAX_CHARS_PER_PAGE, remaining))
    if (text) {
      pages.push({ page: pageNumber, text })
      used += text.length
    }
  }

  return pages
}

async function extractTextFilePages(file: File) {
  const raw = await file.text()
  const text = truncate(raw, MAX_TOTAL_CHARS)
  return text ? [{ page: 1, text }] : []
}

async function extractFilePages(file: File) {
  try {
    if (isPdf(file)) return await extractPdfPages(file)
    if (isPlainText(file)) return await extractTextFilePages(file)
  } catch {
    return []
  }
  return []
}

export async function buildReviewDocuments(
  items: Array<{
    displayName: string
    kind: ReviewDocumentKind
    byteSize: number
    pageCount: number | null
    files: File[]
  }>,
): Promise<ReviewDocumentInput[]> {
  const documents: ReviewDocumentInput[] = []

  for (const item of items) {
    const pageMap = new Map<number, string[]>()

    for (const file of item.files) {
      const pages = await extractFilePages(file)
      for (const page of pages) {
        const existing = pageMap.get(page.page) ?? []
        existing.push(page.text)
        pageMap.set(page.page, existing)
      }
    }

    const extractedPages = [...pageMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([page, texts]) => ({
        page,
        text: truncate(texts.join("\n"), MAX_CHARS_PER_PAGE),
      }))
      .filter((entry) => entry.text.length > 0)

    documents.push({
      name: item.displayName,
      kind: item.kind,
      byteSize: item.byteSize,
      pageCount: item.pageCount ?? (extractedPages.length || null),
      pages: extractedPages,
    })
  }

  return documents
}
