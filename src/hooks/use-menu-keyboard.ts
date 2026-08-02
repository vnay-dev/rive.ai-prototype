import { useEffect, type RefObject } from "react"

type UseMenuKeyboardOptions = {
  isOpen: boolean
  menuRef: RefObject<HTMLElement | null>
  triggerRef: RefObject<HTMLElement | null>
  onClose: () => void
  itemSelector?: string
}

/**
 * WAI-ARIA menu keyboard pattern: focus first item on open, Arrow/Home/End
 * navigation, Escape closes and returns focus to the trigger.
 */
export function useMenuKeyboard({
  isOpen,
  menuRef,
  triggerRef,
  onClose,
  itemSelector = '[role="menuitem"]',
}: UseMenuKeyboardOptions) {
  useEffect(() => {
    if (!isOpen) return
    const menu = menuRef.current
    if (!menu) return

    const items = () =>
      Array.from(menu.querySelectorAll<HTMLElement>(itemSelector)).filter(
        (el) => !el.hasAttribute("disabled"),
      )

    const focusItem = (index: number) => {
      const list = items()
      if (list.length === 0) return
      const next = ((index % list.length) + list.length) % list.length
      list[next]?.focus()
    }

    // Focus first item after the menu mounts.
    const frame = window.requestAnimationFrame(() => focusItem(0))

    function handleKeyDown(event: KeyboardEvent) {
      const list = items()
      if (list.length === 0) return

      const activeIndex = list.findIndex((item) => item === document.activeElement)

      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        triggerRef.current?.focus()
        return
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        focusItem(activeIndex < 0 ? 0 : activeIndex + 1)
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        focusItem(activeIndex < 0 ? list.length - 1 : activeIndex - 1)
        return
      }

      if (event.key === "Home") {
        event.preventDefault()
        focusItem(0)
        return
      }

      if (event.key === "End") {
        event.preventDefault()
        focusItem(list.length - 1)
        return
      }

      if (event.key === "Tab") {
        onClose()
        // Let Tab move naturally; restore trigger only for Shift+Tab from first item.
        if (event.shiftKey && activeIndex === 0) {
          event.preventDefault()
          triggerRef.current?.focus()
        }
      }
    }

    menu.addEventListener("keydown", handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      menu.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, menuRef, triggerRef, onClose, itemSelector])
}
