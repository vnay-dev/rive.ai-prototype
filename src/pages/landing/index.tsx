import { Link } from "react-router-dom"

export function LandingPage() {
  return (
    <main className="prototype-landing">
      <h1>Prototype versions</h1>
      <div className="prototype-landing-actions">
        <Link className="prototype-version-card" to="/version1">
          <strong>Version 1</strong>
          <span>
            Tags live in a secondary sidebar, like review jobs. Select a tag to review
            its documents and approve or reject each occurrence individually.
          </span>
        </Link>
        <Link className="prototype-version-card" to="/version2">
          <strong>Version 2</strong>
          <span>
            Tags appear as a horizontally scrolling row of pills. Click a pill to open
            the same occurrence-level review panel underneath.
          </span>
        </Link>
      </div>
    </main>
  )
}
