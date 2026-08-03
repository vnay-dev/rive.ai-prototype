import { Outlet } from "react-router-dom"

import { useReviewJobs } from "@/hooks/use-review-jobs"

export type Version5JobsContext = ReturnType<typeof useReviewJobs>

/** Owns shared job state for the version 5 jobs list + workspace routes. */
export function Version5Layout() {
  const jobsApi = useReviewJobs()
  return <Outlet context={jobsApi} />
}
