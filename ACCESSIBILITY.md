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

- [ ] **1. Pop-ups don’t trap the keyboard**  
  When Delete or Job history opens, Tab can jump to stuff behind the pop-up. Focus should stay inside the pop-up.

- [ ] **2. After closing a pop-up, focus is lost**  
  Keyboard users should land back on the button they clicked (Delete, History, etc.).

- [ ] **3. Hidden file upload boxes have no name**  
  Invisible “choose file / folder” inputs get keyboard focus but screen readers don’t know what they are. Give them a name, and preferably skip them in the tab order (use the visible buttons instead).

- [ ] **4. PDF viewer is just a picture**  
  The PDF is drawn as an image (canvas). Blind users can’t read the document text to check tags. Need a text layer or readable fallback.

- [ ] **5. Opening the PDF doesn’t move focus into it**  
  The PDF panel should take focus when opened, keep focus inside, and return focus when closed.

---

## High — fix next

- [ ] **6. ⋯ menus don’t work well with keyboard**  
  Arrow keys should move between Rename / History / Delete. Opening the menu should focus the first item. Closing should return focus to the ⋯ button.

- [ ] **7. Intro slideshow keeps auto-playing**  
  Add a Pause control (and pause on hover/focus). Announce the slide title when it changes.

- [ ] **8. Collapsed sidebar hides job names**  
  When the sidebar is skinny, screen readers may only hear “Ready” instead of the job name. Always include the job name in the accessible label.

- [ ] **9. Approve / Reject / Needs review don’t say what’s selected**  
  Screen readers can’t tell which decision is active. Use pressed/selected state (or a radio group).

- [ ] **10. Tag completion is only a green/grey circle**  
  Incomplete tags should announce progress, e.g. “PSV-4015, 2 of 5 reviewed”.

- [ ] **11. Upload progress bar isn’t announced properly**  
  Use a real progressbar role with current %, and announce milestones (or completion).

- [ ] **12. Search box has no visible focus ring**  
  When you Tab to search, it should be obvious you’re there.

- [ ] **13. Mobile menu is incomplete**  
  Escape should close it, focus should stay inside while open, and the toggle should say if it’s expanded.

- [ ] **14. Some grey text is too light**  
  Sidebar label and upload helper text fail contrast (~4.42:1, need 4.5:1). Darken the grey.

- [ ] **15. Menu hover highlight only works with a mouse**  
  Keyboard focus should get the same clear highlight as hover.

---

## Medium

- [ ] **16. No “Skip to main content” link**  
  Also label the sidebar and use a proper main page heading (`h1`).

- [ ] **17. Buttons say open/closed without saying what they control**  
  Add `aria-controls` linking the toggle to the panel/menu.

- [ ] **18. Job history pop-up focus ring is weak at first**  
  Focus a real control (like Close) with a visible ring, not a blank dialog box.

- [ ] **19. Job status labels can sound confusing**  
  Put one clear name on the job button; make status icons decorative.

- [ ] **20. “Pinned” jobs aren’t announced**  
  Include “Pinned” in the job’s accessible name when pinned.

- [ ] **21. Changing tags isn’t clearly announced**  
  When you pick a different tag, announce what’s showing (or use a proper tabs pattern).

- [ ] **22. PDF keyboard shortcuts can interfere**  
  Only handle Escape/arrows/zoom when focus is inside the PDF panel. Document the shortcuts.

- [ ] **23. Big status changes aren’t always announced**  
  Extraction done, review complete, export success should be announced once.

- [ ] **24. Focus outline may be too faint**  
  Make the focus ring dark enough to meet non-text contrast (3:1).

- [ ] **25. Filter buttons aren’t great for arrow keys**  
  Toolbars usually support arrow-key movement between filters.

---

## Low — nice to fix

- [ ] **26. Page title should be a main heading (`h1`)**  
  View titles currently start at `h2`.

- [ ] **27. `aria-current="page"` on job buttons**  
  Jobs aren’t separate pages — `aria-current="true"` fits better.

- [ ] **28. Sidebar collapse button hardcodes expanded state**  
  Prefer one toggle with a real expanded value.

- [ ] **29. Empty upload area click is mouse-oriented**  
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
| Critical | 5 | 0 |
| High | 10 | 0 |
| Medium | 10 | 0 |
| Low | 4 | 0 |
| **All** | **29** | **0** |

Last updated: checklist only — no fixes applied yet. Say which number to start with.
