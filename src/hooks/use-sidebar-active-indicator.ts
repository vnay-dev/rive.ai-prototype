import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"

type ActiveIndicatorState = {
  top: number
  height: number
  visible: boolean
  animated: boolean
}

const HIDDEN: ActiveIndicatorState = {
  top: 0,
  height: 0,
  visible: false,
  animated: false,
}

/** Sliding active-tab indicator used by sidebar job/tag lists. */
export function useSidebarActiveIndicator(
  activeKey: string,
  itemCount: number,
  layoutKey = "",
): {
  listRef: RefObject<HTMLDivElement | null>
  activeIndicator: ActiveIndicatorState
} {
  const listRef = useRef<HTMLDivElement>(null)
  const [activeIndicator, setActiveIndicator] = useState<ActiveIndicatorState>(HIDDEN)

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || itemCount === 0) {
      setActiveIndicator((current) => (current.visible ? { ...current, visible: false } : current))
      return
    }

    const active = list.querySelector<HTMLElement>(".sidebar-job.is-active")
    if (!active) {
      setActiveIndicator((current) => (current.visible ? { ...current, visible: false } : current))
      return
    }

    const top = active.offsetTop
    const height = active.offsetHeight
    setActiveIndicator((current) => {
      const next = {
        top,
        height,
        visible: true,
        animated: current.visible,
      }
      if (
        current.top === next.top
        && current.height === next.height
        && current.visible === next.visible
        && current.animated === next.animated
      ) {
        return current
      }
      return next
    })
  }, [activeKey, itemCount, layoutKey])

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const sync = () => {
      const active = list.querySelector<HTMLElement>(".sidebar-job.is-active")
      if (!active) {
        setActiveIndicator((current) => (current.visible ? { ...current, visible: false } : current))
        return
      }
      setActiveIndicator((current) => ({
        top: active.offsetTop,
        height: active.offsetHeight,
        visible: true,
        animated: current.visible,
      }))
    }

    const observer = new ResizeObserver(sync)
    observer.observe(list)
    return () => observer.disconnect()
  }, [itemCount])

  return { listRef, activeIndicator }
}
