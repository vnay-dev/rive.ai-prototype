import {
  occurrenceDecisionKey,
  type ReviewResult,
  type ReviewSource,
  type TagDecision,
} from "@/lib/review"

export const REVIEW_JOBS_DB_NAME = "rive-review-jobs"
export const REVIEW_JOBS_DB_VERSION = 1

export type UploadItemKind = "file" | "folder" | "zip"
export type JobPhase = "upload" | "reviewing" | "results"

export type ReviewViewerTarget = {
  tag: string
  documentName: string
  page: number
}

export type ExtractionProgress = {
  stage: "reading" | "analyzing"
  documentsTotal: number
  documentsProcessed: number
  currentDocument: string | null
}

export type StoredFileBlob = {
  name: string
  type: string
  lastModified: number
  webkitRelativePath: string
  blob: Blob
}

export type StoredUploadItem = {
  id: string
  displayName: string
  kind: UploadItemKind
  byteSize: number
  pageCount: number | null
  progress: number
  status: "uploading" | "ready"
  files: StoredFileBlob[]
}

export type PersistedReviewJob = {
  id: number
  name: string
  pinned: boolean
  allowAutoName: boolean
  phase: JobPhase
  items: StoredUploadItem[]
  review: ReviewResult | null
  reviewSource: ReviewSource | null
  reviewRunId: number
  errorMessage: string | null
  completedAt: number | null
  uploadedAt: number | null
  extractedAt: number | null
  reviewStartedAt: number | null
  exportedAt: number | null
  expandedTags: string[]
  decisions: Record<string, TagDecision>
  viewer: ReviewViewerTarget | null
  fileNames: string[]
  fileContent: string[]
  tags: string[]
  createdAt: number
  updatedAt: number
}

export type WorkspaceMeta = {
  key: "workspace"
  activeJobId: number | null
  nextJobId: number
}

export type RuntimeUploadItem = {
  id: string
  file: File
  files: File[]
  displayName: string
  kind: UploadItemKind
  byteSize: number
  pageCount: number | null
  progress: number
  status: "uploading" | "ready"
}

export type RuntimeReviewJob = {
  id: number
  name: string
  pinned: boolean
  allowAutoName: boolean
  phase: JobPhase
  items: RuntimeUploadItem[]
  review: ReviewResult | null
  reviewSource: ReviewSource | null
  reviewRunId: number
  errorMessage: string | null
  completedAt: number | null
  uploadedAt: number | null
  extractedAt: number | null
  reviewStartedAt: number | null
  exportedAt: number | null
  expandedTags: string[]
  decisions: Record<string, TagDecision>
  viewer: ReviewViewerTarget | null
  /** Ephemeral extraction progress; not persisted. */
  extractionProgress: ExtractionProgress | null
  fileNames: string[]
  fileContent: string[]
  tags: string[]
  createdAt: number
  updatedAt: number
}

/** Visual status for sidebar job rows. Idle/active draft jobs intentionally have no icon. */
export type JobSidebarStatus = "idle" | "processing" | "error" | "ready" | "completed"

export type LoadedWorkspace = {
  jobs: RuntimeReviewJob[]
  activeJobId: number | null
  nextJobId: number
}

const JOBS_STORE = "jobs"
const META_STORE = "meta"

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
  })
}

export function openReviewJobsDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(REVIEW_JOBS_DB_NAME, REVIEW_JOBS_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(JOBS_STORE)) {
        db.createObjectStore(JOBS_STORE, { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"))
  })
}

function fileToStoredBlob(file: File): StoredFileBlob {
  return {
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    webkitRelativePath: file.webkitRelativePath || "",
    blob: file,
  }
}

function storedBlobToFile(stored: StoredFileBlob) {
  const file = new File([stored.blob], stored.name, {
    type: stored.type,
    lastModified: stored.lastModified,
  })

  if (stored.webkitRelativePath) {
    Object.defineProperty(file, "webkitRelativePath", {
      configurable: true,
      value: stored.webkitRelativePath,
    })
  }

  return file
}

export function runtimeItemToStored(item: RuntimeUploadItem): StoredUploadItem {
  return {
    id: item.id,
    displayName: item.displayName,
    kind: item.kind,
    byteSize: item.byteSize,
    pageCount: item.pageCount,
    progress: item.status === "ready" ? 100 : item.progress,
    status: item.status === "uploading" ? "uploading" : "ready",
    files: item.files.map(fileToStoredBlob),
  }
}

export function storedItemToRuntime(item: StoredUploadItem): RuntimeUploadItem {
  const files = item.files.map(storedBlobToFile)
  return {
    id: item.id,
    file: files[0],
    files,
    displayName: item.displayName,
    kind: item.kind,
    byteSize: item.byteSize,
    pageCount: item.pageCount,
    progress: item.status === "ready" ? 100 : item.progress,
    status: item.status,
  }
}

export function runtimeJobToPersisted(job: RuntimeReviewJob): PersistedReviewJob {
  return {
    id: job.id,
    name: job.name,
    pinned: job.pinned,
    allowAutoName: job.allowAutoName,
    phase: job.phase,
    items: job.items.map(runtimeItemToStored),
    review: job.review,
    reviewSource: job.reviewSource,
    reviewRunId: job.reviewRunId,
    errorMessage: job.errorMessage,
    completedAt: job.completedAt,
    uploadedAt: job.uploadedAt,
    extractedAt: job.extractedAt,
    reviewStartedAt: job.reviewStartedAt,
    exportedAt: job.exportedAt,
    expandedTags: job.expandedTags,
    decisions: job.decisions,
    viewer: normalizeViewer(job.viewer),
    fileNames: job.fileNames,
    fileContent: job.fileContent,
    tags: job.tags,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

export function persistedJobToRuntime(job: PersistedReviewJob): RuntimeReviewJob {
  const legacyUntitled = job.name === "Untitled review"
  return {
    id: job.id,
    name: legacyUntitled ? "Untitled review job" : job.name,
    pinned: job.pinned,
    allowAutoName: job.allowAutoName,
    phase: job.phase,
    items: job.items.map(storedItemToRuntime),
    review: job.review,
    reviewSource: job.reviewSource,
    reviewRunId: job.reviewRunId,
    errorMessage: job.errorMessage ?? null,
    completedAt: job.completedAt ?? null,
    uploadedAt: job.uploadedAt ?? (job.items.length > 0 ? job.createdAt : null),
    extractedAt: job.extractedAt ?? null,
    reviewStartedAt: job.reviewStartedAt ?? null,
    exportedAt: job.exportedAt ?? null,
    expandedTags: job.expandedTags,
    decisions: job.decisions,
    viewer: normalizeViewer(job.viewer),
    extractionProgress: null,
    fileNames: job.fileNames,
    fileContent: job.fileContent,
    tags: job.tags,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

export function normalizeViewer(
  viewer: { tag: string; documentName: string; page?: number } | null | undefined,
): ReviewViewerTarget | null {
  if (!viewer?.tag || !viewer.documentName) return null
  const page = typeof viewer.page === "number" && Number.isFinite(viewer.page)
    ? Math.max(1, Math.round(viewer.page))
    : 1
  return {
    tag: viewer.tag,
    documentName: viewer.documentName,
    page,
  }
}

export function createEmptyJob(id: number, name = "Untitled review job"): RuntimeReviewJob {
  const now = Date.now()
  return {
    id,
    name,
    pinned: false,
    allowAutoName: true,
    phase: "upload",
    items: [],
    review: null,
    reviewSource: null,
    reviewRunId: 0,
    errorMessage: null,
    completedAt: null,
    uploadedAt: null,
    extractedAt: null,
    reviewStartedAt: null,
    exportedAt: null,
    expandedTags: [],
    decisions: {},
    viewer: null,
    extractionProgress: null,
    fileNames: [],
    fileContent: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** Approve / reject count toward completion; "needs-review" does not. */
export function isResolvedTagDecision(decision: TagDecision | undefined) {
  return decision === "approved" || decision === "rejected"
}

export function getResolvedReviewProgress(
  job: Pick<RuntimeReviewJob, "review" | "decisions">,
  fallbackDocument = "Uploaded document",
) {
  const occurrenceKeys = new Set<string>()
  for (const entry of job.review ?? []) {
    const tag = entry.tag.trim()
    if (!tag) continue
    const document = entry.document?.trim() || fallbackDocument
    occurrenceKeys.add(occurrenceDecisionKey(tag, document, entry.page))
  }

  const resolved = [...occurrenceKeys].filter((key) => (
    isResolvedTagDecision(job.decisions[key])
  )).length

  return { resolved, total: occurrenceKeys.size }
}

export function getJobSidebarStatus(job: RuntimeReviewJob): JobSidebarStatus {
  if (job.phase === "reviewing" || job.items.some((item) => item.status === "uploading")) {
    return "processing"
  }

  if (job.errorMessage) return "error"

  if (job.phase === "results" && job.review) {
    return job.completedAt ? "completed" : "ready"
  }

  return "idle"
}

export function jobSidebarStatusLabel(status: JobSidebarStatus) {
  if (status === "processing") return "Processing"
  if (status === "error") return "Failed"
  if (status === "ready") return "Ready for review"
  if (status === "completed") return "Completed"
  return "Draft"
}

/** Human-readable status for the job details dialog. */
export function getJobDetailsStatusLabel(job: RuntimeReviewJob) {
  const status = getJobSidebarStatus(job)
  if (status === "processing") return "Processing"
  if (status === "error") return "Failed"
  if (status === "ready") return "In Review"
  if (status === "completed") return "Completed"
  return "Draft"
}

export type JobHistoryEvent = {
  label: string
  at: number
}

export function formatJobTimestamp(value: number) {
  const date = new Date(value)
  const datePart = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${datePart} • ${timePart}`
}

export function getJobExtractedTagCount(job: RuntimeReviewJob) {
  if (!job.review?.length) return 0
  return new Set(
    job.review
      .map((entry) => entry.tag.trim().toUpperCase())
      .filter(Boolean),
  ).size
}

export function getExtractionSummary(
  review: ReviewResult,
  fallbackDocument = "Uploaded document",
) {
  const documents = new Set<string>()
  const tags = new Set<string>()
  let occurrences = 0
  let matchHits = 0

  for (const entry of review) {
    const tag = entry.tag.trim()
    if (!tag) continue
    tags.add(tag.toUpperCase())
    documents.add(entry.document?.trim() || fallbackDocument)
    occurrences += 1
    matchHits += Math.max(1, Math.round(entry.occurrences ?? 1))
  }

  return {
    documents: documents.size,
    tags: tags.size,
    occurrences,
    matchHits,
  }
}

/** Timeline entries that have actually happened for this job. */
export function buildJobHistoryEvents(job: RuntimeReviewJob): JobHistoryEvent[] {
  const events: JobHistoryEvent[] = [
    { label: "Review job created", at: job.createdAt },
  ]

  if (job.uploadedAt != null || job.items.length > 0) {
    events.push({
      label: "Documents uploaded",
      at: job.uploadedAt ?? job.createdAt,
    })
  }

  if (job.extractedAt != null || job.review) {
    events.push({
      label: "AI extraction completed",
      at: job.extractedAt ?? job.completedAt ?? job.updatedAt,
    })
  }

  if (job.reviewStartedAt != null || Object.keys(job.decisions).length > 0) {
    events.push({
      label: "Review started",
      at: job.reviewStartedAt
        ?? job.extractedAt
        ?? job.completedAt
        ?? job.updatedAt,
    })
  }

  if (job.completedAt != null) {
    events.push({ label: "Review completed", at: job.completedAt })
  }

  if (job.exportedAt != null) {
    events.push({ label: "Results exported", at: job.exportedAt })
  }

  const order = [
    "Review job created",
    "Documents uploaded",
    "AI extraction completed",
    "Review started",
    "Review completed",
    "Results exported",
  ]

  return events.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
}

export function createJobNameFromFile(file: File) {
  const sourceName = file.webkitRelativePath
    ? file.webkitRelativePath.split("/")[0]
    : file.name.replace(/\.[^.]+$/, "")
  const readableName = sourceName
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!readableName) return "Untitled review job"
  return readableName.charAt(0).toUpperCase() + readableName.slice(1)
}

/** Empty upload drafts stay off the sidebar until the first document is added. */
export function isListedReviewJob(job: RuntimeReviewJob) {
  if (job.items.length > 0) return true
  if (job.phase === "reviewing" || job.phase === "results") return true
  if (job.errorMessage) return true
  return false
}

export function sortJobs(jobs: RuntimeReviewJob[]) {
  return [...jobs].sort((a, b) => {
    const pinnedDelta = Number(b.pinned) - Number(a.pinned)
    if (pinnedDelta !== 0) return pinnedDelta
    return b.updatedAt - a.updatedAt
  })
}

export async function loadWorkspace(): Promise<LoadedWorkspace> {
  const db = await openReviewJobsDb()
  try {
    const transaction = db.transaction([JOBS_STORE, META_STORE], "readonly")
    const jobsStore = transaction.objectStore(JOBS_STORE)
    const metaStore = transaction.objectStore(META_STORE)

    const [persistedJobs, meta] = await Promise.all([
      requestToPromise(jobsStore.getAll()) as Promise<PersistedReviewJob[]>,
      requestToPromise(metaStore.get("workspace")) as Promise<WorkspaceMeta | undefined>,
    ])

    await transactionDone(transaction)

    const jobs = sortJobs(persistedJobs.map(persistedJobToRuntime))
    const nextJobId = meta?.nextJobId
      ?? (jobs.reduce((max, job) => Math.max(max, job.id), 0) + 1)
    const activeJobId = meta?.activeJobId != null && jobs.some((job) => job.id === meta.activeJobId)
      ? meta.activeJobId
      : jobs[0]?.id ?? null

    return { jobs, activeJobId, nextJobId }
  } finally {
    db.close()
  }
}

export async function persistWorkspace(jobs: RuntimeReviewJob[], meta: Omit<WorkspaceMeta, "key">) {
  const db = await openReviewJobsDb()
  try {
    const transaction = db.transaction([JOBS_STORE, META_STORE], "readwrite")
    const jobsStore = transaction.objectStore(JOBS_STORE)
    const metaStore = transaction.objectStore(META_STORE)

    const existingIds = await requestToPromise(jobsStore.getAllKeys()) as number[]
    const nextIds = new Set(jobs.map((job) => job.id))

    for (const id of existingIds) {
      if (!nextIds.has(id)) jobsStore.delete(id)
    }

    for (const job of jobs) {
      jobsStore.put(runtimeJobToPersisted(job))
    }

    metaStore.put({
      key: "workspace",
      activeJobId: meta.activeJobId,
      nextJobId: meta.nextJobId,
    } satisfies WorkspaceMeta)

    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function persistJob(job: RuntimeReviewJob) {
  const db = await openReviewJobsDb()
  try {
    const transaction = db.transaction(JOBS_STORE, "readwrite")
    transaction.objectStore(JOBS_STORE).put(runtimeJobToPersisted(job))
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function removePersistedJob(id: number) {
  const db = await openReviewJobsDb()
  try {
    const transaction = db.transaction(JOBS_STORE, "readwrite")
    transaction.objectStore(JOBS_STORE).delete(id)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}

export async function persistMeta(meta: Omit<WorkspaceMeta, "key">) {
  const db = await openReviewJobsDb()
  try {
    const transaction = db.transaction(META_STORE, "readwrite")
    transaction.objectStore(META_STORE).put({
      key: "workspace",
      activeJobId: meta.activeJobId,
      nextJobId: meta.nextJobId,
    } satisfies WorkspaceMeta)
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}
