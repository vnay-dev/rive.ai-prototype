import { useEffect, useState, type RefObject } from "react"

type SlidingMenuHoverIndicatorProps = {
  containerRef: RefObject<HTMLElement | null>
  itemSelector?: string
  className?: string
}

type IndicatorState = {
  top: number
  height: number
  visible: boolean
  animated: boolean
}

/** Sliding hover slab that tracks menu items inside a positioned popover. */
export function SlidingMenuHoverIndicator({
  containerRef,
  itemSelector = '[role="menuitem"]',
  className = "",
}: SlidingMenuHoverIndicatorProps) {
  const [indicator, setIndicator] = useState<IndicatorState>({
    top: 0,
    height: 0,
    visible: false,
    animated: false,
  })

  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    function moveTo(item: HTMLElement | null) {
      if (!item || !root) {
        setIndicator((current) => (current.visible ? { ...current, visible: false } : current))
        return
      }

      const rootRect = root.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()
      const top = itemRect.top - rootRect.top
      const height = itemRect.height
      setIndicator((current) => ({
        top,
        height,
        visible: true,
        animated: current.visible,
      }))
    }

    function handlePointerOver(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const item = target.closest(itemSelector)
      if (!(item instanceof HTMLElement) || !root?.contains(item)) return
      moveTo(item)
    }

    function handlePointerLeave() {
      moveTo(null)
    }

    root.addEventListener("pointerover", handlePointerOver)
    root.addEventListener("pointerleave", handlePointerLeave)
    return () => {
      root.removeEventListener("pointerover", handlePointerOver)
      root.removeEventListener("pointerleave", handlePointerLeave)
    }
  }, [containerRef, itemSelector])

  return (
    <div
      aria-hidden="true"
      className={[
        "menu-hover-slab",
        indicator.visible ? "is-visible" : "",
        indicator.animated ? "is-animated" : "",
        className,
      ].filter(Boolean).join(" ")}
      style={{
        transform: `translate3d(0, ${indicator.top}px, 0)`,
        height: indicator.height,
      }}
    />
  )
}
