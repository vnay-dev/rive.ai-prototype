import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { Check, Circle, CircleAlert, FileText, LoaderCircle, Search, Trash2, Upload } from "lucide-react"

import { AppLayout } from "@/components/layout/app-layout"
import { GridLayout } from "@/components/layout/grid-layout"
import { ExportSummaryDialog } from "@/components/review/export-summary-dialog"
import { ExtractionSummaryPanel } from "@/components/review/extraction-summary-panel"
import { JobHistoryDialog } from "@/components/review/job-history-dialog"
import { PdfViewerPanel } from "@/components/review/pdf-viewer-panel"
import { ProcessingStatus } from "@/components/review/processing-status"
import { ReviewSummaryPanel } from "@/components/review/review-summary-panel"
import { TagReviewPanel, type TagDecision, type TagReviewVariant } from "@/components/review/tag-review-panel"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useReviewJobs, type NewUploadEntry } from "@/hooks/use-review-jobs"
import { buildReviewExportRows } from "@/lib/export-review"
import { flattenTagOccurrences, groupExtractedTags } from "@/lib/review"
import {
  getExtractionSummary,
  getJobSidebarStatus,
  getResolvedReviewProgress,
  hasStartedReview,
  isListedReviewJob,
  jobSidebarStatusLabel,
  type JobSidebarStatus,
  type ReviewViewerTarget,
  type RuntimeReviewJob,
  type RuntimeUploadItem,
  type UploadItemKind,
} from "@/lib/review-jobs"

/** Matches the panel's slide-out animation so it stays mounted until it finishes. */
const VIEWER_CLOSE_MS = 260

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

type SidebarProps = {
  jobs?: RuntimeReviewJob[]
  activeJobId: number | null
  onNewReviewJob: () => void
  onSearchReviewJobs: () => void
  onSelectJob: (id: number) => void
  onRenameJob?: (id: number, name: string) => void
  onPinJob?: (id: number) => void
  onDeleteJob?: (id: number) => void
}

function Sidebar({
  jobs = [],
  activeJobId,
  onNewReviewJob,
  onSearchReviewJobs,
  onSelectJob,
  onRenameJob,
  onPinJob,
  onDeleteJob,
}: SidebarProps) {
  const listedJobs = jobs.filter(isListedReviewJob)

  return (
    <div className="sidebar-content">
      <a className="brand" href="/">
        <span className="brand-mark" aria-hidden="true">R</span>
        <span>Rive</span>
      </a>
      <button className="nav-link nav-link-secondary" onClick={onNewReviewJob} type="button">
        <span aria-hidden="true">+</span>
        New review job
      </button>
      {listedJobs.length > 0 && (
        <button className="nav-link nav-link-secondary" onClick={onSearchReviewJobs} type="button">
          <Search aria-hidden="true" size={15} strokeWidth={2} />
          Search review jobs
        </button>
      )}

      {listedJobs.length > 0 && (
        <div className="sidebar-section">
          <p className="sidebar-label">Review jobs</p>
          <div className="sidebar-job-list">
            {listedJobs.map((job) => (
              <SidebarJob
                isActive={job.id === activeJobId}
                job={job}
                key={job.id}
                onDelete={() => onDeleteJob?.(job.id)}
                onPin={() => onPinJob?.(job.id)}
                onRename={(name) => onRenameJob?.(job.id, name)}
                onSelect={() => onSelectJob(job.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <span className="avatar">VK</span>
        <span>
          <strong>Vinay Krishnan</strong>
          <small>Workspace</small>
        </span>
      </div>
    </div>
  )
}
function SidebarJobStatusIcon({ status, title }: { status: JobSidebarStatus; title?: string }) {
  if (status === "idle") {
    return (
      <span aria-label={title} className="sidebar-job-icon is-draft" title={title}>
        <FileText aria-hidden="true" size={14} strokeWidth={2.2} />
      </span>
    )
  }

  if (status === "processing") {
    return (
      <span aria-label={title} className="sidebar-job-icon is-processing" title={title}>
        <LoaderCircle aria-hidden="true" className="sidebar-job-spinner" size={14} strokeWidth={2.2} />
      </span>
    )
  }

  if (status === "error") {
    return (
      <span aria-label={title} className="sidebar-job-icon is-error" title={title}>
        <CircleAlert aria-hidden="true" size={14} strokeWidth={2.2} />
      </span>
    )
  }

  if (status === "ready") {
    return (
      <span aria-label={title} className="sidebar-job-icon is-ready" title={title}>
        <Circle aria-hidden="true" size={14} strokeWidth={2.2} />
      </span>
    )
  }

  return (
    <span aria-label={title} className="sidebar-job-icon is-completed" title={title}>
      <Check aria-hidden="true" size={14} strokeWidth={2.4} />
    </span>
  )
}

type SidebarJobProps = {
  job: RuntimeReviewJob
  isActive: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onPin: () => void
  onDelete: () => void
}

function SidebarJob({ job, isActive, onSelect, onRename, onPin, onDelete }: SidebarJobProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [draftName, setDraftName] = useState(job.name)
  const status = getJobSidebarStatus(job)
  const statusLabel = jobSidebarStatusLabel(status)

  useEffect(() => {
    setDraftName(job.name)
  }, [job.name])

  useEffect(() => {
    if (!isMenuOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsMenuOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMenuOpen])

  function saveName() {
    const nextName = draftName.trim()
    if (nextName) {
      onRename(nextName)
    } else {
      setDraftName(job.name)
    }
    setIsEditing(false)
  }

  return (
    <>
      <div
        className={`sidebar-job${job.pinned ? " is-pinned" : ""}${isActive ? " is-active" : ""}${isMenuOpen ? " is-menu-open" : ""}`}
      >
        {isEditing ? (
          <input
            aria-label="Review job name"
            autoFocus
            className="sidebar-job-input"
            onBlur={saveName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
              if (event.key === "Escape") {
                setDraftName(job.name)
                setIsEditing(false)
              }
            }}
            value={draftName}
          />
        ) : (
          <>
            <button
              aria-current={isActive ? "page" : undefined}
              className="sidebar-job-select"
              onClick={onSelect}
              title={`${job.name} · ${statusLabel}`}
              type="button"
            >
              <SidebarJobStatusIcon
                status={status}
                title={job.errorMessage ? `${statusLabel}: ${job.errorMessage}` : statusLabel}
              />
              {job.pinned && <span aria-hidden="true" className="sidebar-job-pin" />}
              <span className="sidebar-job-text">{job.name}</span>
            </button>
            <div className="sidebar-job-menu" ref={menuRef}>
              <button
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                aria-label={`Actions for ${job.name}`}
                className="sidebar-job-kebab"
                onClick={() => setIsMenuOpen((open) => !open)}
                type="button"
              >
                <span aria-hidden="true">⋯</span>
              </button>
              {isMenuOpen && (
                <div className="sidebar-job-popover" role="menu">
                  <button
                    className="sidebar-job-menu-item"
                    onClick={() => {
                      setIsMenuOpen(false)
                      setIsEditing(true)
                    }}
                    role="menuitem"
                    type="button"
                  >
                    Rename
                  </button>
                  <button
                    className="sidebar-job-menu-item"
                    onClick={() => {
                      setIsMenuOpen(false)
                      onPin()
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {job.pinned ? "Unpin" : "Pin"}
                  </button>
                  <button
                    className="sidebar-job-menu-item"
                    onClick={() => {
                      setIsMenuOpen(false)
                      setIsHistoryOpen(true)
                    }}
                    role="menuitem"
                    type="button"
                  >
                    View history
                  </button>
                  <button
                    className="sidebar-job-menu-item is-danger"
                    onClick={() => {
                      setIsMenuOpen(false)
                      setIsDeleteConfirmOpen(true)
                    }}
                    role="menuitem"
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {isDeleteConfirmOpen && (
        <ConfirmDialog
          cancelLabel="Cancel"
          confirmLabel="Delete"
          confirmTone="danger"
          description={(
            <>
              This will permanently remove <strong>{job.name}</strong> and its uploaded files.
              This can’t be undone.
            </>
          )}
          onCancel={() => setIsDeleteConfirmOpen(false)}
          onConfirm={() => {
            setIsDeleteConfirmOpen(false)
            onDelete()
          }}
          title="Delete review job?"
        />
      )}

      {isHistoryOpen && (
        <JobHistoryDialog job={job} onClose={() => setIsHistoryOpen(false)} />
      )}
    </>
  )
}

type UploadViewProps = {
  job: RuntimeReviewJob
  onAddUploads: (entries: NewUploadEntry[]) => string[]
  onPatchUploadItem: (
    itemId: string,
    patch: Partial<Pick<RuntimeUploadItem, "progress" | "status" | "pageCount">>,
  ) => void
  onRemoveUploadItem: (itemId: string) => void
  onStartReview: () => void
  onMarkComplete: () => void
  onMarkExported: () => void
  onBeginReview: () => void
  onDecideTag: (occurrenceKey: string, decision: TagDecision) => void
  onSetViewer: (viewer: ReviewViewerTarget | null) => void
  variant: TagReviewVariant
}

function UploadView({
  job,
  onAddUploads,
  onPatchUploadItem,
  onRemoveUploadItem,
  onStartReview,
  onMarkComplete,
  onMarkExported,
  onBeginReview,
  onDecideTag,
  onSetViewer,
  variant,
}: UploadViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const uploadTimersRef = useRef<Map<string, number>>(new Map())
  const itemsRef = useRef(job.items)
  const pendingDuplicatesRef = useRef<PendingDuplicate[]>([])
  const isPromptOpenRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePrompt | null>(null)
  const [isExportSummaryOpen, setIsExportSummaryOpen] = useState(false)
  const [mountedViewer, setMountedViewer] = useState(job.viewer)
  const [isViewerClosing, setIsViewerClosing] = useState(false)

  useEffect(() => {
    itemsRef.current = job.items
  }, [job.items])

  const isUploading = job.items.some((item) => item.status === "uploading")
  const fallbackDocumentName = job.items[0]?.displayName ?? "Uploaded document"

  const tagGroups = useMemo(
    () => (job.review ? groupExtractedTags(job.review, fallbackDocumentName) : []),
    [job.review, fallbackDocumentName],
  )

  const reviewProgress = useMemo(
    () => getResolvedReviewProgress(job, fallbackDocumentName),
    [job, fallbackDocumentName],
  )
  const reviewProgressPercent = reviewProgress.total === 0
    ? 0
    : Math.round((reviewProgress.resolved / reviewProgress.total) * 100)
  const canMarkComplete = reviewProgress.total > 0
    && reviewProgress.resolved === reviewProgress.total
  const isReviewComplete = Boolean(job.completedAt)
  const showExtractionSummary = job.phase === "results"
    && Boolean(job.review)
    && !isReviewComplete
    && !hasStartedReview(job)
  const extractionSummary = useMemo(
    () => (job.review ? getExtractionSummary(job.review, fallbackDocumentName) : null),
    [job.review, fallbackDocumentName],
  )
  const allOccurrences = useMemo(
    () => (job.review ? flattenTagOccurrences(job.review, fallbackDocumentName) : []),
    [job.review, fallbackDocumentName],
  )
  const exportRows = useMemo(
    () => buildReviewExportRows(job.review ?? [], job.decisions, fallbackDocumentName),
    [job.review, job.decisions, fallbackDocumentName],
  )
  const pageTitle = job.phase === "reviewing"
    ? "Extracting tags"
    : job.phase === "results"
      ? (isReviewComplete
        ? "Review summary"
        : showExtractionSummary
          ? "Tag extraction complete"
          : "Review results")
      : "Upload documents"
  const pageSubtitle = job.phase === "reviewing"
    ? "Identifying engineering tags and organizing them for review."
    : job.phase === "results"
      ? (isReviewComplete ? (
        <>
          Review complete for{" "}
          <span className="page-subtitle-emphasis">
            {tagGroups.length} {tagGroups.length === 1 ? "engineering tag" : "engineering tags"}
          </span>
          . Export validated results when you&apos;re ready.
        </>
      ) : showExtractionSummary ? null : (
        <>
          <span className="page-subtitle-emphasis">
            {tagGroups.length} {tagGroups.length === 1 ? "engineering tag" : "engineering tags"}
          </span>
          {" "}identified and ready for review.
        </>
      ))
      : "Turn engineering drawings into trusted, searchable data with AI-assisted tag extraction and review."

  // Keep the viewer mounted through its closing animation, whether it was dismissed
  // directly or cleared by a tag decision.
  useEffect(() => {
    if (job.viewer) {
      setMountedViewer(job.viewer)
      setIsViewerClosing(false)
      return
    }

    setIsViewerClosing(true)
    const timer = window.setTimeout(() => {
      setMountedViewer(null)
      setIsViewerClosing(false)
    }, VIEWER_CLOSE_MS)
    return () => window.clearTimeout(timer)
  }, [job.viewer])

  const viewerDocument = mountedViewer
    ? tagGroups
      .find((group) => group.tag === mountedViewer.tag)
      ?.documents.find((document) => document.name === mountedViewer.documentName)
    : undefined

  const tagOccurrences = useMemo(() => {
    if (!mountedViewer) return []
    return allOccurrences.filter((occurrence) => occurrence.tag === mountedViewer.tag)
  }, [allOccurrences, mountedViewer])

  const viewerMatchIndex = mountedViewer
    ? tagOccurrences.findIndex((occurrence) => (
      occurrence.documentName === mountedViewer.documentName
      && occurrence.page === mountedViewer.page
    ))
    : -1

  function goToTagOccurrence(index: number) {
    const occurrence = tagOccurrences[index]
    if (!occurrence) return
    onSetViewer({
      tag: occurrence.tag,
      documentName: occurrence.documentName,
      page: occurrence.page,
    })
  }

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
      <header className="page-header">
        <div className="page-header-main">
          <div className="page-header-titles">
            <h2>{pageTitle}</h2>
            {pageSubtitle && <p className="page-subtitle">{pageSubtitle}</p>}
          </div>
          {job.phase === "results" && !showExtractionSummary ? (
            <div className="page-header-actions">
              {isReviewComplete ? (
                <button
                  className="primary-button"
                  onClick={() => setIsExportSummaryOpen(true)}
                  type="button"
                >
                  Export results
                </button>
              ) : (
                <div className="review-complete-control">
                  <button
                    aria-label={`Mark as complete — ${reviewProgress.resolved} of ${reviewProgress.total} occurrences reviewed`}
                    className={`primary-button review-complete-button ${
                      canMarkComplete ? "is-ready" : "is-pending"
                    }`}
                    disabled={!canMarkComplete}
                    onClick={onMarkComplete}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="review-complete-fill"
                      style={{ width: `${reviewProgressPercent}%` }}
                    />
                    <span className="review-complete-label">
                      {canMarkComplete && (
                        <Check aria-hidden="true" size={15} strokeWidth={2.4} />
                      )}
                      Mark as complete
                      {!canMarkComplete && reviewProgress.total > 0 && (
                        <span className="review-complete-fraction">
                          {reviewProgress.resolved}/{reviewProgress.total}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : job.phase === "upload" && job.items.length > 0 ? (
            <button
              className="primary-button"
              disabled={isUploading}
              onClick={onStartReview}
              type="button"
            >
              Extract tags
            </button>
          ) : null}
        </div>
      </header>

      {job.phase === "reviewing" ? (
        <ProcessingStatus progress={job.extractionProgress} />
      ) : job.phase === "results" && job.review && isReviewComplete ? (
        <ReviewSummaryPanel rows={exportRows} tagGroups={tagGroups} />
      ) : job.phase === "results" && job.review && showExtractionSummary && extractionSummary ? (
        <ExtractionSummaryPanel
          documents={extractionSummary.documents}
          matchHits={extractionSummary.matchHits}
          occurrences={extractionSummary.occurrences}
          onStartReview={onBeginReview}
          tags={extractionSummary.tags}
        />
      ) : job.phase === "results" && job.review ? (
        <section className="review-results" aria-label="Review results">
          <TagReviewPanel
            activeOccurrence={job.viewer}
            decisions={job.decisions}
            fallbackDocument={fallbackDocumentName}
            groups={tagGroups}
            onDecide={onDecideTag}
            onViewOccurrence={onSetViewer}
            review={job.review}
            variant={variant}
          />
        </section>
      ) : job.items.length === 0 ? (
        <section className="upload-placeholder" aria-label="Product preview">
          <div className="upload-placeholder-frame">
            <span>Preview coming soon</span>
          </div>
        </section>
      ) : (
        <section aria-label="Uploaded documents" className="upload-file-list">
          <ul>
            {job.items.map((item) => (
              <li className={`job-row upload-file-row${item.status === "uploading" ? " is-uploading" : ""}`} key={item.id}>
                <div className="upload-file-meta">
                  <span className="job-name">{item.displayName}</span>
                  <span className="upload-file-details">
                    {formatPageCount(item.pageCount)}
                    <span aria-hidden="true">·</span>
                    {formatFileSize(item.byteSize)}
                    <span aria-hidden="true">·</span>
                    {formatUploadKind(item.kind)}
                  </span>
                </div>
                <span className="upload-file-progress">
                  {item.status === "uploading" && (
                    <>
                      <span className="job-date">{item.progress}%</span>
                      <span className="upload-progress" aria-label={`Uploading ${item.progress}%`}>
                        <span className="upload-progress-bar" style={{ width: `${item.progress}%` }} />
                      </span>
                    </>
                  )}
                </span>
                <button
                  aria-label={item.status === "uploading" ? "Cancel upload" : "Remove file"}
                  className="upload-file-remove"
                  onClick={() => removeFile(item.id)}
                  title={item.status === "uploading" ? "Cancel" : "Remove"}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={15} strokeWidth={1.9} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {job.phase === "upload" && (
        <div
          aria-label="Add documents"
          className={`upload-bar${isDragging ? " is-dragging" : ""}`}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <span className="upload-bar-hint">
            <Upload aria-hidden="true" size={15} strokeWidth={1.9} />
            {isDragging ? "Drop to upload" : "Drag and drop files, folders, or zip archives here"}
          </span>
          <span className="upload-bar-actions">
            <button className="secondary-button" onClick={() => folderInputRef.current?.click()} type="button">
              Choose folder
            </button>
            <button className="primary-button" onClick={() => fileInputRef.current?.click()} type="button">
              Choose files
            </button>
          </span>

          <input
            accept=".zip,application/zip,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
            className="sr-only"
            multiple
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files)
                event.target.value = ""
              }
            }}
            ref={fileInputRef}
            type="file"
          />
          <input
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
            type="file"
          />
        </div>
      )}

      {mountedViewer && viewerDocument && (
        <PdfViewerPanel
          canGoNext={tagOccurrences.length > 0 && viewerMatchIndex < tagOccurrences.length - 1}
          canGoPrevious={viewerMatchIndex > 0}
          documentName={viewerDocument.name}
          file={findDocumentFile(job.items, viewerDocument.name)}
          isClosing={isViewerClosing}
          matchIndex={Math.max(viewerMatchIndex, 0)}
          matchTotal={tagOccurrences.length}
          onClose={() => onSetViewer(null)}
          onNextMatch={() => goToTagOccurrence(Math.max(viewerMatchIndex, -1) + 1)}
          onPreviousMatch={() => goToTagOccurrence(viewerMatchIndex - 1)}
          page={mountedViewer.page}
          tag={mountedViewer.tag}
        />
      )}

      {duplicatePrompt && (
        <ConfirmDialog
          cancelLabel="No, skip"
          confirmLabel="Yes, upload"
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

      {isExportSummaryOpen && (
        <ExportSummaryDialog
          jobName={job.name}
          onClose={() => setIsExportSummaryOpen(false)}
          onExported={onMarkExported}
          rows={exportRows}
        />
      )}
    </>
  )
}

const JOB_STATUS_FILTERS: Array<{ id: "all" | JobSidebarStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "completed", label: "Completed" },
  { id: "processing", label: "Processing" },
  { id: "error", label: "Failed" },
  { id: "idle", label: "Draft" },
]

function SearchReviewJobs({
  jobs,
  onSelectJob,
}: {
  jobs: RuntimeReviewJob[]
  onSelectJob: (id: number) => void
}) {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | JobSidebarStatus>("all")
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchingJobs = useMemo(() => {
    const listed = jobs.filter(isListedReviewJob)
    return listed.filter((job) => {
      const status = getJobSidebarStatus(job)
      if (statusFilter !== "all" && status !== statusFilter) return false
      if (!normalizedQuery) return true
      return [
        job.name,
        ...job.fileNames,
        ...job.fileContent,
        ...job.tags,
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    })
  }, [jobs, normalizedQuery, statusFilter])

  const statusCounts = useMemo(() => {
    const listed = jobs.filter(isListedReviewJob)
    const counts: Record<"all" | JobSidebarStatus, number> = {
      all: listed.length,
      idle: 0,
      processing: 0,
      error: 0,
      ready: 0,
      completed: 0,
    }
    for (const job of listed) {
      counts[getJobSidebarStatus(job)] += 1
    }
    return counts
  }, [jobs])

  return (
    <>
      <header className="page-header search-page-header">
        <div className="page-header-main">
          <div className="page-header-titles">
            <h2>Search review jobs</h2>
            <p className="page-subtitle">Find and filter jobs by title, files, content, tags, or status.</p>
          </div>
        </div>
      </header>
      <section className="job-search" aria-label="Search review jobs">
        <div className="job-search-field">
          <Search aria-hidden="true" size={18} strokeWidth={1.9} />
          <input
            aria-label="Search review jobs"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, file names, file content, or tags"
            type="search"
            value={query}
          />
        </div>
        <div className="job-status-filters" aria-label="Filter by status" role="toolbar">
          {JOB_STATUS_FILTERS.map((filter) => {
            const count = statusCounts[filter.id]
            if (filter.id !== "all" && count === 0) return null
            return (
              <button
                aria-pressed={statusFilter === filter.id}
                className={`job-status-filter${statusFilter === filter.id ? " is-active" : ""}`}
                key={filter.id}
                onClick={() => setStatusFilter(filter.id)}
                type="button"
              >
                {filter.label}
                <span className="job-status-filter-count">{count}</span>
              </button>
            )
          })}
        </div>
        <p className="job-search-count" aria-live="polite">
          {matchingJobs.length} {matchingJobs.length === 1 ? "review job" : "review jobs"}
        </p>
        {matchingJobs.length > 0 ? (
          <ul className="job-search-results">
            {matchingJobs.map((job) => (
              <li className="job-search-result" key={job.id}>
                <button className="job-search-result-button" onClick={() => onSelectJob(job.id)} type="button">
                  <div>
                    <strong>{job.name}</strong>
                    <span>
                      {job.fileNames.length > 0
                        ? `${job.items.length || job.fileNames.length} ${
                          (job.items.length || job.fileNames.length) === 1 ? "file" : "files"
                        }`
                        : "No files indexed"}
                      <span aria-hidden="true"> · </span>
                      {jobSidebarStatusLabel(getJobSidebarStatus(job))}
                    </span>
                  </div>
                  {job.tags.length > 0 && (
                    <div className="job-search-tags" aria-label="Tags">
                      {job.tags.slice(0, 4).map((tag, index) => (
                        <span key={`${tag}-${index}`}>{tag}</span>
                      ))}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="job-search-empty">
            <strong>No review jobs found</strong>
            <span>Try another title, file name, phrase, tag, or status filter.</span>
          </div>
        )}
      </section>
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
    for (const file of item.files) {
      const name = (file.webkitRelativePath || file.name).toLowerCase()
      if (name === target || baseName(name) === targetBaseName) return file
    }
  }

  return null
}

function getUploadKind(file: File): UploadItemKind {
  const name = file.name.toLowerCase()
  if (name.endsWith(".zip") || file.type.includes("zip")) return "zip"
  return "file"
}

async function countFilePages(file: File) {
  const name = file.name.toLowerCase()

  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 1

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const buffer = await file.arrayBuffer()
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

async function resolvePageCount(files: File[]) {
  const counts = await Promise.all(files.map((file) => countFilePages(file)))
  return counts.reduce((total, count) => total + count, 0)
}

export function ReviewWorkspacePage({ variant }: { variant: TagReviewVariant }) {
  const {
    jobs,
    activeJob,
    activeJobId,
    isHydrating,
    createJob,
    selectJob,
    renameJob,
    pinJob,
    deleteJob,
    addUploads,
    patchUploadItem,
    removeUploadItem,
    startJobReview,
    decideTag,
    markJobComplete,
    markJobExported,
    beginReview,
    setViewer,
  } = useReviewJobs()

  const [activeView, setActiveView] = useState<"review" | "search">("review")

  function startNewReviewJob() {
    setActiveView("review")
    createJob()
  }

  function handleSelectJob(id: number) {
    setActiveView("review")
    selectJob(id)
  }

  return (
    <AppLayout
      sidebar={(
        <Sidebar
          activeJobId={activeJobId}
          jobs={jobs}
          onDeleteJob={deleteJob}
          onNewReviewJob={startNewReviewJob}
          onPinJob={pinJob}
          onRenameJob={renameJob}
          onSearchReviewJobs={() => setActiveView("search")}
          onSelectJob={handleSelectJob}
        />
      )}
    >
      <GridLayout className="upload-layout">
        {isHydrating || !activeJob ? (
          <section className="workspace-loading" aria-live="polite">
            <h2>Loading review jobs…</h2>
            <p>Restoring your locally saved sessions.</p>
          </section>
        ) : activeView === "search" ? (
          <SearchReviewJobs jobs={jobs} onSelectJob={handleSelectJob} />
        ) : (
          <UploadView
            key={activeJob.id}
            job={activeJob}
            onAddUploads={(entries) => addUploads(activeJob.id, entries)}
            onBeginReview={() => beginReview(activeJob.id)}
            onDecideTag={(occurrenceKey, decision) => decideTag(activeJob.id, occurrenceKey, decision)}
            onMarkComplete={() => markJobComplete(activeJob.id)}
            onMarkExported={() => markJobExported(activeJob.id)}
            onPatchUploadItem={(itemId, patch) => patchUploadItem(activeJob.id, itemId, patch)}
            onRemoveUploadItem={(itemId) => removeUploadItem(activeJob.id, itemId)}
            onSetViewer={(viewer) => setViewer(activeJob.id, viewer)}
            onStartReview={() => startJobReview(activeJob.id)}
            variant={variant}
          />
        )}
      </GridLayout>
    </AppLayout>
  )
}
