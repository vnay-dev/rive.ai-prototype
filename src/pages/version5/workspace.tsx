import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import { ArrowLeft, ArrowRight, Astroid, LoaderCircle, Pause, Play, Trash2, Upload, X } from "lucide-react"

import { AppHeader } from "@/components/layout/app-header"
import { GridLayout } from "@/components/layout/grid-layout"
import { ExportMenu } from "@/components/review/export-menu"
import { ExtractionStatusMessage } from "@/components/review/processing-status"
import { ReviewJobsMenu } from "@/components/review/review-jobs-menu"
import { ReviewSummaryPanel } from "@/components/review/review-summary-panel"
import { type TagDecision } from "@/components/review/tag-review-panel"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TickerNumber } from "@/components/ui/ticker-number"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { NewUploadEntry } from "@/hooks/use-review-jobs"
import { buildReviewExportRows } from "@/lib/export-review"
import { groupExtractedTags } from "@/lib/review"
import { getPublicAssetUrl } from "@/lib/media-assets"
import { resolvePageCount } from "@/lib/extract-document-text"
import {
  getDecidedReviewProgress,
  getExtractionSummary,
  isListedReviewJob,
  sortJobs,
  type ReviewViewerTarget,
  type RuntimeReviewJob,
  type RuntimeUploadItem,
  type UploadItemKind,
} from "@/lib/review-jobs"
import type { Version5JobsContext } from "./layout"
import { DocumentReviewCanvas } from "./document-review-canvas"

const PREVIEW_AUTO_ADVANCE_MS = 4500

const PREVIEW_STEPS = [
  {
    title: "Bring your engineering drawings",
    subtitle: "P&IDs, PDFs, folders, and ZIP archives are all supported.",
    illustration: getPublicAssetUrl("illustrations/folders.png"),
  },
  {
    title: "AI extracts engineering tags",
    subtitle: "Occurrences are grouped so you can review them in one place.",
    illustration: getPublicAssetUrl("illustrations/processing.png"),
  },
  {
    title: "Validate and export",
    subtitle: "Approve, reject, or mark tags that need review, then export results.",
    illustration: getPublicAssetUrl("illustrations/results.png"),
  },
] as const

const PREVIEW_DISMISSED_KEY = "rive.upload-preview.dismissed"

function readPreviewDismissed() {
  try {
    return window.localStorage.getItem(PREVIEW_DISMISSED_KEY) === "1"
  } catch {
    return false
  }
}

function markPreviewDismissed() {
  try {
    window.localStorage.setItem(PREVIEW_DISMISSED_KEY, "1")
  } catch {
    // Ignore private-mode / quota failures.
  }
}

type DuplicatePrompt = {
  conflictName: string
  suggestedName: string
}

type PendingDuplicate = {
  file: File
  files: File[]
  conflictName: string
  kind: UploadItemKind
  byteSize: number
}

type UploadViewProps = {
  job: RuntimeReviewJob
  prevJob: RuntimeReviewJob | null
  nextJob: RuntimeReviewJob | null
  onGoToJob: (jobId: number) => void
  onAddUploads: (entries: NewUploadEntry[]) => string[]
  onPatchUploadItem: (
    itemId: string,
    patch: Partial<Pick<RuntimeUploadItem, "progress" | "status" | "pageCount">>,
  ) => void
  onRemoveUploadItem: (itemId: string) => void
  onStartReview: () => void
  onMarkExported: () => void
  onDecideTag: (occurrenceKey: string, decision: TagDecision) => void
  onSetViewer: (viewer: ReviewViewerTarget | null) => void
}

function JobNavButton({
  direction,
  target,
  onGoToJob,
}: {
  direction: "prev" | "next"
  target: RuntimeReviewJob | null
  onGoToJob: (jobId: number) => void
}) {
  const isPrev = direction === "prev"
  const label = isPrev ? "Previous review job" : "Next review job"
  const emptyLabel = isPrev ? "No previous review job" : "No next review job"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="job-switcher-tooltip-target">
          <button
            aria-label={label}
            className="job-switcher-button"
            disabled={!target}
            onClick={() => target && onGoToJob(target.id)}
            type="button"
          >
            {isPrev ? (
              <ArrowLeft aria-hidden="true" size={15} strokeWidth={2} />
            ) : (
              <ArrowRight aria-hidden="true" size={15} strokeWidth={2} />
            )}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{target ? label : emptyLabel}</TooltipContent>
    </Tooltip>
  )
}

function JobTitleRow({
  prevJob,
  nextJob,
  onGoToJob,
  children,
}: {
  prevJob: RuntimeReviewJob | null
  nextJob: RuntimeReviewJob | null
  onGoToJob: (jobId: number) => void
  children: ReactNode
}) {
  const canSwitchJobs = Boolean(prevJob || nextJob)

  if (!canSwitchJobs) {
    return children
  }

  return (
    <div className="page-header-title-row" role="group" aria-label="Switch review job">
      {children}
      <span className="job-switcher-controls">
        <JobNavButton direction="prev" onGoToJob={onGoToJob} target={prevJob} />
        <JobNavButton direction="next" onGoToJob={onGoToJob} target={nextJob} />
      </span>
    </div>
  )
}

function UploadView({
  job,
  prevJob,
  nextJob,
  onGoToJob,
  onAddUploads,
  onPatchUploadItem,
  onRemoveUploadItem,
  onStartReview,
  onMarkExported,
  onDecideTag,
  onSetViewer,
}: UploadViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const uploadTimersRef = useRef<Map<string, number>>(new Map())
  const itemsRef = useRef(job.items)
  const pendingDuplicatesRef = useRef<PendingDuplicate[]>([])
  const isPromptOpenRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePrompt | null>(null)
  const [previewStep, setPreviewStep] = useState(0)
  const [isPreviewUserPaused, setIsPreviewUserPaused] = useState(false)
  const [isPreviewHoldPaused, setIsPreviewHoldPaused] = useState(false)
  const [isPreviewDismissed, setIsPreviewDismissed] = useState(readPreviewDismissed)
  const showUploadEmpty = job.phase === "upload" && job.items.length === 0
  const showPreview = showUploadEmpty && !isPreviewDismissed
  const isPreviewPaused = isPreviewUserPaused || isPreviewHoldPaused
  const showHeaderUploadActions = job.phase === "upload" && job.items.length > 0

  useEffect(() => {
    itemsRef.current = job.items
  }, [job.items])

  useEffect(() => {
    if (job.items.length === 0) return
    markPreviewDismissed()
    setIsPreviewDismissed(true)
  }, [job.items.length])

  useEffect(() => {
    if (!showPreview || isPreviewPaused) return

    const timer = window.setInterval(() => {
      setPreviewStep((step) => (step + 1) % PREVIEW_STEPS.length)
    }, PREVIEW_AUTO_ADVANCE_MS)

    return () => window.clearInterval(timer)
  }, [showPreview, previewStep, isPreviewPaused])

  function dismissPreview() {
    markPreviewDismissed()
    setIsPreviewDismissed(true)
  }

  const isUploading = job.items.some((item) => item.status === "uploading")
  const isExtracting = job.phase === "reviewing"
  const showUploadFiles = (job.phase === "upload" || isExtracting) && job.items.length > 0
  const documentCountLabel = `${job.items.length} ${job.items.length === 1 ? "document" : "documents"}`
  const extractFooterStatus = isExtracting
    ? null
    : job.errorMessage
      ? job.errorMessage
      : isUploading
        ? `Uploading ${job.items.filter((item) => item.status === "uploading").length} of ${job.items.length}`
        : `${documentCountLabel} uploaded`
  const fallbackDocumentName = job.items[0]?.displayName ?? "Uploaded document"

  const tagGroups = useMemo(
    () => (job.review ? groupExtractedTags(job.review, fallbackDocumentName) : []),
    [job.review, fallbackDocumentName],
  )

  const isReviewComplete = Boolean(job.completedAt)
  const isResultsView = job.phase === "results" && Boolean(job.review)
  const isDocumentReview = isResultsView && !isReviewComplete
  const showJobSwitcher = isResultsView
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [statusAnnouncement, setStatusAnnouncement] = useState("")
  const prevPhaseRef = useRef(job.phase)
  const prevCompletedRef = useRef(Boolean(job.completedAt))
  const prevExportedRef = useRef(Boolean(job.exportedAt))

  useEffect(() => {
    const prevPhase = prevPhaseRef.current
    const prevCompleted = prevCompletedRef.current
    const prevExported = prevExportedRef.current
    prevPhaseRef.current = job.phase
    prevCompletedRef.current = Boolean(job.completedAt)
    prevExportedRef.current = Boolean(job.exportedAt)

    if (prevPhase === "reviewing" && job.phase === "results") {
      setStatusAnnouncement("Tag extraction complete. Review results are ready.")
      return
    }
    if (!prevCompleted && job.completedAt) {
      setStatusAnnouncement("All tags reviewed — job complete.")
      return
    }
    if (!prevExported && job.exportedAt) {
      setStatusAnnouncement("Export complete.")
    }
  }, [job.phase, job.completedAt, job.exportedAt])

  const extractionSummary = useMemo(
    () => (job.review ? getExtractionSummary(job.review, fallbackDocumentName) : null),
    [job.review, fallbackDocumentName],
  )
  const exportRows = useMemo(
    () => buildReviewExportRows(job.review ?? [], job.decisions, fallbackDocumentName),
    [job.review, job.decisions, fallbackDocumentName],
  )
  const reviewProgress = useMemo(
    () => getDecidedReviewProgress(job, fallbackDocumentName),
    [job, fallbackDocumentName],
  )
  const pageTitle = job.name
  const pageSubtitle = job.phase === "reviewing"
    ? null
    : job.phase === "results"
      ? (isReviewComplete && extractionSummary ? (
        <>
          Review completed for{" "}
          <span className="page-subtitle-emphasis">
            {extractionSummary.occurrences}{" "}
            {extractionSummary.occurrences === 1 ? "occurrence" : "occurrences"}
          </span>
          {" "}across{" "}
          <span className="page-subtitle-emphasis">
            {extractionSummary.tags}{" "}
            {extractionSummary.tags === 1 ? "engineering tag" : "engineering tags"}
          </span>
          {" "}in{" "}
          <span className="page-subtitle-emphasis">
            {extractionSummary.documents}{" "}
            {extractionSummary.documents === 1 ? "document" : "documents"}
          </span>
          .
        </>
      ) : extractionSummary ? (
        <>
          Found{" "}
          <span className="page-subtitle-emphasis">
            {extractionSummary.tags} {extractionSummary.tags === 1 ? "engineering tag" : "engineering tags"}
          </span>
          {" "}across{" "}
          <span className="page-subtitle-emphasis">
            {extractionSummary.occurrences} {extractionSummary.occurrences === 1 ? "occurrence" : "occurrences"}
          </span>
          {" "}in{" "}
          <span className="page-subtitle-emphasis">
            {extractionSummary.documents} {extractionSummary.documents === 1 ? "document" : "documents"}
          </span>
          .
        </>
      ) : (
        "Review extracted tags in the document."
      ))
      : "Add P&IDs or PDFs, then extract tags for review."

  useEffect(() => {
    const timers = uploadTimersRef.current
    return () => {
      for (const timer of timers.values()) {
        window.clearInterval(timer)
      }
      timers.clear()
    }
  }, [])

  function originalName(file: File) {
    return file.webkitRelativePath || file.name
  }

  function nextDuplicateName(name: string, existingNames: Set<string>) {
    const lastSlash = name.lastIndexOf("/")
    const directory = lastSlash >= 0 ? name.slice(0, lastSlash + 1) : ""
    const filename = lastSlash >= 0 ? name.slice(lastSlash + 1) : name
    const lastDot = filename.lastIndexOf(".")
    const hasExtension = lastDot > 0
    const stem = hasExtension ? filename.slice(0, lastDot) : filename
    const extension = hasExtension ? filename.slice(lastDot) : ""

    let copy = 1
    let candidate = `${directory}${stem} (${copy})${extension}`
    while (existingNames.has(candidate.toLowerCase())) {
      copy += 1
      candidate = `${directory}${stem} (${copy})${extension}`
    }
    return candidate
  }

  function existingNameSet() {
    return new Set(itemsRef.current.map((item) => item.displayName.toLowerCase()))
  }

  function startUpload(itemId: string) {
    const durationMs = 2200 + Math.random() * 1800
    const startedAt = performance.now()

    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt
      const progress = Math.min(100, Math.round((elapsed / durationMs) * 100))

      if (progress >= 100) {
        onPatchUploadItem(itemId, { progress: 100, status: "ready" })
        window.clearInterval(timer)
        uploadTimersRef.current.delete(itemId)
      } else {
        onPatchUploadItem(itemId, { progress })
      }
    }, 80)

    uploadTimersRef.current.set(itemId, timer)
  }

  function enqueueUploads(entries: NewUploadEntry[]) {
    if (entries.length === 0) return
    const createdIds = onAddUploads(entries)
    for (let index = 0; index < createdIds.length; index += 1) {
      const itemId = createdIds[index]
      const matchedEntry = entries[index]
      if (!itemId || !matchedEntry) continue
      startUpload(itemId)
      void resolvePageCount(matchedEntry.files).then((pageCount) => {
        onPatchUploadItem(itemId, { pageCount })
      })
    }
  }

  function showNextDuplicatePrompt() {
    const nextItem = pendingDuplicatesRef.current[0]
    if (!nextItem) {
      isPromptOpenRef.current = false
      setDuplicatePrompt(null)
      return
    }

    const suggestedName = nextDuplicateName(nextItem.conflictName, existingNameSet())
    isPromptOpenRef.current = true
    setDuplicatePrompt({ conflictName: nextItem.conflictName, suggestedName })
  }

  function buildUploadEntries(incoming: File[], options?: { asFolder?: boolean }) {
    const accepted: NewUploadEntry[] = []
    const duplicates: PendingDuplicate[] = []
    const reservedNames = existingNameSet()

    if (options?.asFolder || incoming.some((file) => Boolean(file.webkitRelativePath))) {
      const groups = new Map<string, File[]>()
      for (const file of incoming) {
        const folderName = file.webkitRelativePath?.split("/")[0] || file.name
        const group = groups.get(folderName) ?? []
        group.push(file)
        groups.set(folderName, group)
      }

      for (const [folderName, files] of groups) {
        const byteSize = files.reduce((total, file) => total + file.size, 0)
        if (reservedNames.has(folderName.toLowerCase())) {
          duplicates.push({
            file: files[0],
            files,
            conflictName: folderName,
            kind: "folder",
            byteSize,
          })
          continue
        }
        reservedNames.add(folderName.toLowerCase())
        accepted.push({
          file: files[0],
          files,
          displayName: folderName,
          kind: "folder",
          byteSize,
        })
      }

      return { accepted, duplicates }
    }

    for (const file of incoming) {
      const name = originalName(file)
      const kind = getUploadKind(file)
      if (reservedNames.has(name.toLowerCase())) {
        duplicates.push({
          file,
          files: [file],
          conflictName: name,
          kind,
          byteSize: file.size,
        })
        continue
      }

      reservedNames.add(name.toLowerCase())
      accepted.push({
        file,
        files: [file],
        displayName: name,
        kind,
        byteSize: file.size,
      })
    }

    return { accepted, duplicates }
  }

  function addFiles(incoming: FileList | File[], options?: { asFolder?: boolean }) {
    const next = Array.from(incoming)
    if (next.length === 0) return

    const { accepted, duplicates } = buildUploadEntries(next, options)
    enqueueUploads(accepted)

    if (duplicates.length > 0) {
      pendingDuplicatesRef.current = [...pendingDuplicatesRef.current, ...duplicates]
      if (!isPromptOpenRef.current) {
        showNextDuplicatePrompt()
      }
    }
  }

  function resolveDuplicate(shouldUpload: boolean) {
    const current = pendingDuplicatesRef.current[0]
    if (!current) return

    pendingDuplicatesRef.current = pendingDuplicatesRef.current.slice(1)

    if (shouldUpload) {
      enqueueUploads([{
        file: current.file,
        files: current.files,
        displayName: nextDuplicateName(current.conflictName, existingNameSet()),
        kind: current.kind,
        byteSize: current.byteSize,
      }])
    }

    showNextDuplicatePrompt()
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files)
    }
  }

  function removeFile(itemId: string) {
    const timer = uploadTimersRef.current.get(itemId)
    if (timer) {
      window.clearInterval(timer)
      uploadTimersRef.current.delete(itemId)
    }
    onRemoveUploadItem(itemId)
  }

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>
      {isDocumentReview ? (
        <header className="page-header version5-review-page-header">
          <div className="page-header-main">
            <div className="page-header-titles">
              <JobTitleRow nextJob={nextJob} onGoToJob={onGoToJob} prevJob={prevJob}>
                <h1>{job.name}</h1>
              </JobTitleRow>
              <p className="page-subtitle" aria-live="polite">
                <TickerNumber value={reviewProgress.decided} />
                {" / "}
                {reviewProgress.total} occurrences reviewed
              </p>
            </div>
            <div className="page-header-actions">
              <button
                aria-expanded={summaryOpen}
                className="secondary-button"
                onClick={() => setSummaryOpen((open) => !open)}
                type="button"
              >
                View summary
              </button>
            </div>
          </div>
        </header>
      ) : (
        <header className="page-header">
          <div className="page-header-main">
            <div className="page-header-titles">
              {showJobSwitcher ? (
                <JobTitleRow nextJob={nextJob} onGoToJob={onGoToJob} prevJob={prevJob}>
                  <h1>{pageTitle}</h1>
                </JobTitleRow>
              ) : (
                <h1 className={isExtracting ? "page-title-with-spinner" : undefined}>
                  {isExtracting && (
                    <LoaderCircle
                      aria-hidden="true"
                      className="page-title-spinner"
                      size={22}
                      strokeWidth={2.2}
                    />
                  )}
                  {pageTitle}
                </h1>
              )}
              {isExtracting ? (
                <ExtractionStatusMessage
                  className="page-subtitle page-subtitle-extracting"
                  progress={job.extractionProgress}
                />
              ) : pageSubtitle ? (
                <p className="page-subtitle">{pageSubtitle}</p>
              ) : null}
            </div>
            {showHeaderUploadActions ? (
              <div className="page-header-actions">
                <span className="upload-actions">
                  <button className="secondary-button" onClick={() => folderInputRef.current?.click()} type="button">
                    Choose folder
                  </button>
                  <button className="primary-button" onClick={() => fileInputRef.current?.click()} type="button">
                    Choose files
                  </button>
                </span>
              </div>
            ) : showJobSwitcher && isReviewComplete ? (
              <div className="page-header-actions">
                <ExportMenu
                  jobName={job.name}
                  onExported={onMarkExported}
                  rows={exportRows}
                />
              </div>
            ) : null}
          </div>
        </header>
      )}

      {job.phase === "upload" && (
        <>
          <input
            accept=".zip,application/zip,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
            aria-label="Choose files"
            className="sr-only"
            multiple
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files)
                event.target.value = ""
              }
            }}
            ref={fileInputRef}
            tabIndex={-1}
            type="file"
          />
          <input
            aria-label="Choose folder"
            className="sr-only"
            multiple
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files, { asFolder: true })
                event.target.value = ""
              }
            }}
            ref={(node) => {
              folderInputRef.current = node
              if (node) node.setAttribute("webkitdirectory", "")
            }}
            tabIndex={-1}
            type="file"
          />
        </>
      )}

      {job.phase === "results" && job.review && isReviewComplete ? (
        <ReviewSummaryPanel rows={exportRows} tagGroups={tagGroups} />
      ) : job.phase === "results" && job.review ? (
        <DocumentReviewCanvas
          exportRows={exportRows}
          fallbackDocument={fallbackDocumentName}
          findDocumentFile={findDocumentFile}
          job={job}
          jobName={job.name}
          onDecideTag={onDecideTag}
          onMarkExported={onMarkExported}
          onSetViewer={onSetViewer}
          onSummaryOpenChange={setSummaryOpen}
          summaryOpen={summaryOpen}
        />
      ) : showUploadEmpty ? (
        <div
          className={`upload-start${isDragging ? " is-dragging" : ""}`}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {showPreview && (
            <section
              aria-label="Product preview"
              aria-roledescription="carousel"
              className={`upload-placeholder${isPreviewPaused ? " is-paused" : ""}`}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setIsPreviewHoldPaused(false)
                }
              }}
              onFocus={() => setIsPreviewHoldPaused(true)}
              onMouseEnter={() => setIsPreviewHoldPaused(true)}
              onMouseLeave={() => setIsPreviewHoldPaused(false)}
            >
              <div className="upload-placeholder-frame">
                <div aria-hidden="true" className="upload-placeholder-media">
                  {PREVIEW_STEPS.map((step, index) => (
                    <img
                      alt=""
                      className={`upload-placeholder-illustration${index === previewStep ? " is-active" : ""}`}
                      decoding="async"
                      key={step.illustration}
                      src={step.illustration}
                    />
                  ))}
                </div>
                <div className="upload-placeholder-content">
                  <div className="upload-placeholder-toolbar">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          aria-label={isPreviewUserPaused ? "Play preview" : "Pause preview"}
                          className="upload-placeholder-pause"
                          onClick={() => setIsPreviewUserPaused((paused) => !paused)}
                          type="button"
                        >
                          {isPreviewUserPaused ? (
                            <Play aria-hidden="true" size={15} strokeWidth={1.9} />
                          ) : (
                            <Pause aria-hidden="true" size={15} strokeWidth={1.9} />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{isPreviewUserPaused ? "Play" : "Pause"}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          aria-label="Close preview"
                          className="upload-placeholder-close"
                          onClick={dismissPreview}
                          type="button"
                        >
                          <X aria-hidden="true" size={16} strokeWidth={1.9} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Close preview</TooltipContent>
                    </Tooltip>
                  </div>
                  <div
                    aria-atomic="true"
                    aria-live="polite"
                    className="upload-placeholder-copy"
                    key={previewStep}
                  >
                    <h3>{PREVIEW_STEPS[previewStep].title}</h3>
                    <p>{PREVIEW_STEPS[previewStep].subtitle}</p>
                  </div>
                  <div
                    aria-label="Preview steps"
                    className="upload-placeholder-steps"
                    role="tablist"
                  >
                    {PREVIEW_STEPS.map((step, index) => (
                      <button
                        aria-label={`Go to step ${index + 1}: ${step.title}`}
                        aria-selected={index === previewStep}
                        className={`upload-placeholder-dot${index === previewStep ? " is-active" : ""}`}
                        key={step.title}
                        onClick={() => {
                          setPreviewStep(index)
                          setIsPreviewUserPaused(true)
                        }}
                        role="tab"
                        type="button"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
          <section
            aria-label="Upload documents"
            className="upload-empty"
            onClick={() => fileInputRef.current?.click()}
          >
            <div aria-hidden="true" className="upload-empty-visual">
              <Upload size={28} strokeWidth={1.6} />
            </div>
            <div className="upload-empty-copy">
              <h3>Upload documents</h3>
              <p>
                Drag and drop drawings, P&amp;IDs, PDFs, folders, or ZIP archives to extract tags.
              </p>
            </div>
            <span className="upload-actions">
              <button
                className="secondary-button"
                onClick={(event) => {
                  event.stopPropagation()
                  folderInputRef.current?.click()
                }}
                type="button"
              >
                Choose folder
              </button>
              <button
                className="primary-button"
                onClick={(event) => {
                  event.stopPropagation()
                  fileInputRef.current?.click()
                }}
                type="button"
              >
                Choose files
              </button>
            </span>
          </section>
        </div>
      ) : showUploadFiles ? (
        <section
          aria-label="Uploaded documents"
          className={`upload-file-list${isDragging ? " is-dragging" : ""}${isExtracting ? " is-extracting" : ""}`}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <ul>
            {job.items.map((item) => (
              <li className={`job-row upload-file-row${item.status === "uploading" ? " is-uploading" : ""}`} key={item.id}>
                <div className="upload-file-meta">
                  <span className="job-name">{item.displayName}</span>
                  <span className="upload-file-details">
                    {formatPageCount(item.pageCount)}
                    <span aria-hidden="true">{" \u00B7 "}</span>
                    {formatFileSize(item.byteSize)}
                    <span aria-hidden="true">{" \u00B7 "}</span>
                    {formatUploadKind(item.kind)}
                  </span>
                </div>
                <span className="upload-file-progress">
                  {item.status === "uploading" && (
                    <>
                      <span className="job-date" aria-hidden="true">{item.progress}%</span>
                      <span
                        aria-label={`Uploading ${item.displayName}`}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={item.progress}
                        aria-valuetext={`${item.progress} percent`}
                        className="upload-progress"
                        role="progressbar"
                      >
                        <span className="upload-progress-bar" style={{ width: `${item.progress}%` }} />
                      </span>
                    </>
                  )}
                </span>
                {!isExtracting && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        aria-label={item.status === "uploading" ? "Cancel upload" : "Remove file"}
                        className="upload-file-remove"
                        onClick={() => removeFile(item.id)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={15} strokeWidth={1.9} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {item.status === "uploading" ? "Cancel upload" : "Remove file"}
                    </TooltipContent>
                  </Tooltip>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showUploadFiles && (
        <div className="upload-extract-footer" aria-busy={isExtracting || undefined}>
          {extractFooterStatus ? (
            <p
              className={`upload-extract-footer-count${job.errorMessage && !isExtracting ? " is-error" : ""}`}
              role={job.errorMessage && !isExtracting ? "alert" : undefined}
            >
              {extractFooterStatus}
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <Tooltip open={isUploading && !isExtracting ? undefined : false}>
            <TooltipTrigger asChild>
              <span className="review-complete-tooltip-target">
                <button
                  aria-label={isExtracting ? "Extracting tags" : "Extract tags"}
                  className="primary-button"
                  disabled={isUploading || isExtracting}
                  onClick={onStartReview}
                  type="button"
                >
                  {isExtracting ? (
                    <>
                      <LoaderCircle aria-hidden="true" className="button-spinner" size={16} strokeWidth={2.2} />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Astroid aria-hidden="true" size={16} strokeWidth={2.2} />
                      Extract tags
                    </>
                  )}
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Wait for uploads to finish</TooltipContent>
          </Tooltip>
        </div>
      )}

      {duplicatePrompt && (
        <ConfirmDialog
          cancelLabel="Skip"
          confirmLabel="Upload anyway"
          description={(
            <>
              A file named <strong>{duplicatePrompt.conflictName}</strong> is already in this review.
              Upload this one as <strong>{duplicatePrompt.suggestedName}</strong>?
            </>
          )}
          onCancel={() => resolveDuplicate(false)}
          onConfirm={() => resolveDuplicate(true)}
          title="File already added"
        />
      )}
    </>
  )
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatPageCount(pageCount: number | null) {
  if (pageCount === null) return "Counting pages…"
  return `${pageCount} ${pageCount === 1 ? "page" : "pages"}`
}

function formatUploadKind(kind: UploadItemKind) {
  if (kind === "folder") return "Folder"
  if (kind === "zip") return "Zip"
  return "File"
}

function baseName(name: string) {
  const segments = name.split(/[\\/]/)
  return segments[segments.length - 1]
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

/** Resolves the uploaded file a review result refers to, by upload name or file name. */
function findDocumentFile(items: RuntimeUploadItem[], documentName: string): File | null {
  const target = documentName.trim().toLowerCase()
  const targetBaseName = baseName(target)

  for (const item of items) {
    if (item.displayName.toLowerCase() !== target) continue
    return item.files.find(isPdfFile) ?? item.files[0] ?? null
  }

  for (const item of items) {
    if (baseName(item.displayName.toLowerCase()) !== targetBaseName) continue
    return item.files.find(isPdfFile) ?? item.files[0] ?? null
  }

  for (const item of items) {
    for (const file of item.files) {
      const name = (file.webkitRelativePath || file.name).toLowerCase()
      if (name === target || baseName(name) === targetBaseName) return file
    }
  }

  for (const item of items) {
    const display = item.displayName.toLowerCase()
    if (display.includes(target) || target.includes(display)) {
      return item.files.find(isPdfFile) ?? item.files[0] ?? null
    }
  }

  return items[0]?.files.find(isPdfFile) ?? items[0]?.files[0] ?? null
}

function getUploadKind(file: File): UploadItemKind {
  const name = file.name.toLowerCase()
  if (name.endsWith(".zip") || file.type.includes("zip")) return "zip"
  return "file"
}

/** Version 5 workspace — opened from the Review Jobs table via /version5/jobs/:jobId. */
export function Version5Workspace() {
  const navigate = useNavigate()
  const { jobId: jobIdParam } = useParams<{ jobId: string }>()
  const {
    jobs,
    activeJob,
    activeJobId,
    isHydrating,
    selectJob,
    addUploads,
    patchUploadItem,
    removeUploadItem,
    startJobReview,
    decideTag,
    markJobExported,
    setViewer,
  } = useOutletContext<Version5JobsContext>()

  const jobId = Number(jobIdParam)

  const { prevJob, nextJob } = useMemo(() => {
    const ordered = sortJobs(jobs)
    const index = ordered.findIndex((job) => job.id === jobId)
    if (index < 0) return { prevJob: null, nextJob: null }
    return {
      prevJob: ordered[index - 1] ?? null,
      nextJob: ordered[index + 1] ?? null,
    }
  }, [jobs, jobId])

  const hasListedJobs = useMemo(() => jobs.some(isListedReviewJob), [jobs])

  useEffect(() => {
    if (isHydrating) return
    if (!Number.isFinite(jobId)) {
      navigate("/version5", { replace: true })
      return
    }
    const exists = jobs.some((job) => job.id === jobId)
    if (!exists) {
      navigate("/version5", { replace: true })
      return
    }
    if (activeJobId !== jobId) {
      selectJob(jobId)
    }
  }, [activeJobId, isHydrating, jobId, jobs, navigate, selectJob])

  return (
    <div className="app-shell version5 is-job-workspace">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <AppHeader
        {...(hasListedJobs
          ? { actions: <ReviewJobsMenu activeJobId={activeJobId} jobs={jobs} /> }
          : {})}
        brandAriaLabel="Prototype versions"
        brandTo="/"
      />
      <main className="app-main" id="main-content">
        <GridLayout className="upload-layout">
          {isHydrating || !activeJob || activeJob.id !== jobId ? (
            <section className="workspace-loading" aria-live="polite">
              <h1>Loading review job…</h1>
              <p>Restoring your locally saved session.</p>
            </section>
          ) : (
            <UploadView
              key={activeJob.id}
              job={activeJob}
              nextJob={nextJob}
              onAddUploads={(entries) => addUploads(activeJob.id, entries)}
              onDecideTag={(occurrenceKey, decision) => decideTag(activeJob.id, occurrenceKey, decision)}
              onGoToJob={(id) => navigate(`/version5/jobs/${id}`)}
              onMarkExported={() => markJobExported(activeJob.id)}
              onPatchUploadItem={(itemId, patch) => patchUploadItem(activeJob.id, itemId, patch)}
              onRemoveUploadItem={(itemId) => removeUploadItem(activeJob.id, itemId)}
              onSetViewer={(viewer) => setViewer(activeJob.id, viewer)}
              onStartReview={() => startJobReview(activeJob.id)}
              prevJob={prevJob}
            />
          )}
        </GridLayout>
      </main>
    </div>
  )
}
