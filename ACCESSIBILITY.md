# v4 Accessibility checklist

Plain-language list of accessibility problems in the v4 prototype.
We fix them **one by one**. Check the box when done.

How to use:
1. Pick the next unchecked item
2. Fix it in code
3. Mark it `[x]`
4. Move to the next

---

## Critical — fix these first

- [x] **1. Pop-ups don’t trap the keyboard**  
  When Delete or Job history opens, Tab can jump to stuff behind the pop-up. Focus should stay inside the pop-up.  
  *Done: `useModalFocus` keeps Tab inside Confirm + Job history and marks the page behind as inert.*

- [x] **2. After closing a pop-up, focus is lost** — fixable  
  Keyboard users should land back on the button they clicked (Delete, History, etc.).  
  *Done: `useModalFocus` restores focus to the opener when Confirm / Job history / PDF drawer close.*

- [x] **3. Hidden file upload boxes have no name** — fixable  
  Invisible “choose file / folder” inputs get keyboard focus but screen readers don’t know what they are. Give them a name, and preferably skip them in the tab order (use the visible buttons instead).  
  *Done: `aria-label` + `tabIndex={-1}` on both file inputs.*

- [x] **4. PDF viewer is just a picture** — fixable  
  The PDF is drawn as an image (canvas). Blind users can’t read the document text to check tags. Need a text layer or readable fallback.  
  *Done: page text is exposed in a screen-reader-only region (from PDF.js text content), with match/highlight summary. Canvas is `aria-hidden`.*

- [x] **5. Opening the PDF doesn’t move focus into it** — fixable  
  The PDF panel should take focus when opened, keep focus inside, and return focus when closed.  
  *Done: PDF drawer uses `useModalFocus` (no page inert — panel lives inside `#root`); focuses Close; restores opener on close.*

---

## High — fix next

- [x] **6. ⋯ menus don’t work well with keyboard** — fixable  
  Arrow keys should move between Rename / History / Delete. Opening the menu should focus the first item. Closing should return focus to the ⋯ button.  
  *Done: `useMenuKeyboard` on sidebar job menu + Export menu (arrows, Home/End, Escape restores trigger).*

- [x] **7. Intro slideshow keeps auto-playing** — fixable  
  Add a Pause control (and pause on hover/focus). Announce the slide title when it changes.  
  *Done: Pause/Play button, pause on hover/focus, live region for slide title/subtitle.*

- [x] **8. Collapsed sidebar hides job names** — fixable  
  *Approach: when collapsed, hide the job list entirely; keep logo, New, and Search.*  
  *Done: job list only renders when sidebar is expanded (`!isCollapsed`).*

- [x] **9. Approve / Reject / Needs review don’t say what’s selected**  
  Screen readers can’t tell which decision is active. Use pressed/selected state (or a radio group).  
  *Done: same buttons with `aria-pressed` + `role="group"` labeled Decision.*

- [x] **10. Tag completion is only a green/grey circle**  
  Incomplete tags should announce progress, e.g. “PSV-4015, 2 of 5 reviewed”.  
  *Done: tag buttons use `aria-label` with progress; icons are decorative.*

- [x] **11. Upload progress bar isn’t announced properly**  
  Use a real progressbar role with current %, and announce milestones (or completion).  
  *Done: `role="progressbar"` with valuemin/max/now/text (no visual change).*

- [x] **12. Search box has no visible focus ring** — fixable  
  When you Tab to search, it should be obvious you’re there.  
  *Done: `:focus-within` ring on `.job-search-field`.*

- [x] **13. Mobile menu is incomplete**  
  Escape should close it, focus should stay inside while open, and the toggle should say if it’s expanded.  
  *Done: `aria-expanded` / `aria-controls`, focus trap while open, Escape closes, focus returns to toggle.*

- [x] **14. Some grey text is too light** — fixable  
  Sidebar label and upload helper text fail contrast (~4.42:1, need 4.5:1). Darken the grey.  
  *Done: `--muted-foreground` darkened to `oklch(0.45 0 0)`.*

- [x] **15. Menu hover highlight only works with a mouse** — fixable  
  Keyboard focus should get the same clear highlight as hover.  
  *Done: `SlidingMenuHoverIndicator` also tracks `focusin` / `focusout`.*

---

## Medium

- [x] **16. No “Skip to main content” link**  
  Also label the sidebar and use a proper main page heading (`h1`).  
  *Done: skip link, `aside` labeled Review jobs, `main#main-content`, page titles use `h1`.*

- [x] **17. Buttons say open/closed without saying what they control**  
  Add `aria-controls` linking the toggle to the panel/menu.  
  *Done: sidebar collapse/expand, mobile nav, and menus wire `aria-controls`.*

- [x] **18. Job history pop-up focus ring is weak at first**  
  Focus a real control (like Close) with a visible ring, not a blank dialog box.  
  *Done with #1/#5 pattern: initial focus is the Close button.*

- [x] **19. Job status labels can sound confusing**  
  Put one clear name on the job button; make status icons decorative.  
  *Done: single `aria-label` on job button (`name, status`); icons `aria-hidden`.*

- [x] **20. “Pinned” jobs aren’t announced** — feature removed  
  Include “Pinned” in the job’s accessible name when pinned.  
  *N/A: pinning feature removed — no fix needed.*

- [x] **21. Changing tags isn’t clearly announced**  
  When you pick a different tag, announce what’s showing (or use a proper tabs pattern).  
  *Done: polite live region announces “Showing tag …”.*

- [x] **22. PDF keyboard shortcuts can interfere** — fixable  
  Only handle Escape/arrows/zoom when focus is inside the PDF panel. Document the shortcuts.  
  *Done: shortcuts only run when focus is inside the panel; Escape via focus trap; shortcuts noted on the panel label.*

- [x] **23. Big status changes aren’t always announced**  
  Extraction done, review complete, export success should be announced once.  
  *Done: polite live region for extraction complete, review complete, and export complete.*

- [ ] **24. Focus outline may be too faint** — deferred (visual CSS change)  
  Make the focus ring dark enough to meet non-text contrast (3:1).

- [x] **25. Filter buttons aren’t great for arrow keys**  
  Toolbars usually support arrow-key movement between filters.  
  *Done: arrow/Home/End navigation + roving `tabIndex` on status filters.*

---

## Low — nice to fix

- [x] **26. Page title should be a main heading (`h1`)**  
  View titles currently start at `h2`.  
  *Done: upload, search, and loading titles use `h1` (same page-header styles).*

- [x] **27. `aria-current="page"` on job buttons**  
  Jobs aren’t separate pages — `aria-current="true"` fits better.  
  *Done.*

- [x] **28. Sidebar collapse button hardcodes expanded state**  
  Prefer one toggle with a real expanded value.  
  *Done: both collapse/expand controls use `aria-expanded={!isCollapsed}` + `aria-controls`.*

- [ ] **29. Empty upload area click is mouse-oriented** — deferred (optional)  
  Optional: the drop zone itself isn’t keyboard-activatable (named buttons already work).

---

## Already good (no action)

- Many icon buttons already have clear names
- Decorative icons are hidden from screen readers
- Delete dialog has a proper title and description
- Summary uses a real table
- Some animations respect “reduce motion”

---

## Progress

| Priority | Total | Done |
|----------|------:|-----:|
| Critical | 5 | 5 |
| High | 10 | 10 |
| Medium | 10 | 8 (+1 N/A, 1 deferred) |
| Low | 4 | 3 (1 deferred) |
| **All** | **29** | **27** (26 fixed + 1 N/A); **2 deferred** (#24, #29) |

Last updated: finished all remaining a11y-only items. Left aside: **#24**, **#29**.
