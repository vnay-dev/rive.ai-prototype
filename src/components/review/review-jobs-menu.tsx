import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Check, ChevronDown, FileText, List, LoaderCircle } from "lucide-react"

import {
  getJobSidebarStatus,
  isListedReviewJob,
  jobSidebarStatusLabel,
  sortJobs,
  type JobSidebarStatus,
  type RuntimeReviewJob,
} from "@/lib/review-jobs"

type ReviewJobsMenuProps = {
  jobs: RuntimeReviewJob[]
  activeJobId: number | null
}

function shortStatusLabel(status: JobSidebarStatus) {
  if (status === "ready") return "Active"
  if (status === "idle") return "Draft"
  return jobSidebarStatusLabel(status)
}

function JobStatusIcon({ status }: { status: JobSidebarStatus }) {
  if (status === "completed") {
    return <Check aria-hidden="true" className="review-jobs-menu-status-icon is-completed" size={14} strokeWidth={2.4} />
  }
  if (status === "ready") {
    return <span aria-hidden="true" className="review-jobs-menu-status-dot" />
  }
  if (status === "processing") {
    return <LoaderCircle aria-hidden="true" className="review-jobs-menu-status-icon is-processing" size={14} strokeWidth={2.2} />
  }
  if (status === "error") {
    return <span aria-hidden="true" className="review-jobs-menu-status-dot is-error" />
  }
  return <FileText aria-hidden="true" className="review-jobs-menu-status-icon is-draft" size={14} strokeWidth={2} />
}

/** Header control: click to open a job jump list; View all goes to the jobs table. */
export function ReviewJobsMenu({ jobs, activeJobId }: ReviewJobsMenuProps) {
  const navigate = useNavigate()
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const listedJobs = useMemo(
    () => sortJobs(jobs.filter(isListedReviewJob)),
    [jobs],
  )

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("mousedown", onPointerDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("mousedown", onPointerDown)
    }
  }, [open])

  if (listedJobs.length === 0) return null

  return (
    <div
      className={`review-jobs-menu${open ? " is-open" : ""}`}
      ref={rootRef}
    >
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        className="tertiary-button version5-header-jobs-link"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <List aria-hidden="true" size={15} strokeWidth={2} />
        Review jobs
        <ChevronDown
          aria-hidden="true"
          className="review-jobs-menu-chevron"
          size={14}
          strokeWidth={2.2}
        />
      </button>

      {open ? (
        <div
          aria-label="Review jobs"
          className="review-jobs-menu-panel"
          id={menuId}
          role="menu"
        >
          <ul className="review-jobs-menu-list">
            {listedJobs.map((job) => {
              const status = getJobSidebarStatus(job)
              const isCurrent = job.id === activeJobId
              const statusLabel = shortStatusLabel(status)

              return (
                <li key={job.id} role="none">
                  <button
                    aria-current={isCurrent ? "page" : undefined}
                    aria-label={`${job.name}, ${statusLabel}${isCurrent ? ", current job" : ""}`}
                    className={`review-jobs-menu-item${isCurrent ? " is-current" : ""}`}
                    onClick={() => {
                      setOpen(false)
                      if (!isCurrent) navigate(`/version5/jobs/${job.id}`)
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span className={`review-jobs-menu-status is-${status}`}>
                      <JobStatusIcon status={status} />
                    </span>
                    <span className="review-jobs-menu-item-name">{job.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="review-jobs-menu-footer">
            <Link
              className="review-jobs-menu-footer-link"
              onClick={() => setOpen(false)}
              role="menuitem"
              to="/version5"
            >
              View all jobs
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
