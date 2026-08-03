import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { TagDecision } from "@/lib/review"
import { buildReviewDocuments } from "@/lib/extract-document-text"
import { generateJobName, startReview } from "@/lib/openrouter"
import {
  createEmptyJob,
  createJobNameFromFile,
  getDecidedReviewProgress,
  getResolvedReviewProgress,
  loadWorkspace,
  normalizeViewer,
  persistMeta,
  persistWorkspace,
  sortJobs,
  toUserFacingReviewError,
  type ReviewViewerTarget,
  type RuntimeReviewJob,
  type RuntimeUploadItem,
  type UploadItemKind,
} from "@/lib/review-jobs"

export type SaveStatus = "idle" | "saving" | "saved" | "error"

export type NewUploadEntry = {
  file: File
  files: File[]
  displayName: string
  kind: UploadItemKind
  byteSize: number
}

function touch(job: RuntimeReviewJob): RuntimeReviewJob {
  return { ...job, updatedAt: Date.now() }
}

function finalizeUploadingItems(items: RuntimeUploadItem[]) {
  return items.map((item) => (
    item.status === "uploading"
      ? { ...item, progress: 100, status: "ready" as const }
      : item
  ))
}

export function useReviewJobs() {
  const [jobs, setJobs] = useState<RuntimeReviewJob[]>([])
  const [activeJobId, setActiveJobId] = useState<number | null>(null)
  const [isHydrating, setIsHydrating] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [saveError, setSaveError] = useState<string | null>(null)

  const jobsRef = useRef(jobs)
  const activeJobIdRef = useRef(activeJobId)
  const nextJobIdRef = useRef(1)
  const hydratedRef = useRef(false)
  const persistTimerRef = useRef<number | null>(null)
  const reviewInFlightRef = useRef<Set<number>>(new Set())
  const expectedReviewRunIdsRef = useRef<Map<number, number>>(new Map())
  const saveStatusTimerRef = useRef<number | null>(null)

  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

  useEffect(() => {
    activeJobIdRef.current = activeJobId
  }, [activeJobId])

  const queuePersist = useCallback((nextJobs: RuntimeReviewJob[], nextActiveJobId: number | null) => {
    if (!hydratedRef.current) return

    setSaveStatus("saving")
    setSaveError(null)

    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current)
    }

    persistTimerRef.current = window.setTimeout(() => {
      void persistWorkspace(nextJobs, {
        activeJobId: nextActiveJobId,
        nextJobId: nextJobIdRef.current,
      }).then(() => {
        setSaveStatus("saved")
        if (saveStatusTimerRef.current != null) window.clearTimeout(saveStatusTimerRef.current)
        saveStatusTimerRef.current = window.setTimeout(() => setSaveStatus("idle"), 1600)
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to save review jobs locally"
        setSaveStatus("error")
        setSaveError(message)
      })
    }, 250)
  }, [])

  const replaceJobs = useCallback((
    updater: (current: RuntimeReviewJob[]) => RuntimeReviewJob[],
    options?: { activeJobId?: number | null },
  ) => {
    const nextActive = options && "activeJobId" in options
      ? options.activeJobId ?? null
      : activeJobIdRef.current

    setJobs((current) => {
      const next = sortJobs(updater(current))
      jobsRef.current = next
      queuePersist(next, nextActive)
      return next
    })

    if (options && "activeJobId" in options) {
      activeJobIdRef.current = options.activeJobId ?? null
      setActiveJobId(options.activeJobId ?? null)
    }
  }, [queuePersist])

  const updateJob = useCallback((
    jobId: number,
    updater: (job: RuntimeReviewJob) => RuntimeReviewJob,
  ) => {
    replaceJobs((current) => {
      let changed = false
      const next = current.map((job) => {
        if (job.id !== jobId) return job
        const updated = updater(job)
        if (updated === job) return job
        changed = true
        return touch(updated)
      })
      return changed ? next : current
    })
  }, [replaceJobs])

  const runReviewForJob = useCallback(async (jobId: number) => {
    if (reviewInFlightRef.current.has(jobId)) return

    const job = jobsRef.current.find((entry) => entry.id === jobId)
    if (!job || job.items.length === 0) return
    if (job.items.some((item) => item.status === "uploading")) return

    const reviewRunId = job.reviewRunId + 1
    const items = finalizeUploadingItems(job.items)
    reviewInFlightRef.current.add(jobId)
    expectedReviewRunIdsRef.current.set(jobId, reviewRunId)

    updateJob(jobId, (current) => ({
      ...current,
      phase: "reviewing",
      review: null,
      reviewSource: null,
      reviewRunId,
      errorMessage: null,
      completedAt: null,
      extractedAt: null,
      reviewStartedAt: null,
      exportedAt: null,
      expandedTags: [],
      decisions: {},
      viewer: null,
      extractionProgress: {
        stage: "reading",
        documentsTotal: items.length,
        documentsProcessed: 0,
        currentDocument: items[0]?.displayName ?? null,
      },
      items,
    }))

    const reviewingStartedAt = Date.now()

    try {
      const payload = await buildReviewDocuments(
        items.map((item) => ({
          displayName: item.displayName,
          kind: item.kind,
          byteSize: item.byteSize,
          pageCount: item.pageCount,
          files: item.files,
        })),
        (progress) => {
          if (expectedReviewRunIdsRef.current.get(jobId) !== reviewRunId) return
          updateJob(jobId, (entry) => ({
            ...entry,
            extractionProgress: {
              stage: "reading",
              documentsTotal: progress.documentsTotal,
              documentsProcessed: progress.documentsProcessed,
              currentDocument: progress.currentDocument,
            },
          }))
        },
      )

      if (!jobsRef.current.some((entry) => entry.id === jobId)) return
      if (expectedReviewRunIdsRef.current.get(jobId) !== reviewRunId) return

      updateJob(jobId, (entry) => ({
        ...entry,
        extractionProgress: {
          stage: "analyzing",
          documentsTotal: payload.length,
          documentsProcessed: payload.length,
          currentDocument: null,
        },
      }))

      const response = await startReview(payload)
      if (!jobsRef.current.some((entry) => entry.id === jobId)) return
      if (expectedReviewRunIdsRef.current.get(jobId) !== reviewRunId) return

      // Keep footer status messages readable when mock/API finishes instantly.
      const minReviewingMs = 5200
      const elapsed = Date.now() - reviewingStartedAt
      if (elapsed < minReviewingMs) {
        await new Promise((resolve) => window.setTimeout(resolve, minReviewingMs - elapsed))
      }
      if (!jobsRef.current.some((entry) => entry.id === jobId)) return
      if (expectedReviewRunIdsRef.current.get(jobId) !== reviewRunId) return

      updateJob(jobId, (entry) => ({
        ...entry,
        phase: "results",
        review: response.data,
        reviewSource: response.source,
        extractedAt: Date.now(),
        reviewStartedAt: entry.reviewStartedAt ?? Date.now(),
        errorMessage: null,
        extractionProgress: null,
        tags: [...new Set([...entry.tags, ...response.data.map((tag) => tag.tag)])],
      }))
    } catch (error: unknown) {
      if (!jobsRef.current.some((entry) => entry.id === jobId)) return
      if (expectedReviewRunIdsRef.current.get(jobId) !== reviewRunId) return

      updateJob(jobId, (entry) => ({
        ...entry,
        phase: "upload",
        review: null,
        reviewSource: null,
        extractionProgress: null,
        errorMessage: toUserFacingReviewError(error),
      }))
    } finally {
      reviewInFlightRef.current.delete(jobId)
    }
  }, [updateJob])

  const runReviewForJobRef = useRef(runReviewForJob)
  runReviewForJobRef.current = runReviewForJob

  useEffect(() => {
    let cancelled = false

    function seedEmptyWorkspace(nextJobId: number) {
      const job = createEmptyJob(nextJobId)
      nextJobIdRef.current = nextJobId + 1
      jobsRef.current = [job]
      activeJobIdRef.current = job.id
      setJobs([job])
      setActiveJobId(job.id)
      queuePersist([job], job.id)
    }

    void loadWorkspace()
      .then((workspace) => {
        if (cancelled) return
        hydratedRef.current = true
        nextJobIdRef.current = workspace.nextJobId

        if (workspace.jobs.length === 0) {
          seedEmptyWorkspace(workspace.nextJobId)
          setIsHydrating(false)
          return
        }

        jobsRef.current = workspace.jobs
        activeJobIdRef.current = workspace.activeJobId
        setJobs(workspace.jobs)
        setActiveJobId(workspace.activeJobId)
        setIsHydrating(false)

        for (const job of workspace.jobs) {
          if (job.phase === "reviewing") {
            void runReviewForJobRef.current(job.id)
          }
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        hydratedRef.current = true
        seedEmptyWorkspace(1)
        setIsHydrating(false)
        setSaveStatus("error")
        setSaveError(error instanceof Error ? error.message : "Failed to load saved review jobs")
      })

    return () => {
      cancelled = true
    }
  }, [queuePersist])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
        if (hydratedRef.current) {
          void persistWorkspace(jobsRef.current, {
            activeJobId: activeJobIdRef.current,
            nextJobId: nextJobIdRef.current,
          }).catch(() => {
            // best-effort flush on unmount
          })
        }
      }
      if (saveStatusTimerRef.current != null) {
        window.clearTimeout(saveStatusTimerRef.current)
      }
    }
  }, [])

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) ?? null,
    [jobs, activeJobId],
  )

  const selectJob = useCallback((jobId: number) => {
    if (activeJobIdRef.current === jobId) return

    // Snap in-progress uploads on the job we're leaving so state is durable.
    replaceJobs((current) => current.map((job) => {
      if (job.id !== activeJobIdRef.current) return job
      if (!job.items.some((item) => item.status === "uploading")) return job
      return touch({ ...job, items: finalizeUploadingItems(job.items) })
    }), { activeJobId: jobId })
  }, [replaceJobs])

  const createJob = useCallback(() => {
    const existingDraft = jobsRef.current.find((job) => (
      job.phase === "upload"
      && job.items.length === 0
      && !job.review
      && !job.errorMessage
    ))
    if (existingDraft) {
      if (activeJobIdRef.current !== existingDraft.id) {
        selectJob(existingDraft.id)
      }
      return existingDraft.id
    }

    const job = createEmptyJob(nextJobIdRef.current)
    nextJobIdRef.current += 1
    replaceJobs((current) => [...current, job], { activeJobId: job.id })
    return job.id
  }, [replaceJobs, selectJob])

  const renameJob = useCallback((jobId: number, name: string) => {
    const nextName = name.trim()
    if (!nextName) return
    updateJob(jobId, (job) => ({
      ...job,
      name: nextName,
      allowAutoName: false,
    }))
  }, [updateJob])

  const applySuggestedJobName = useCallback((jobId: number, name: string) => {
    const nextName = name.trim()
    if (!nextName) return
    updateJob(jobId, (job) => {
      if (!job.allowAutoName) return job
      return { ...job, name: nextName }
    })
  }, [updateJob])

  const pinJob = useCallback((jobId: number) => {
    updateJob(jobId, (job) => ({ ...job, pinned: !job.pinned }))
  }, [updateJob])

  const deleteJob = useCallback((jobId: number) => {
    reviewInFlightRef.current.delete(jobId)
    expectedReviewRunIdsRef.current.delete(jobId)
    const remaining = jobsRef.current.filter((job) => job.id !== jobId)

    if (remaining.length === 0) {
      const job = createEmptyJob(nextJobIdRef.current)
      nextJobIdRef.current += 1
      replaceJobs(() => [job], { activeJobId: job.id })
      return
    }

    const nextActive = activeJobIdRef.current === jobId
      ? remaining[0]?.id ?? null
      : activeJobIdRef.current
    replaceJobs(() => remaining, { activeJobId: nextActive })
  }, [replaceJobs])

  const suggestJobName = useCallback(async (
    jobId: number,
    entries: NewUploadEntry[],
  ) => {
    const documents = await buildReviewDocuments(entries.slice(0, 3).map((entry) => ({
      displayName: entry.displayName,
      kind: entry.kind,
      byteSize: entry.byteSize,
      pageCount: null,
      files: entry.files,
    })))
    const name = await generateJobName(documents)
    if (name) applySuggestedJobName(jobId, name)
  }, [applySuggestedJobName])

  const addUploads = useCallback((jobId: number, entries: NewUploadEntry[]) => {
    if (entries.length === 0) return [] as string[]

    const created: RuntimeUploadItem[] = entries.map((entry) => ({
      id: crypto.randomUUID(),
      file: entry.file,
      files: entry.files,
      displayName: entry.displayName,
      kind: entry.kind,
      byteSize: entry.byteSize,
      pageCount: null,
      progress: 0,
      status: "uploading",
    }))

    const fileNames = entries.flatMap((entry) => [
      entry.displayName,
      ...entry.files.map((file) => file.webkitRelativePath || file.name),
    ])

    const existing = jobsRef.current.find((entry) => entry.id === jobId)
    const shouldSuggestName = Boolean(existing?.allowAutoName)

    updateJob(jobId, (job) => {
      const shouldAutoName = job.allowAutoName
        && job.items.length === 0
        && (job.name === "Untitled review job" || job.name === "Untitled review")
      return {
        ...job,
        name: shouldAutoName ? createJobNameFromFile(entries[0].file) : job.name,
        items: [...job.items, ...created],
        fileNames: [...new Set([...job.fileNames, ...fileNames])],
        uploadedAt: job.uploadedAt ?? Date.now(),
      }
    })

    if (shouldSuggestName) {
      void suggestJobName(jobId, entries)
    }

    void buildReviewDocuments(entries.map((entry) => ({
      displayName: entry.displayName,
      kind: entry.kind,
      byteSize: entry.byteSize,
      pageCount: null,
      files: entry.files,
    }))).then((documents) => {
      if (!jobsRef.current.some((entry) => entry.id === jobId)) return
      updateJob(jobId, (entry) => ({
        ...entry,
        fileContent: [
          ...entry.fileContent,
          ...documents.flatMap((document) => document.pages.map((page) => page.text)),
        ],
      }))
    })

    return created.map((item) => item.id)
  }, [suggestJobName, updateJob])

  const patchUploadItem = useCallback((
    jobId: number,
    itemId: string,
    patch: Partial<Pick<RuntimeUploadItem, "progress" | "status" | "pageCount">>,
  ) => {
    const shouldPersist = patch.status !== undefined || patch.pageCount !== undefined

    setJobs((current) => {
      const next = current.map((job) => {
        if (job.id !== jobId) return job
        return {
          ...job,
          updatedAt: shouldPersist ? Date.now() : job.updatedAt,
          items: job.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
        }
      })

      const sorted = shouldPersist ? sortJobs(next) : next
      jobsRef.current = sorted

      if (shouldPersist) {
        queuePersist(sorted, activeJobIdRef.current)
      }

      return sorted
    })
  }, [queuePersist])

  const removeUploadItem = useCallback((jobId: number, itemId: string) => {
    updateJob(jobId, (job) => ({
      ...job,
      items: job.items.filter((item) => item.id !== itemId),
    }))
  }, [updateJob])

  const startJobReview = useCallback((jobId: number) => {
    void runReviewForJob(jobId)
  }, [runReviewForJob])

  const toggleTag = useCallback((jobId: number, tag: string) => {
    updateJob(jobId, (job) => ({
      ...job,
      reviewStartedAt: job.reviewStartedAt ?? Date.now(),
      expandedTags: job.expandedTags.includes(tag) ? [] : [tag],
    }))
  }, [updateJob])

  const decideTag = useCallback((jobId: number, occurrenceKey: string, decision: TagDecision) => {
    updateJob(jobId, (job) => {
      const next = { ...job.decisions }
      if (next[occurrenceKey] === decision) {
        delete next[occurrenceKey]
      } else {
        next[occurrenceKey] = decision
      }

      const draft = {
        ...job,
        decisions: next,
        reviewStartedAt: job.reviewStartedAt ?? Date.now(),
      }
      const { decided, total } = getDecidedReviewProgress(draft)
      const isComplete = total > 0 && decided === total

      return {
        ...draft,
        // Auto-complete when every occurrence has a decision; reopen if one is cleared.
        completedAt: isComplete ? (job.completedAt ?? Date.now()) : null,
        viewer: isComplete ? null : job.viewer,
      }
    })
  }, [updateJob])

  const markJobComplete = useCallback((jobId: number) => {
    updateJob(jobId, (job) => {
      const { resolved, total } = getResolvedReviewProgress(job)
      if (total === 0 || resolved !== total) return job
      return { ...job, completedAt: Date.now(), viewer: null }
    })
  }, [updateJob])

  const markJobExported = useCallback((jobId: number) => {
    updateJob(jobId, (job) => ({
      ...job,
      exportedAt: Date.now(),
    }))
  }, [updateJob])

  const setViewer = useCallback((
    jobId: number,
    viewer: ReviewViewerTarget | null,
  ) => {
    updateJob(jobId, (job) => {
      const next = normalizeViewer(viewer)
      const prev = job.viewer
      if (prev === next) return job
      if (
        prev
        && next
        && prev.tag === next.tag
        && prev.documentName === next.documentName
        && prev.page === next.page
      ) {
        return job
      }
      if (!prev && !next) return job
      return { ...job, viewer: next }
    })
  }, [updateJob])

  // Keep meta.activeJobId warm even when jobs array is unchanged besides selection.
  useEffect(() => {
    if (!hydratedRef.current || isHydrating) return
    void persistMeta({
      activeJobId,
      nextJobId: nextJobIdRef.current,
    }).catch(() => {
      // workspace persist will also write meta; ignore isolated meta failures
    })
  }, [activeJobId, isHydrating])

  return {
    jobs,
    activeJob,
    activeJobId,
    isHydrating,
    saveStatus,
    saveError,
    createJob,
    selectJob,
    renameJob,
    pinJob,
    deleteJob,
    addUploads,
    patchUploadItem,
    removeUploadItem,
    startJobReview,
    toggleTag,
    decideTag,
    markJobComplete,
    markJobExported,
    setViewer,
  }
}
