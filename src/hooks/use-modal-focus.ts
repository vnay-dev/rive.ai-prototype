import { useEffect, type RefObject } from "react"

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
  )
}

type UseModalFocusOptions = {
  /** Element that contains focusable controls (the dialog panel). */
  containerRef: RefObject<HTMLElement | null>
  /** Optional element to focus first. Falls back to the first focusable control. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Called when Escape is pressed. */
  onEscape: () => void
  /**
   * When true (default), marks `#root` inert so the page behind cannot be
   * focused. Set false for panels rendered inside `#root` (e.g. PDF drawer).
   */
  enableInert?: boolean
  /** When false, the hook is idle (useful while a drawer is closing). */
  enabled?: boolean
}

/**
 * Keeps keyboard focus inside a modal/drawer and restores it to the opener
 * on close. Optionally marks the page behind as inert.
 */
export function useModalFocus({
  containerRef,
  initialFocusRef,
  onEscape,
  enableInert = true,
  enabled = true,
}: UseModalFocusOptions) {
  useEffect(() => {
    if (!enabled) return
    if (!containerRef.current) return
    const panel: HTMLElement = containerRef.current

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const root = enableInert ? document.getElementById("root") : null
    const hadInert = root?.hasAttribute("inert") ?? false
    if (root && !hadInert) {
      root.setAttribute("inert", "")
    }

    const focusInitial = () => {
      const preferred = initialFocusRef?.current
      if (preferred) {
        preferred.focus()
        return
      }
      const focusable = getFocusableElements(panel)
      ;(focusable[0] ?? panel).focus()
    }

    const frame = window.requestAnimationFrame(focusInitial)

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation()
        onEscape()
        return
      }

      if (event.key !== "Tab") return

      const focusable = getFocusableElements(panel)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last || !panel.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener("keydown", handleKeyDown)

      if (root && !hadInert) {
        root.removeAttribute("inert")
      }

      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [containerRef, initialFocusRef, onEscape, enableInert, enabled])
}

export { getFocusableElements, FOCUSABLE_SELECTOR }
