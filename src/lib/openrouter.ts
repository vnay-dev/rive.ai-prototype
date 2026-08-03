import { USE_MOCK_DATA } from "@/lib/config"
import { getMockReview } from "@/lib/mock-review"
import {
  alignReviewDocuments,
  extractLocalReviewFromDocuments,
  isReviewResult,
  type ReviewDocumentInput,
  type ReviewResponse,
  type ReviewResult,
} from "@/lib/review"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
const MODEL = "google/gemma-4-26b-a4b-it:free"
const REVIEW_TIMEOUT_MS = 60_000
const NAME_TIMEOUT_MS = 20_000
const MAX_JOB_NAME_CHARS = 30

const NAME_SYSTEM_PROMPT = `You name engineering document review jobs.

Reply with the title only: 2 to 4 words, at most 30 characters.
No quotes, no file extensions, no trailing punctuation, no explanation.`

const SYSTEM_PROMPT = `You are an engineering document parser.

Extract every engineering tag from this document.

Critical rules:
- Copy each tag exactly as it appears in the document text (same letters, digits, and hyphens).
- Use the document name exactly as provided in the input JSON (character-for-character).
- Use the page number from the provided page content.
- Do not invent tags that are not present in the text.
- Return JSON only. Emit one entry per tag per page.

[
  {
    "tag": "PSV-4015A",
    "document": "P&ID Unit A.pdf",
    "page": 4,
    "occurrences": 2,
    "confidence": 0.96
  }
]`

function getApiKey() {
  return import.meta.env.VITE_OPEN_ROUTER_API_KEY?.trim() || ""
}

function buildUserPrompt(items: ReviewDocumentInput[]) {
  const documents = items.map((item) => ({
    name: item.name,
    kind: item.kind,
    pageCount: item.pageCount,
    pages: item.pages,
  }))

  const hasText = items.some((item) => item.pages.some((page) => page.text.trim().length > 0))

  return [
    "Parse the following engineering document content and extract every engineering tag.",
    "Use the page numbers from the provided page content.",
    "Return a JSON array only. Each item must include tag, document (the document name exactly as given), page, occurrences, and confidence (0 to 1).",
    "The same tag can appear in several documents and on several pages. Emit a separate entry for each document and page.",
    hasText
      ? "Prefer tags found in the document text. Do not invent tags that are unrelated to the content."
      : "No extractable text was available. Infer only high-confidence tags from filenames if possible; otherwise return [].",
    "Documents:",
    JSON.stringify(documents, null, 2),
  ].join("\n\n")
}

function stripCodeFences(content: string) {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

function parseReviewContent(content: string): ReviewResult {
  const parsed: unknown = JSON.parse(stripCodeFences(content))
  if (!isReviewResult(parsed)) {
    throw new Error("OpenRouter response did not match the review schema")
  }
  return parsed
}

async function requestCompletion(
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number,
  maxTokens?: number,
) {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error("Missing VITE_OPEN_ROUTER_API_KEY")
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "Rive",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`OpenRouter request failed with status ${response.status}`)
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content
    if (!content) {
      throw new Error("OpenRouter response was empty")
    }

    return content
  } finally {
    window.clearTimeout(timeout)
  }
}

function finalizeReview(
  data: ReviewResult,
  items: ReviewDocumentInput[],
  source: ReviewResponse["source"],
): ReviewResponse {
  return {
    source,
    data: alignReviewDocuments(
      data,
      items.map((item) => item.name),
    ),
  }
}

function fallbackReview(items: ReviewDocumentInput[]): ReviewResponse {
  const local = extractLocalReviewFromDocuments(items)
  if (local.length > 0) {
    return finalizeReview(local, items, "mock")
  }
  return finalizeReview(getMockReview(items), items, "mock")
}

export async function startReview(items: ReviewDocumentInput[]): Promise<ReviewResponse> {
  if (USE_MOCK_DATA) {
    return fallbackReview(items)
  }

  try {
    const content = await requestCompletion(SYSTEM_PROMPT, buildUserPrompt(items), REVIEW_TIMEOUT_MS)
    return finalizeReview(parseReviewContent(content), items, "api")
  } catch {
    return fallbackReview(items)
  }
}

function buildNamePrompt(items: ReviewDocumentInput[]) {
  const documents = items.slice(0, 3).map((item) => ({
    name: item.name,
    excerpt: item.pages
      .slice(0, 2)
      .map((page) => page.text)
      .join(" ")
      .slice(0, 600),
  }))

  return [
    "Name this document review job.",
    "Prefer the equipment, system, or unit the documents describe. Fall back to the document name.",
    JSON.stringify(documents, null, 2),
  ].join("\n\n")
}

function sanitizeJobName(raw: string) {
  const line = raw.split("\n").map((entry) => entry.trim()).find(Boolean) ?? ""
  const cleaned = line
    .replace(/^["'`*\s]+|["'`*.\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned) return ""

  const name = cleaned.split(" ").slice(0, 4).join(" ").slice(0, MAX_JOB_NAME_CHARS).trim()
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function mockJobName(items: ReviewDocumentInput[]) {
  const first = items[0]?.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()
  if (!first) return "Mock Review"
  return sanitizeJobName(first) || "Mock Review"
}

export async function generateJobName(items: ReviewDocumentInput[]): Promise<string | null> {
  if (items.length === 0) return null

  if (USE_MOCK_DATA) {
    return mockJobName(items)
  }

  try {
    const content = await requestCompletion(
      NAME_SYSTEM_PROMPT,
      buildNamePrompt(items),
      NAME_TIMEOUT_MS,
      32,
    )
    return sanitizeJobName(content) || null
  } catch {
    return null
  }
}
