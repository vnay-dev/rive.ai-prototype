import { useEffect, useMemo, useState, type KeyboardEvent } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import { Plus } from "lucide-react"

import { AppHeader } from "@/components/layout/app-header"
import { JobActionsMenu } from "@/components/review/job-actions-menu"
import {
  getDecidedReviewProgress,
  getJobSidebarStatus,
  isListedReviewJob,
  jobSidebarStatusLabel,
  type JobSidebarStatus,
  type RuntimeReviewJob,
} from "@/lib/review-jobs"
import { getPublicAssetUrl } from "@/lib/media-assets"

import type { Version5JobsContext } from "./layout"

const PREVIEW_AUTO_ADVANCE_MS = 4500

const EMPTY_STATE_STEPS = [
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

const STATUS_FILTERS: Array<{ id: "all" | "ready" | "completed" | "idle" | "processing" | "error"; label: string }> = [
  { id: "all", label: "All" },
  { id: "ready", label: "Active" },
  { id: "processing", label: "Processing" },
  { id: "idle", label: "Draft" },
  { id: "completed", label: "Completed" },
  { id: "error", label: "Failed" },
]

function tableStatusLabel(status: JobSidebarStatus) {
  if (status === "ready") return "Active"
  return jobSidebarStatusLabel(status)
}

function formatRelativeUpdated(value: number, now = Date.now()) {
  const deltaMs = Math.max(0, now - value)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (deltaMs < minute) return "Just now"
  if (deltaMs < hour) {
    const mins = Math.floor(deltaMs / minute)
    return `${mins}m ago`
  }
  if (deltaMs < day) {
    const hours = Math.floor(deltaMs / hour)
    return `${hours}h ago`
  }

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const date = new Date(value)

  if (date >= startOfToday) return "Today"
  if (date >= startOfYesterday) return "Yesterday"

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function progressLabel(job: RuntimeReviewJob) {
  const { decided, total } = getDecidedReviewProgress(job)
  if (total === 0) return "—"
  return `${decided}/${total}`
}

export function Version5JobsPage() {
  const navigate = useNavigate()
  const { jobs, isHydrating, createJob, deleteJob, renameJob } = useOutletContext<Version5JobsContext>()
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | JobSidebarStatus>("all")
  const [editingJobId, setEditingJobId] = useState<number | null>(null)
  const [draftName, setDraftName] = useState("")
  const [previewStep, setPreviewStep] = useState(0)

  const listedJobs = useMemo(() => jobs.filter(isListedReviewJob), [jobs])
  const isEmpty = !isHydrating && listedJobs.length === 0
  const activeEmptyStep = EMPTY_STATE_STEPS[previewStep] ?? EMPTY_STATE_STEPS[0]

  useEffect(() => {
    if (!isEmpty) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = window.setInterval(() => {
      setPreviewStep((current) => (current + 1) % EMPTY_STATE_STEPS.length)
    }, PREVIEW_AUTO_ADVANCE_MS)
    return () => window.clearInterval(timer)
  }, [isEmpty])

  useEffect(() => {
    if (editingJobId == null) return
    const job = listedJobs.find((entry) => entry.id === editingJobId)
    if (!job) {
      setEditingJobId(null)
      return
    }
    setDraftName(job.name)
  }, [editingJobId, listedJobs])

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return listedJobs.filter((job) => {
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
  }, [listedJobs, query, statusFilter])

  const statusCounts = useMemo(() => {
    const counts: Record<"all" | JobSidebarStatus, number> = {
      all: listedJobs.length,
      idle: 0,
      processing: 0,
      error: 0,
      ready: 0,
      completed: 0,
    }
    for (const job of listedJobs) {
      counts[getJobSidebarStatus(job)] += 1
    }
    return counts
  }, [listedJobs])

  const visibleFilters = STATUS_FILTERS.filter(
    (filter) => filter.id === "all" || statusCounts[filter.id] > 0,
  )

  function openJob(jobId: number) {
    navigate(`/version5/jobs/${jobId}`)
  }

  function handleNewJob() {
    const id = createJob()
    navigate(`/version5/jobs/${id}`)
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, jobId: number) {
    if (editingJobId === jobId) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      openJob(jobId)
    }
  }

  function startRename(job: RuntimeReviewJob) {
    setEditingJobId(job.id)
    setDraftName(job.name)
  }

  function saveRename(job: RuntimeReviewJob) {
    const next = draftName.trim()
    if (next && next !== job.name) {
      renameJob(job.id, next)
    }
    setEditingJobId(null)
  }

  return (
    <div className="app-shell version5 is-jobs-home">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <AppHeader
        brandAriaLabel="Prototype versions"
        {...(listedJobs.length > 0
          ? {
              onSearchChange: setQuery,
              searchAriaLabel: "Search review jobs",
              searchPlaceholder: "Find a job by name, document, or tag",
              searchValue: query,
            }
          : {})}
      />
      <main className="app-main" id="main-content">
        <div
          className={`content-grid version5-jobs-layout${isEmpty ? " is-empty" : ""}`}
        >
          {listedJobs.length > 0 && (
            <header className="page-header version5-jobs-header">
              <div className="page-header-main">
                <div className="page-header-titles">
                  <h1>Review Jobs</h1>
                  <p className="page-subtitle">
                    Open a job to continue review, or start a new one.
                  </p>
                </div>
                <div className="page-header-actions">
                  <button className="primary-button" onClick={handleNewJob} type="button">
                    <Plus aria-hidden="true" size={16} strokeWidth={2.2} />
                    New Review Job
                  </button>
                </div>
              </div>
            </header>
          )}

          {listedJobs.length > 0 && (
            <section className="version5-jobs-toolbar" aria-label="Filter review jobs">
              <div className="job-status-filters" role="toolbar" aria-label="Status filters">
                {visibleFilters.map((filter) => {
                  const isActive = statusFilter === filter.id
                  return (
                    <button
                      aria-pressed={isActive}
                      className={`job-status-filter${isActive ? " is-active" : ""}`}
                      key={filter.id}
                      onClick={() => setStatusFilter(filter.id)}
                      type="button"
                    >
                      <span>{filter.label}</span>
                      <span className="job-status-filter-count">{statusCounts[filter.id]}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {isHydrating ? (
            <section className="workspace-loading" aria-live="polite">
              <h2>Loading review jobs…</h2>
              <p>Restoring your locally saved sessions.</p>
            </section>
          ) : listedJobs.length === 0 ? (
            <section className="version5-jobs-empty" aria-live="polite">
              <div className="version5-jobs-empty-visual">
                <div aria-hidden="true" className="version5-jobs-empty-media">
                  {EMPTY_STATE_STEPS.map((step, index) => (
                    <img
                      alt=""
                      className={`version5-jobs-empty-illustration${index === previewStep ? " is-active" : ""}`}
                      key={step.illustration}
                      src={step.illustration}
                    />
                  ))}
                </div>
                <div
                  aria-label="Workflow preview"
                  className="version5-jobs-empty-steps"
                  role="group"
                >
                  {EMPTY_STATE_STEPS.map((step, index) => (
                    <button
                      aria-label={step.title}
                      aria-pressed={index === previewStep}
                      className={`version5-jobs-empty-dot${index === previewStep ? " is-active" : ""}`}
                      key={step.illustration}
                      onClick={() => setPreviewStep(index)}
                      type="button"
                    />
                  ))}
                </div>
              </div>
              <div className="version5-jobs-empty-copy">
                <h1 className="version5-jobs-empty-need">Start a new review job</h1>
                <p className="version5-jobs-empty-why" key={previewStep}>
                  {activeEmptyStep.subtitle}
                </p>
                <button className="primary-button" onClick={handleNewJob} type="button">
                  <Plus aria-hidden="true" size={16} strokeWidth={2.2} />
                  New Review Job
                </button>
              </div>
            </section>
          ) : filteredJobs.length === 0 ? (
            <section className="version5-jobs-empty is-filtered" aria-live="polite">
              <div className="version5-jobs-empty-copy">
                <p className="version5-jobs-empty-status">No matching jobs</p>
                <h2 className="version5-jobs-empty-need">Try a different search or filter</h2>
                <p className="version5-jobs-empty-why">
                  Your jobs are still here — adjust the query or status to find the one you need.
                </p>
              </div>
            </section>
          ) : (
            <div className="review-summary-table-wrap version5-jobs-table-wrap">
              <table className="review-summary-table version5-jobs-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Status</th>
                    <th scope="col">Progress</th>
                    <th scope="col">Updated</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.map((job) => {
                    const status = getJobSidebarStatus(job)
                    const { decided, total } = getDecidedReviewProgress(job)
                    const progressPct = total > 0 ? Math.round((decided / total) * 100) : 0
                    const isEditing = editingJobId === job.id
                    return (
                      <tr
                        className={`version5-jobs-row${isEditing ? " is-editing" : ""}`}
                        key={job.id}
                        onClick={() => {
                          if (!isEditing) openJob(job.id)
                        }}
                        onKeyDown={(event) => handleRowKeyDown(event, job.id)}
                        tabIndex={isEditing ? -1 : 0}
                      >
                        <td>
                          {isEditing ? (
                            <input
                              aria-label="Review job name"
                              autoFocus
                              className="version5-jobs-rename-input"
                              onBlur={() => saveRename(job)}
                              onChange={(event) => setDraftName(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onFocus={(event) => {
                                const input = event.currentTarget
                                const len = input.value.length
                                requestAnimationFrame(() => {
                                  input.setSelectionRange(len, len)
                                })
                              }}
                              onKeyDown={(event) => {
                                event.stopPropagation()
                                if (event.key === "Enter") {
                                  event.preventDefault()
                                  event.currentTarget.blur()
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault()
                                  setDraftName(job.name)
                                  setEditingJobId(null)
                                }
                              }}
                              value={draftName}
                            />
                          ) : (
                            <>
                              <span className="version5-jobs-name">{job.name}</span>
                              {job.fileNames.length > 0 && (
                                <span className="version5-jobs-meta">
                                  {job.fileNames.length} document{job.fileNames.length === 1 ? "" : "s"}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td>
                          <span className={`version5-jobs-status is-${status}`}>
                            {tableStatusLabel(status)}
                          </span>
                        </td>
                        <td>
                          <div className="version5-jobs-progress">
                            <span>{progressLabel(job)}</span>
                            {total > 0 && (
                              <span
                                aria-hidden="true"
                                className="version5-jobs-progress-bar"
                              >
                                <span style={{ width: `${progressPct}%` }} />
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <time dateTime={new Date(job.updatedAt).toISOString()}>
                            {formatRelativeUpdated(job.updatedAt)}
                          </time>
                        </td>
                        <td className="version5-jobs-actions">
                          <JobActionsMenu
                            job={job}
                            onDelete={() => deleteJob(job.id)}
                            onRename={() => startRename(job)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
