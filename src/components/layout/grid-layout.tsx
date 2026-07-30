import type { PropsWithChildren } from "react"

type GridLayoutProps = PropsWithChildren<{
  className?: string
}>

/** A centered, 12-column content grid used by every application page. */
export function GridLayout({ children, className = "" }: GridLayoutProps) {
  return <div className={`content-grid ${className}`.trim()}>{children}</div>
}
