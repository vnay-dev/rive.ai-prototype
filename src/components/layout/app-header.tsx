import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { Search } from "lucide-react"

import { getPublicAssetUrl } from "@/lib/media-assets"

const BRAND_MARK_SRC = getPublicAssetUrl("rive-logo.svg")

type AppHeaderProps = {
  brandTo?: string
  brandAriaLabel?: string
  actions?: ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchAriaLabel?: string
}

/** Top application bar: brand mark, optional search, and optional actions. */
export function AppHeader({
  brandTo = "/",
  brandAriaLabel = "Rive",
  actions,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  searchAriaLabel = "Search",
}: AppHeaderProps) {
  const showSearch = searchValue !== undefined && onSearchChange !== undefined

  return (
    <header className={`app-header${showSearch ? "" : " is-brand-only"}`}>
      <div className="app-header-inner">
        <Link aria-label={brandAriaLabel} className="app-header-brand" to={brandTo}>
          <img alt="" aria-hidden="true" className="brand-mark" src={BRAND_MARK_SRC} />
        </Link>

        {showSearch ? (
          <div className="app-header-search">
            <Search aria-hidden="true" size={15} strokeWidth={2} />
            <input
              aria-label={searchAriaLabel}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={searchValue}
            />
          </div>
        ) : null}

        {actions ? <div className="app-header-actions">{actions}</div> : null}
      </div>
    </header>
  )
}
