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
  danger: boolean
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
    danger: false,
  })

  useEffect(() => {
    if (!containerRef.current) return
    const menuRoot: HTMLElement = containerRef.current

    function moveTo(item: HTMLElement | null) {
      if (!item) {
        setIndicator((current) => (
          current.visible
            ? { ...current, visible: false, danger: false }
            : current
        ))
        return
      }

      const rootRect = menuRoot.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()
      const top = itemRect.top - rootRect.top
      const height = itemRect.height
      const danger = item.classList.contains("is-danger")
      setIndicator((current) => ({
        top,
        height,
        visible: true,
        animated: current.visible,
        danger,
      }))
    }

    function handlePointerOver(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const item = target.closest(itemSelector)
      if (!(item instanceof HTMLElement) || !menuRoot.contains(item)) return
      moveTo(item)
    }

    function handlePointerLeave() {
      moveTo(null)
    }

    function handleFocusIn(event: FocusEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      const item = target.closest(itemSelector)
      if (!(item instanceof HTMLElement) || !menuRoot.contains(item)) return
      moveTo(item)
    }

    function handleFocusOut(event: FocusEvent) {
      const next = event.relatedTarget
      if (next instanceof Node && menuRoot.contains(next)) return
      moveTo(null)
    }

    menuRoot.addEventListener("pointerover", handlePointerOver)
    menuRoot.addEventListener("pointerleave", handlePointerLeave)
    menuRoot.addEventListener("focusin", handleFocusIn)
    menuRoot.addEventListener("focusout", handleFocusOut)
    return () => {
      menuRoot.removeEventListener("pointerover", handlePointerOver)
      menuRoot.removeEventListener("pointerleave", handlePointerLeave)
      menuRoot.removeEventListener("focusin", handleFocusIn)
      menuRoot.removeEventListener("focusout", handleFocusOut)
    }
  }, [containerRef, itemSelector])

  return (
    <div
      aria-hidden="true"
      className={[
        "menu-hover-slab",
        indicator.visible ? "is-visible" : "",
        indicator.animated ? "is-animated" : "",
        indicator.danger ? "is-danger" : "",
        className,
      ].filter(Boolean).join(" ")}
      style={{
        transform: `translate3d(0, ${indicator.top}px, 0)`,
        height: indicator.height,
      }}
    />
  )
}
