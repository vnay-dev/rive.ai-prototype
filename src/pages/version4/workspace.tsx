import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react"
import { Astroid, Check, ChevronRight, CircleAlert, FileText, LoaderCircle, PanelLeft, PanelLeftClose, Pause, Play, Plus, Search, Trash2, Upload, X } from "lucide-react"

import { AppLayout } from "@/components/layout/app-layout"
import { GridLayout } from "@/components/layout/grid-layout"
import { ExportMenu } from "@/components/review/export-menu"
import { JobHistoryDialog } from "@/components/review/job-history-dialog"
import { PdfViewerPanel } from "@/components/review/pdf-viewer-panel"
import { ExtractionStatusMessage } from "@/components/review/processing-status"
import { ReviewSummaryPanel } from "@/components/review/review-summary-panel"
import { TagReviewPanel, type TagDecision, type TagReviewVariant, type DecisionStatusStyle } from "@/components/review/tag-review-panel"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SlidingMenuHoverIndicator } from "@/components/ui/sliding-menu-hover"
import { TickerNumber } from "@/components/ui/ticker-number"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useMenuKeyboard } from "@/hooks/use-menu-keyboard"
import { useReviewJobs, type NewUploadEntry } from "@/hooks/use-review-jobs"
import { useSidebarActiveIndicator } from "@/hooks/use-sidebar-active-indicator"
import { buildReviewExportRows } from "@/lib/export-review"
import { flattenTagOccurrences, groupExtractedTags } from "@/lib/review"
import { getPublicAssetUrl } from "@/lib/media-assets"
import {
  getExtractionSummary,
  getJobSidebarStatus,
  getResolvedReviewProgress,
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

const BRAND_MARK_SRC = getPublicAssetUrl("rive-logo.svg")

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

type SidebarProps = {
  jobs?: RuntimeReviewJob[]
  activeJobId: number | null
  isCollapsed: boolean
  sidebarPanelId: string
  onToggleCollapse: () => void
  onNewReviewJob: () => void
  onSearchReviewJobs: () => void
  onSelectJob: (id: number) => void
  onRenameJob?: (id: number, name: string) => void
  onDeleteJob?: (id: number) => void
}

function Sidebar({
  jobs = [],
  activeJobId,
  isCollapsed,
  sidebarPanelId,
  onToggleCollapse,
  onNewReviewJob,
  onSearchReviewJobs,
  onSelectJob,
  onRenameJob,
  onDeleteJob,
}: SidebarProps) {
  const completedGroupId = useId()
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(true)
  const listedJobs = jobs.filter(isListedReviewJob)
  const activeJobs = listedJobs.filter((job) => !job.completedAt)
  const completedJobs = listedJobs.filter((job) => Boolean(job.completedAt))
  const activeIsCompleted = completedJobs.some((job) => job.id === activeJobId)
  const visibleJobCount = activeJobs.length + (isCompletedExpanded ? completedJobs.length : 0)
  const listedJobKey = listedJobs
    .map((job) => `${job.id}:${Number(job.pinned)}:${Number(Boolean(job.completedAt))}`)
    .join("|")
  const { listRef: jobListRef, activeIndicator } = useSidebarActiveIndicator(
    String(activeJobId ?? ""),
    visibleJobCount,
    `${listedJobKey}|${Number(isCollapsed)}|${Number(isCompletedExpanded)}`,
  )

  useEffect(() => {
    if (activeIsCompleted) setIsCompletedExpanded(true)
  }, [activeIsCompleted])

  function renderJobList(groupJobs: RuntimeReviewJob[]) {
    return groupJobs.map((job) => (
      <SidebarJob
        isActive={job.id === activeJobId}
        job={job}
        key={job.id}
        onDelete={() => onDeleteJob?.(job.id)}
        onRename={(name) => onRenameJob?.(job.id, name)}
        onSelect={() => onSelectJob(job.id)}
      />
    ))
  }

  return (
    <div className="sidebar-content">
      <div className="sidebar-header">
        <a aria-label="Rive" className="brand" href="/">
          <img alt="" aria-hidden="true" className="brand-mark" src={BRAND_MARK_SRC} />
        </a>
        {!isCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-controls={sidebarPanelId}
                aria-expanded={!isCollapsed}
                aria-label="Collapse sidebar"
                className="sidebar-collapse"
                onClick={onToggleCollapse}
                type="button"
              >
                <PanelLeftClose aria-hidden="true" size={16} strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Collapse sidebar</TooltipContent>
          </Tooltip>
        )}
        {isCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-controls={sidebarPanelId}
                aria-expanded={!isCollapsed}
                aria-label="Expand sidebar"
                className="sidebar-brand-toggle"
                onClick={onToggleCollapse}
                type="button"
              >
                <img alt="" aria-hidden="true" className="brand-mark" src={BRAND_MARK_SRC} />
                <PanelLeft aria-hidden="true" className="sidebar-brand-expand-icon" size={16} strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>
        )}
      </div>
      <Tooltip open={isCollapsed ? undefined : false}>
        <TooltipTrigger asChild>
          <button
            aria-label="New review job"
            className="nav-link nav-link-secondary"
            onClick={onNewReviewJob}
            type="button"
          >
            <Plus aria-hidden="true" className="nav-link-icon" size={15} strokeWidth={2} />
            <span className="nav-link-label">New review job</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">New review job</TooltipContent>
      </Tooltip>
      {listedJobs.length > 0 && (
        <Tooltip open={isCollapsed ? undefined : false}>
          <TooltipTrigger asChild>
            <button
              aria-label="Search review jobs"
              className="nav-link nav-link-secondary"
              onClick={onSearchReviewJobs}
              type="button"
            >
              <Search aria-hidden="true" className="nav-link-icon" size={15} strokeWidth={2} />
              <span className="nav-link-label">Search review jobs</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Search review jobs</TooltipContent>
        </Tooltip>
      )}

      {listedJobs.length > 0 && !isCollapsed && (
        <div className="sidebar-section">
          <p className="sidebar-label">Review jobs</p>
          <div className="sidebar-job-list" ref={jobListRef}>
            <div
              aria-hidden="true"
              className={[
                "sidebar-job-active-indicator",
                activeIndicator.visible ? "is-visible" : "",
                activeIndicator.animated ? "is-animated" : "",
              ].filter(Boolean).join(" ")}
              style={{
                transform: `translate3d(0, ${activeIndicator.top}px, 0)`,
                height: activeIndicator.height,
              }}
            />
            {renderJobList(activeJobs)}
            {completedJobs.length > 0 && (
              <>
                <button
                  aria-controls={completedGroupId}
                  aria-expanded={isCompletedExpanded}
                  className={`sidebar-job-subgroup-toggle${isCompletedExpanded ? " is-expanded" : ""}`}
                  onClick={() => setIsCompletedExpanded((open) => !open)}
                  type="button"
                >
                  <span>Completed</span>
                  <ChevronRight
                    aria-hidden="true"
                    className="sidebar-job-subgroup-chevron"
                    size={14}
                    strokeWidth={2}
                  />
                </button>
                {isCompletedExpanded && (
                  <div
                    aria-label="Completed review jobs"
                    className="sidebar-job-completed-group"
                    id={completedGroupId}
                    role="group"
                  >
                    {renderJobList(completedJobs)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
function SidebarJobStatusIcon({ status }: { status: JobSidebarStatus }) {
  if (status === "idle") {
    return (
      <span aria-hidden="true" className="sidebar-job-icon is-draft">
        <FileText size={14} strokeWidth={2.2} />
      </span>
    )
  }

  if (status === "processing") {
    return (
      <span aria-hidden="true" className="sidebar-job-icon is-processing">
        <LoaderCircle className="sidebar-job-spinner" size={14} strokeWidth={2.2} />
      </span>
    )
  }

  if (status === "error") {
    return (
      <span aria-hidden="true" className="sidebar-job-icon is-error">
        <CircleAlert size={14} strokeWidth={2.2} />
      </span>
    )
  }

  if (status === "ready") {
    return (
      <span aria-hidden="true" className="sidebar-job-icon is-ready">
        <span className="sidebar-job-ready-dot" />
      </span>
    )
  }

  return (
    <span aria-hidden="true" className="sidebar-job-icon is-completed">
      <Check size={14} strokeWidth={2.4} />
    </span>
  )
}

type SidebarJobProps = {
  job: RuntimeReviewJob
  isActive: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

function SidebarJob({ job, isActive, onSelect, onRename, onDelete }: SidebarJobProps) {
  const jobRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const kebabRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const [isEditing, setIsEditing] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [draftName, setDraftName] = useState(job.name)
  const status = getJobSidebarStatus(job)
  const statusLabel = jobSidebarStatusLabel(status)
  const statusDetail = job.errorMessage ? `${statusLabel}: ${job.errorMessage}` : statusLabel
  const jobAccessibleName = `${job.name}, ${statusDetail}`

  const closeMenu = useCallback(() => setIsMenuOpen(false), [])

  useMenuKeyboard({
    isOpen: isMenuOpen,
    menuRef: popoverRef,
    triggerRef: kebabRef,
    onClose: closeMenu,
  })

  useEffect(() => {
    setDraftName(job.name)
  }, [job.name])

  useEffect(() => {
    if (!isMenuOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!jobRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
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
        ref={jobRef}
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
              aria-current={isActive ? "true" : undefined}
              aria-label={jobAccessibleName}
              className="sidebar-job-select"
              onClick={onSelect}
              type="button"
            >
              <SidebarJobStatusIcon status={status} />
              {job.pinned && <span aria-hidden="true" className="sidebar-job-pin" />}
              <span className="sidebar-job-text" aria-hidden="true">{job.name}</span>
            </button>
            <div className="sidebar-job-menu">
              <button
                aria-controls={isMenuOpen ? menuId : undefined}
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                aria-label={`Actions for ${job.name}`}
                className="sidebar-job-kebab"
                onClick={() => setIsMenuOpen((open) => !open)}
                ref={kebabRef}
                type="button"
              >
                <span aria-hidden="true">⋯</span>
              </button>
            </div>
            {isMenuOpen && (
              <div
                className="sidebar-job-popover has-sliding-hover"
                id={menuId}
                ref={popoverRef}
                role="menu"
              >
                <SlidingMenuHoverIndicator containerRef={popoverRef} />
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
  onDecideTag: (occurrenceKey: string, decision: TagDecision) => void
  onSetViewer: (viewer: ReviewViewerTarget | null) => void
  variant: TagReviewVariant
  decisionStyle?: DecisionStatusStyle
}

function UploadView({
  job,
  onAddUploads,
  onPatchUploadItem,
  onRemoveUploadItem,
  onStartReview,
  onMarkComplete,
  onMarkExported,
  onDecideTag,
  onSetViewer,
  variant,
  decisionStyle = "chip",
}: UploadViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const uploadTimersRef = useRef<Map<string, number>>(new Map())
  const itemsRef = useRef(job.items)
  const pendingDuplicatesRef = useRef<PendingDuplicate[]>([])
  const isPromptOpenRef = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePrompt | null>(null)
  const [mountedViewer, setMountedViewer] = useState(job.viewer)
  const [isViewerClosing, setIsViewerClosing] = useState(false)
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
  const fallbackDocumentName = job.items[0]?.displayName ?? "Uploaded document"

  const tagGroups = useMemo(
    () => (job.review ? groupExtractedTags(job.review, fallbackDocumentName) : []),
    [job.review, fallbackDocumentName],
  )

  const reviewProgress = useMemo(
    () => getResolvedReviewProgress(job, fallbackDocumentName),
    [job, fallbackDocumentName],
  )
  const canMarkComplete = reviewProgress.total > 0
    && reviewProgress.resolved === reviewProgress.total
  const isReviewComplete = Boolean(job.completedAt)
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
      setStatusAnnouncement("Review marked complete.")
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
  const allOccurrences = useMemo(
    () => (job.review ? flattenTagOccurrences(job.review, fallbackDocumentName) : []),
    [job.review, fallbackDocumentName],
  )
  const exportRows = useMemo(
    () => buildReviewExportRows(job.review ?? [], job.decisions, fallbackDocumentName),
    [job.review, job.decisions, fallbackDocumentName],
  )
  const pageTitle = job.phase === "reviewing"
    ? "Extracting tags…"
    : job.phase === "results"
      ? (isReviewComplete ? "Review summary" : "Review tags")
      : "Upload documents"
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
      ) : null)
      : "Add P&IDs or PDFs, then extract tags for review."

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
      <div aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>
      <header className="page-header">
        <div className="page-header-main">
          <div className="page-header-titles">
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
          ) : job.phase === "results" && isReviewComplete ? (
            <div className="page-header-actions">
              <ExportMenu
                jobName={job.name}
                onExported={onMarkExported}
                rows={exportRows}
                slidingHover
              />
            </div>
          ) : null}
        </div>
      </header>

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
        <>
          <section className="review-results" aria-label="Review tags">
            <TagReviewPanel
              activeOccurrence={job.viewer}
              decisions={job.decisions}
              decisionStyle={decisionStyle}
              fallbackDocument={fallbackDocumentName}
              groups={tagGroups}
              onDecide={onDecideTag}
              onViewOccurrence={onSetViewer}
              review={job.review}
              variant={variant}
            />
          </section>

          <div className="upload-extract-footer">
            <p className="upload-extract-footer-count review-complete-footer-progress">
              {reviewProgress.total > 0 ? (
                <>
                  <TickerNumber value={reviewProgress.resolved} />
                  {" "}of {reviewProgress.total}{" "}
                  {reviewProgress.total === 1 ? "occurrence" : "occurrences"} reviewed
                </>
              ) : (
                "No tags left to review"
              )}
            </p>
            <Tooltip open={canMarkComplete ? false : undefined}>
              <TooltipTrigger asChild>
                <span className="review-complete-tooltip-target">
                  <button
                    aria-label={
                      canMarkComplete
                        ? "Mark as complete"
                        : `Mark as complete unavailable — ${reviewProgress.resolved} of ${reviewProgress.total} occurrences reviewed`
                    }
                    className="primary-button"
                    disabled={!canMarkComplete}
                    onClick={onMarkComplete}
                    type="button"
                  >
                    {canMarkComplete ? (
                      <>
                        <Check aria-hidden="true" size={16} strokeWidth={2.4} />
                        Mark as complete
                      </>
                    ) : (
                      "Mark as complete"
                    )}
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Review all occurrences before marking complete
                {reviewProgress.total > 0
                  ? ` (${reviewProgress.resolved}/${reviewProgress.total})`
                  : ""}
              </TooltipContent>
            </Tooltip>
          </div>
        </>
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
                    <span aria-hidden="true">·</span>
                    {formatFileSize(item.byteSize)}
                    <span aria-hidden="true">·</span>
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
          <p className="upload-extract-footer-count">
            {job.items.length} {job.items.length === 1 ? "document" : "documents"}
          </p>
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
                      Extracting…
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

const JOB_STATUS_FILTERS: Array<{ id: "all" | "ready" | "completed"; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Active" },
  { id: "completed", label: "Completed" },
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
  const filterToolbarRef = useRef<HTMLDivElement>(null)
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

  const visibleFilters = JOB_STATUS_FILTERS.filter(
    (filter) => filter.id === "all" || statusCounts[filter.id] > 0,
  )

  function handleFilterKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
      return
    }
    const buttons = Array.from(
      filterToolbarRef.current?.querySelectorAll<HTMLButtonElement>(".job-status-filter") ?? [],
    )
    if (buttons.length === 0) return
    const currentIndex = buttons.findIndex((button) => button === document.activeElement)
    if (currentIndex < 0) return

    event.preventDefault()
    let nextIndex = currentIndex
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % buttons.length
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + buttons.length) % buttons.length
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = buttons.length - 1
    buttons[nextIndex]?.focus()
  }

  return (
    <>
      <header className="page-header search-page-header">
        <div className="page-header-main">
          <div className="page-header-titles">
            <h1>Search review jobs</h1>
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
        <div
          aria-label="Filter by status"
          className="job-status-filters"
          onKeyDown={handleFilterKeyDown}
          ref={filterToolbarRef}
          role="toolbar"
        >
          {visibleFilters.map((filter, index) => {
            const count = statusCounts[filter.id]
            const isActive = statusFilter === filter.id
            const tabStop = isActive || (!visibleFilters.some((item) => item.id === statusFilter) && index === 0)
            return (
              <button
                aria-pressed={isActive}
                className={`job-status-filter${isActive ? " is-active" : ""}`}
                key={filter.id}
                onClick={() => setStatusFilter(filter.id)}
                tabIndex={tabStop ? 0 : -1}
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
                <button
                  className="job-search-result-button"
                  onClick={() => onSelectJob(job.id)}
                  type="button"
                >
                  <div>
                    <strong>{job.name}</strong>
                    <span className="job-search-result-meta">
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

/** Version 4 — forked from Version 1 (sidebar + chip status) for visual design work. */
export function Version4Page() {
  const variant: TagReviewVariant = "sidebar"
  const decisionStyle: DecisionStatusStyle = "chip"
  const {
    jobs,
    activeJob,
    activeJobId,
    isHydrating,
    createJob,
    selectJob,
    renameJob,
    deleteJob,
    addUploads,
    patchUploadItem,
    removeUploadItem,
    startJobReview,
    decideTag,
    markJobComplete,
    markJobExported,
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
      className="version4"
      sidebar={({ isCollapsed, onToggleCollapse, sidebarPanelId }) => (
        <Sidebar
          activeJobId={activeJobId}
          isCollapsed={isCollapsed}
          jobs={jobs}
          onDeleteJob={deleteJob}
          onNewReviewJob={startNewReviewJob}
          onRenameJob={renameJob}
          onSearchReviewJobs={() => setActiveView("search")}
          onSelectJob={handleSelectJob}
          onToggleCollapse={onToggleCollapse}
          sidebarPanelId={sidebarPanelId}
        />
      )}
    >
      <GridLayout className="upload-layout">
        {isHydrating || !activeJob ? (
          <section className="workspace-loading" aria-live="polite">
            <h1>Loading review jobs…</h1>
            <p>Restoring your locally saved sessions.</p>
          </section>
        ) : activeView === "search" ? (
          <SearchReviewJobs jobs={jobs} onSelectJob={handleSelectJob} />
        ) : (
          <UploadView
            key={activeJob.id}
            job={activeJob}
            onAddUploads={(entries) => addUploads(activeJob.id, entries)}
            onDecideTag={(occurrenceKey, decision) => decideTag(activeJob.id, occurrenceKey, decision)}
            onMarkComplete={() => markJobComplete(activeJob.id)}
            onMarkExported={() => markJobExported(activeJob.id)}
            onPatchUploadItem={(itemId, patch) => patchUploadItem(activeJob.id, itemId, patch)}
            onRemoveUploadItem={(itemId) => removeUploadItem(activeJob.id, itemId)}
            onSetViewer={(viewer) => setViewer(activeJob.id, viewer)}
            onStartReview={() => startJobReview(activeJob.id)}
            variant={variant}
            decisionStyle={decisionStyle}
          />
        )}
      </GridLayout>
    </AppLayout>
  )
}
