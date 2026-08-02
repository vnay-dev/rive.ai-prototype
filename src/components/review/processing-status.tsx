import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"

import type { ExtractionProgress } from "@/lib/review-jobs"

type Stage = "preparing" | "reading" | "analyzing"

// Wait-state copy only — real progress is the document count during reading.
const ANALYZING_MESSAGES = [
  "Looking for tags in your documents…",
  "Finding tag IDs across pages…",
  "Grouping the same tags together…",
  "Recording where each tag appears…",
  "Linking tags to source documents…",
  "Building your review list…",
  "Preparing tags for review…",
  "Organizing findings by tag…",
  "Getting results ready…",
  "Almost ready for review…",
]

const READING_HOLD_MS = 2200
const ANALYZING_MESSAGE_DURATION_MS = 2600

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
  const [holdingReading, setHoldingReading] = useState(stage === "analyzing")
  const [analyzingIndex, setAnalyzingIndex] = useState(0)
  const previousCountRef = useRef(documentsProcessed)
  const previousStageRef = useRef(stage)

  const displayStage: Stage = stage === "analyzing" && holdingReading ? "reading" : stage

  useEffect(() => {
    if (previousCountRef.current === documentsProcessed) return
    previousCountRef.current = documentsProcessed
    setTick(true)
    const timer = window.setTimeout(() => setTick(false), 280)
    return () => window.clearTimeout(timer)
  }, [documentsProcessed])

  useLayoutEffect(() => {
    const enteredAnalyzing = stage === "analyzing" && previousStageRef.current !== "analyzing"
    previousStageRef.current = stage

    if (stage !== "analyzing") {
      setHoldingReading(false)
      setAnalyzingIndex(0)
      return
    }

    if (!enteredAnalyzing) return

    setHoldingReading(true)
    setAnalyzingIndex(0)
  }, [stage])

  useEffect(() => {
    if (stage !== "analyzing" || !holdingReading) return

    const holdTimer = window.setTimeout(() => {
      setHoldingReading(false)
    }, READING_HOLD_MS)

    return () => window.clearTimeout(holdTimer)
  }, [stage, holdingReading])

  useEffect(() => {
    if (stage !== "analyzing" || holdingReading) return

    const intervalId = window.setInterval(() => {
      setAnalyzingIndex((index) => (index + 1) % ANALYZING_MESSAGES.length)
    }, ANALYZING_MESSAGE_DURATION_MS)

    return () => window.clearInterval(intervalId)
  }, [stage, holdingReading])

  const countDigits = Math.max(String(documentsTotal || 1).length, 1)
  const displayProcessed = displayStage === "reading" && stage === "analyzing"
    ? documentsTotal
    : documentsProcessed
  const messageKey = displayStage === "analyzing"
    ? `analyzing-${analyzingIndex}`
    : displayStage === "reading" && stage === "analyzing"
      ? "reading-hold"
      : displayStage

  let message: ReactNode = "Preparing extraction…"
  if (displayStage === "reading") {
    message = (
      <>
        Reading documents (
        <span className="processing-count">
          <span
            className={`processing-count-current${tick ? " is-ticking" : ""}`}
            style={{ minWidth: `${countDigits}ch` }}
          >
            {displayProcessed}
          </span>
          <span aria-hidden="true">/</span>
          <span>{documentsTotal}</span>
        </span>
        )…
      </>
    )
  } else if (displayStage === "analyzing") {
    message = ANALYZING_MESSAGES[analyzingIndex]
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
