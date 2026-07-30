import { useEffect, useState } from "react"

const PROCESSING_MESSAGES = [
  "Reading engineering documents...",
  "Analyzing document contents...",
  "Identifying engineering tags...",
  "Extracting tag information...",
  "Matching tags across documents...",
  "Counting tag occurrences...",
  "Linking tags to source documents...",
  "Calculating confidence scores...",
  "Validating extracted results...",
  "Finalizing extraction results...",
]

const MESSAGE_DURATION_MS = 2600

export function ProcessingStatus() {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % PROCESSING_MESSAGES.length)
    }, MESSAGE_DURATION_MS)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <section className="review-status" aria-live="polite" aria-busy="true">
      <p className="processing-message" key={messageIndex}>
        {PROCESSING_MESSAGES[messageIndex]}
      </p>
    </section>
  )
}
