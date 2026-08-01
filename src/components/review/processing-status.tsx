import { useEffect, useLayoutEffect, useRef, useState } from "react"

import type { ExtractionProgress } from "@/lib/review-jobs"

type ProcessingStatusProps = {
  progress?: ExtractionProgress | null
}

type Stage = "preparing" | "reading" | "analyzing"

const ANALYZING_MESSAGES = [
  "Identifying engineering tags…",
  "Extracting tag information…",
  "Matching tags across documents…",
  "Counting tag occurrences…",
  "Linking tags to source documents…",
  "Validating extracted results…",
  "Finalizing extraction results…",
]

const READING_HOLD_MS = 2200
const ANALYZING_MESSAGE_DURATION_MS = 2600

function resolveStage(progress: ExtractionProgress | null | undefined): Stage {
  if (!progress || progress.documentsTotal <= 0) return "preparing"
  if (progress.stage === "analyzing") return "analyzing"
  return "reading"
}

export function ProcessingStatus({ progress = null }: ProcessingStatusProps) {
  const stage = resolveStage(progress)
  const documentsTotal = Math.max(progress?.documentsTotal ?? 0, 0)
  const documentsProcessed = Math.min(
    Math.max(progress?.documentsProcessed ?? 0, 0),
    documentsTotal || 0,
  )
  const readingPercent = documentsTotal === 0
    ? 8
    : Math.round((documentsProcessed / documentsTotal) * 70)

  const [tick, setTick] = useState(false)
  const [holdingReading, setHoldingReading] = useState(stage === "analyzing")
  const [analyzingIndex, setAnalyzingIndex] = useState(0)
  const previousCountRef = useRef(documentsProcessed)
  const previousStageRef = useRef(stage)

  const displayStage: Stage = stage === "analyzing" && holdingReading ? "reading" : stage
  const percent = displayStage === "analyzing"
    ? Math.max(readingPercent, 82)
    : Math.max(8, Math.min(readingPercent, 70))

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

  return (
    <section className="review-status extraction-progress" aria-busy="true" aria-live="polite">
      <p className="processing-message" key={messageKey}>
        {displayStage === "preparing" && "Preparing extraction…"}
        {displayStage === "reading" && (
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
        )}
        {displayStage === "analyzing" && ANALYZING_MESSAGES[analyzingIndex]}
      </p>

      <div
        aria-label={`Extraction progress ${percent}%`}
        className="extraction-progress-track"
      >
        <span className="extraction-progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </section>
  )
}
