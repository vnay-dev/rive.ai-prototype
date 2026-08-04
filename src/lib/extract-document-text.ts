import { getDocument, type PdfTextItems } from "@/lib/pdf"
import type { ReviewDocumentInput, ReviewDocumentKind } from "@/lib/review"

const MAX_CHARS_PER_PAGE = 6_000
const MAX_CHARS_PER_DOCUMENT = 12_000
/** Hard cap across the whole job so large folders stay workable. */
const MAX_JOB_CHARS = 120_000
const EXTRACT_CONCURRENCY = 2
const PAGE_COUNT_CONCURRENCY = 3
const PAGE_COUNT_SCAN_BYTES = 1_500_000

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

/** Join PDF text items using glyph positions so CAD tags stay contiguous. */
function textItemsToExtractString(items: PdfTextItems) {
  let out = ""
  let prevEndX: number | null = null
  let prevY: number | null = null
  let prevFontSize = 10

  for (const item of items) {
    if (!("str" in item) || !item.str) continue

    const x = item.transform[4] ?? 0
    const y = item.transform[5] ?? 0
    const fontSize = Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0) || item.height || prevFontSize

    if (prevEndX != null && prevY != null) {
      const dx = x - prevEndX
      const dy = Math.abs(y - prevY)
      const gap = Math.max(fontSize, prevFontSize) * 0.28
      if (dy > Math.max(fontSize, prevFontSize) * 0.55 || dx > gap) {
        out += " "
      }
    }

    out += item.str
    prevEndX = x + (item.width || fontSize * 0.5 * item.str.length)
    prevY = y
    prevFontSize = fontSize

    if ("hasEOL" in item && item.hasEOL) {
      out += " "
      prevEndX = null
      prevY = null
    }
  }

  return out.replace(/\s+/g, " ").trim()
}

function yieldToMain() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index]!, index)
      await yieldToMain()
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: poolSize }, () => run()))
  return results
}

async function extractPdfPages(file: File, charBudget: number) {
  if (charBudget <= 0) return [] as Array<{ page: number; text: string }>

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = getDocument({ data })
  const pdf = await loadingTask.promise
  const pages: Array<{ page: number; text: string }> = []
  let used = 0

  try {
    const pageLimit = Math.min(pdf.numPages, 40)
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      if (used >= charBudget) break

      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const raw = textItemsToExtractString(content.items)

      const remaining = charBudget - used
      const text = truncate(raw, Math.min(MAX_CHARS_PER_PAGE, remaining))
      if (text) {
        pages.push({ page: pageNumber, text })
        used += text.length
      }

      if (pageNumber % 2 === 0) await yieldToMain()
    }
  } finally {
    // pdf.js v6: PDFDocumentProxy has cleanup(), not destroy().
    // A thrown finally would otherwise wipe a successful extract (caught upstream as []).
    try {
      pdf.cleanup()
    } catch {
      // ignore
    }
    try {
      void loadingTask.destroy()
    } catch {
      // ignore
    }
  }

  return pages
}

async function extractTextFilePages(file: File, charBudget: number) {
  if (charBudget <= 0) return [] as Array<{ page: number; text: string }>
  const raw = await file.text()
  const text = truncate(raw, Math.min(MAX_CHARS_PER_DOCUMENT, charBudget))
  return text ? [{ page: 1, text }] : []
}

async function extractFilePages(file: File, charBudget: number) {
  try {
    if (isPdf(file)) return await extractPdfPages(file, charBudget)
    if (isPlainText(file)) return await extractTextFilePages(file, charBudget)
  } catch {
    return []
  }
  return []
}

type ReviewSourceItem = {
  displayName: string
  kind: ReviewDocumentKind
  byteSize: number
  pageCount: number | null
  files: File[]
}

type ExtractWorkUnit = {
  name: string
  kind: ReviewDocumentKind
  byteSize: number
  pageCount: number | null
  file: File
}

function documentNameForFile(file: File, fallback: string) {
  const relative = file.webkitRelativePath?.trim()
  if (relative) {
    const parts = relative.split("/")
    return parts[parts.length - 1] || relative
  }
  return file.name || fallback
}

/** Expand folder/multi-file uploads into one review document per file. */
function expandReviewWorkUnits(items: ReviewSourceItem[]): ExtractWorkUnit[] {
  const units: ExtractWorkUnit[] = []

  for (const item of items) {
    const files = item.files.length > 0 ? item.files : []
    if (files.length <= 1) {
      const file = files[0]
      if (!file) continue
      units.push({
        name: item.displayName,
        kind: item.kind,
        byteSize: item.byteSize,
        pageCount: item.pageCount,
        file,
      })
      continue
    }

    for (const file of files) {
      if (!isPdf(file) && !isPlainText(file)) continue
      units.push({
        name: documentNameForFile(file, item.displayName),
        kind: "file",
        byteSize: file.size,
        pageCount: null,
        file,
      })
    }
  }

  return units
}

export async function buildReviewDocuments(
  items: ReviewSourceItem[],
  onProgress?: (progress: {
    documentsTotal: number
    documentsProcessed: number
    currentDocument: string | null
  }) => void,
): Promise<ReviewDocumentInput[]> {
  const units = expandReviewWorkUnits(items)
  const documentsTotal = units.length
  let jobCharsUsed = 0
  let processed = 0

  onProgress?.({
    documentsTotal,
    documentsProcessed: 0,
    currentDocument: units[0]?.name ?? null,
  })

  const documents = await mapPool(units, EXTRACT_CONCURRENCY, async (unit) => {
    const remaining = Math.max(0, MAX_JOB_CHARS - jobCharsUsed)
    const perDocBudget = Math.min(MAX_CHARS_PER_DOCUMENT, remaining)
    jobCharsUsed += perDocBudget

    const pages = await extractFilePages(unit.file, perDocBudget)
    const extractedPages = pages
      .map((page) => ({
        page: page.page,
        text: truncate(page.text, MAX_CHARS_PER_PAGE),
      }))
      .filter((entry) => entry.text.length > 0)

    const usedHere = extractedPages.reduce((total, page) => total + page.text.length, 0)
    jobCharsUsed -= Math.max(0, perDocBudget - usedHere)
    processed += 1

    onProgress?.({
      documentsTotal,
      documentsProcessed: processed,
      currentDocument: unit.name,
    })

    return {
      name: unit.name,
      kind: unit.kind,
      byteSize: unit.byteSize,
      pageCount: unit.pageCount ?? (extractedPages.length || null),
      pages: extractedPages,
    } satisfies ReviewDocumentInput
  })

  return documents
}

/** Fast page estimate without opening every PDF fully (safe for large folders). */
export async function countFilePages(file: File) {
  const name = file.name.toLowerCase()

  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 1

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const slice = file.slice(0, Math.min(file.size, PAGE_COUNT_SCAN_BYTES))
      const buffer = await slice.arrayBuffer()
      const text = new TextDecoder("latin1").decode(buffer)
      const matches = text.match(/\/Type\s*\/Page\b/g)
      return Math.max(matches?.length ?? 1, 1)
    } catch {
      return Math.max(1, Math.round(file.size / 50_000))
    }
  }

  if (name.endsWith(".zip") || file.type.includes("zip")) {
    return Math.max(1, Math.round(file.size / 80_000))
  }

  if (/\.(docx?|xlsx?|pptx?|txt|csv|md)$/.test(name)) {
    return Math.max(1, Math.round(file.size / 3_500))
  }

  return Math.max(1, Math.round(file.size / 40_000))
}

export async function resolvePageCount(files: File[]) {
  if (files.length === 0) return 0
  const counts = await mapPool(files, PAGE_COUNT_CONCURRENCY, (file) => countFilePages(file))
  return counts.reduce((total, count) => total + count, 0)
}
