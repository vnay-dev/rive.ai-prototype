import type { TagDecision } from "@/components/review/tag-accordion"
import type { ReviewResult, ReviewSource } from "@/lib/review"

export const REVIEW_JOBS_DB_NAME = "rive-review-jobs"
export const REVIEW_JOBS_DB_VERSION = 1

export type UploadItemKind = "file" | "folder" | "zip"
export type JobPhase = "upload" | "reviewing" | "results"

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
  expandedTags: string[]
  decisions: Record<string, TagDecision>
  viewer: { tag: string; documentName: string } | null
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
  expandedTags: string[]
  decisions: Record<string, TagDecision>
  viewer: { tag: string; documentName: string } | null
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
    expandedTags: job.expandedTags,
    decisions: job.decisions,
    viewer: job.viewer,
    fileNames: job.fileNames,
    fileContent: job.fileContent,
    tags: job.tags,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

export function persistedJobToRuntime(job: PersistedReviewJob): RuntimeReviewJob {
  return {
    id: job.id,
    name: job.name,
    pinned: job.pinned,
    allowAutoName: job.allowAutoName,
    phase: job.phase,
    items: job.items.map(storedItemToRuntime),
    review: job.review,
    reviewSource: job.reviewSource,
    reviewRunId: job.reviewRunId,
    errorMessage: job.errorMessage ?? null,
    completedAt: job.completedAt ?? null,
    expandedTags: job.expandedTags,
    decisions: job.decisions,
    viewer: job.viewer,
    fileNames: job.fileNames,
    fileContent: job.fileContent,
    tags: job.tags,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

export function createEmptyJob(id: number, name = "Untitled review"): RuntimeReviewJob {
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
    expandedTags: [],
    decisions: {},
    viewer: null,
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
) {
  const tagKeys = new Map<string, string>()
  for (const entry of job.review ?? []) {
    const tag = entry.tag.trim()
    if (!tag) continue
    const key = tag.toUpperCase()
    if (!tagKeys.has(key)) tagKeys.set(key, tag)
  }

  const decisionByKey = new Map(
    Object.entries(job.decisions).map(([tag, decision]) => [tag.trim().toUpperCase(), decision]),
  )

  const resolved = [...tagKeys.keys()].filter((key) => (
    isResolvedTagDecision(decisionByKey.get(key))
  )).length

  return { resolved, total: tagKeys.size }
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

export function createJobNameFromFile(file: File) {
  const sourceName = file.webkitRelativePath
    ? file.webkitRelativePath.split("/")[0]
    : file.name.replace(/\.[^.]+$/, "")
  const readableName = sourceName
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!readableName) return "Untitled review"
  return readableName.charAt(0).toUpperCase() + readableName.slice(1)
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
