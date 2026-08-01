import { useState, type ReactNode } from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export type SidebarRenderProps = {
  isCollapsed: boolean
  onToggleCollapse: () => void
}

type AppLayoutProps = {
  sidebar: ReactNode | ((props: SidebarRenderProps) => ReactNode)
  children: ReactNode
}

/** The application shell: persistent desktop navigation and flexible page area. */
export function AppLayout({ sidebar, children }: AppLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const sidebarNode =
    typeof sidebar === "function"
      ? sidebar({
          isCollapsed,
          onToggleCollapse: () => setIsCollapsed((collapsed) => !collapsed),
        })
      : sidebar

  return (
    <div className={`app-shell ${isCollapsed ? "is-sidebar-collapsed" : ""}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label="Toggle navigation"
            className="sidebar-toggle"
            onClick={() => setIsSidebarOpen((open) => !open)}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
        </TooltipTrigger>
        <TooltipContent>Toggle navigation</TooltipContent>
      </Tooltip>
      <aside
        className={`app-sidebar ${isSidebarOpen ? "is-open" : ""} ${isCollapsed ? "is-collapsed" : ""}`}
      >
        {sidebarNode}
      </aside>
      {isSidebarOpen && (
        <button
          aria-label="Close navigation"
          className="sidebar-scrim"
          onClick={() => setIsSidebarOpen(false)}
          type="button"
        />
      )}
      <main className="app-main">{children}</main>
    </div>
  )
}
