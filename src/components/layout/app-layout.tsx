import { useState, type PropsWithChildren } from "react"

type AppLayoutProps = PropsWithChildren<{
  sidebar: React.ReactNode
}>

/** The application shell: persistent desktop navigation and flexible page area. */
export function AppLayout({ sidebar, children }: AppLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="app-shell">
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
      <aside className={`app-sidebar ${isSidebarOpen ? "is-open" : ""}`}>
        {sidebar}
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
