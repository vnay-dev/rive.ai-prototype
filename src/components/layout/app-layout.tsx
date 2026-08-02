import { useEffect, useId, useRef, useState, type ReactNode } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useModalFocus } from "@/hooks/use-modal-focus"

export type SidebarRenderProps = {
  isCollapsed: boolean
  onToggleCollapse: () => void
  /** Id for the collapsible sidebar panel — wire to aria-controls. */
  sidebarPanelId: string
}

type AppLayoutProps = {
  sidebar: ReactNode | ((props: SidebarRenderProps) => ReactNode)
  children: ReactNode
  className?: string
}

/** The application shell: persistent desktop navigation and flexible page area. */
export function AppLayout({ sidebar, children, className }: AppLayoutProps) {
  const sidebarPanelId = useId()
  const navToggleRef = useRef<HTMLButtonElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const closeMobileNav = () => setIsSidebarOpen(false)

  useModalFocus({
    containerRef: asideRef,
    onEscape: closeMobileNav,
    enableInert: false,
    enabled: isSidebarOpen,
  })

  // Restore focus to the hamburger when the mobile drawer closes.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (wasOpenRef.current && !isSidebarOpen) {
      navToggleRef.current?.focus()
    }
    wasOpenRef.current = isSidebarOpen
  }, [isSidebarOpen])

  const sidebarNode =
    typeof sidebar === "function"
      ? sidebar({
          isCollapsed,
          onToggleCollapse: () => setIsCollapsed((collapsed) => !collapsed),
          sidebarPanelId,
        })
      : sidebar

  return (
    <div className={`app-shell ${isCollapsed ? "is-sidebar-collapsed" : ""}${className ? ` ${className}` : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-controls={sidebarPanelId}
            aria-expanded={isSidebarOpen}
            aria-label={isSidebarOpen ? "Close navigation" : "Open navigation"}
            className="sidebar-toggle"
            onClick={() => setIsSidebarOpen((open) => !open)}
            ref={navToggleRef}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {isSidebarOpen ? "Close navigation" : "Open navigation"}
        </TooltipContent>
      </Tooltip>
      <aside
        aria-label="Review jobs"
        className={`app-sidebar ${isSidebarOpen ? "is-open" : ""} ${isCollapsed ? "is-collapsed" : ""}`}
        id={sidebarPanelId}
        ref={asideRef}
      >
        {sidebarNode}
      </aside>
      {isSidebarOpen && (
        <button
          aria-label="Close navigation"
          className="sidebar-scrim"
          onClick={closeMobileNav}
          type="button"
        />
      )}
      <main className="app-main" id="main-content">
        {children}
      </main>
    </div>
  )
}
