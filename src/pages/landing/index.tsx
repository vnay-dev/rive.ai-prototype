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
            its documents and approve or reject each occurrence individually. Status
            shows as a chip next to the action buttons.
          </span>
        </Link>
        <Link className="prototype-version-card" to="/version2">
          <strong>Version 2</strong>
          <span>
            Tags appear as a horizontally scrolling row of pills. Click a pill to open
            the same occurrence-level review panel underneath.
          </span>
        </Link>
        <Link className="prototype-version-card" to="/version3">
          <strong>Version 3</strong>
          <span>
            Same sidebar layout as Version 1, but selected status is shown on the
            action buttons themselves (Approve becomes Approved, with status color).
          </span>
        </Link>
        <Link className="prototype-version-card" to="/version4">
          <strong>Version 4</strong>
          <span>
            Fork of Version 1 for visual design and interaction polish. Same sidebar
            layout and occurrence-level review, ready to be restyled independently.
          </span>
        </Link>
        <Link className="prototype-version-card" to="/version5">
          <strong>Version 5</strong>
          <span>
            Fork of Version 4 for round-1 feedback fixes: jobs table home, document-
            primary review, pause/resume clarity, scale, and bulk actions.
          </span>
        </Link>
      </div>
    </main>
  )
}
