import { useEffect, useRef, useState, type ReactNode } from "react"

import type { ExtractionProgress } from "@/lib/review-jobs"

type Stage = "preparing" | "reading" | "analyzing"

function resolveStage(progress: ExtractionProgress | null | undefined): Stage {
  if (!progress || progress.documentsTotal <= 0) return "preparing"
  if (progress.stage === "analyzing") return "analyzing"
  return "reading"
}

export function useExtractionStatusMessage(progress: ExtractionProgress | null | undefined = null) {
  const stage = resolveStage(progress)
  const documentsTotal = Math.max(progress?.documentsTotal ?? 0, 0)
  const documentsProcessed = Math.min(
    Math.max(progress?.documentsProcessed ?? 0, 0),
    documentsTotal || 0,
  )

  const [tick, setTick] = useState(false)
  const previousCountRef = useRef(documentsProcessed)

  useEffect(() => {
    if (previousCountRef.current === documentsProcessed) return
    previousCountRef.current = documentsProcessed
    setTick(true)
    const timer = window.setTimeout(() => setTick(false), 280)
    return () => window.clearTimeout(timer)
  }, [documentsProcessed])

  const countDigits = Math.max(String(documentsTotal || 1).length, 1)
  const messageKey = stage

  let message: ReactNode = "Preparing extraction…"
  if (stage === "reading") {
    message = (
      <>
        Reading documents (
        <span className="processing-count">
          <span
            className={`processing-count-current${tick ? " is-ticking" : ""}`}
            style={{ minWidth: `${countDigits}ch` }}
          >
            {documentsProcessed}
          </span>
          <span aria-hidden="true">/</span>
          <span>{documentsTotal}</span>
        </span>
        )…
      </>
    )
  } else if (stage === "analyzing") {
    message = "Extracting tags…"
  }

  return { message, messageKey }
}

type ExtractionStatusMessageProps = {
  progress?: ExtractionProgress | null
  className?: string
}

export function ExtractionStatusMessage({
  progress = null,
  className = "processing-message",
}: ExtractionStatusMessageProps) {
  const { message, messageKey } = useExtractionStatusMessage(progress)

  return (
    <p aria-live="polite" className={className} key={messageKey}>
      {message}
    </p>
  )
}
