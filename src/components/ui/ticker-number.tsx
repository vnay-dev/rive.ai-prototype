import { useEffect, useLayoutEffect, useRef, useState } from "react"

type TickerNumberProps = {
  value: number
  className?: string
}

type TickerFrame = {
  from: number
  to: number
  direction: "up" | "down"
}

export function TickerNumber({ value, className }: TickerNumberProps) {
  const previousRef = useRef(value)
  const [frame, setFrame] = useState<TickerFrame | null>(null)
  const [displayed, setDisplayed] = useState(value)

  useLayoutEffect(() => {
    if (value === previousRef.current) return

    const from = previousRef.current
    previousRef.current = value
    setDisplayed(value)
    setFrame({
      from,
      to: value,
      direction: value > from ? "up" : "down",
    })
  }, [value])

  useEffect(() => {
    if (!frame) return

    const timer = window.setTimeout(() => setFrame(null), 340)
    return () => window.clearTimeout(timer)
  }, [frame])

  const digits = Math.max(String(Math.max(displayed, frame?.from ?? 0)).length, 1)

  return (
    <span
      className={["ticker-number", frame ? `is-ticking is-${frame.direction}` : "", className]
        .filter(Boolean)
        .join(" ")}
      style={{ minWidth: `${digits}ch` }}
    >
      <span className="ticker-number-viewport">
        {frame ? (
          <>
            <span aria-hidden="true" className="ticker-number-digit is-from">
              {frame.from}
            </span>
            <span className="ticker-number-digit is-to">{frame.to}</span>
          </>
        ) : (
          <span className="ticker-number-digit">{displayed}</span>
        )}
      </span>
    </span>
  )
}
