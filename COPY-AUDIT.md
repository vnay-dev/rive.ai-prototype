# Copy audit — fix list

Simple review of the words users see in rive.ai.
Goal: clear, consistent, useful — not marketing fluff.

**How we use this file:** fix one item at a time. Check it off when done.

---

## Verdict (short)

Buttons and main actions are mostly fine.
Problems: some words mean different things in different places, progress text overpromises, and a few lines sound like ads instead of instructions.

---

## P0 — Fix first (confusing or untrustworthy)

### [x] P0-1 · “Flag” vs “Needs review” - fixable
**Problem:** Onboarding says “flag tags.” The button says “Needs review.”
**Why it matters:** Users learn the wrong word, then can’t find that action.
**Fix:** Use **Needs review** everywhere (button, preview, docs). Drop “flag.”
**Done:** Preview + AGENTS now say “needs review.”

### [x] P0-2 · Two names for the same job status - fixable
**Problem:** Sidebar says “Ready for review.” Job details say “In Review.” Same state.
**Why it matters:** Status looks broken or out of sync.
**Fix:** Use **Ready for review** in both places.
**Done:** Job details uses **Ready for review**.

### [x] P0-3 · Fake-sounding extraction messages - fixable
**Problem:** Status rotates through lines like “Validating…” and “Matching…” on a timer — not real steps.
**Why it matters:** Engineers stop trusting the AI progress text.
**Fix:** Only show real progress (e.g. “Reading documents 2/5”, “Extracting tags…”).
**Done:** Status shows preparing / reading count / Extracting tags… only.

### [x] P0-4 · Vague error messages - fixable
**Problem:** Failures say “Review failed. Try again.” or show raw API text.
**Why it matters:** Users don’t know what went wrong or what to do next.
**Fix:** Short human reason + one clear next step.
**Done:** `toUserFacingReviewError` maps timeouts, config, network, and schema failures.

### [x] P0-5 · Upload subtitle is marketing, not help - fixable
**Problem:** “Turn drawings into trusted, searchable data with AI-assisted…”
**Why it matters:** User already started a job. They need what to upload next, not a pitch.
**Fix:** Something like: “Add P&IDs or PDFs, then extract tags for review.”
**Done:** Upload subtitle updated in home + v4.

---

## P1 — Consistency

### [x] P1-1 · Occurrence vs match - fixable
**Problem:** UI mixes “occurrence,” “match,” and “tag occurrence.”
**Fix:** One glossary — **tag** → **occurrence** (page hit). Use “match” only if needed for multi-hits on one page, and keep it consistent.
**Done:** On-page count uses “times”; export column is **Count**; dropped “tag occurrence.”

### [ ] P1-2 · Home and Version 4 say different things when complete
**Problem:** Completion sentences don’t match between workspaces.
**Fix:** One shared completion sentence for both.

### [x] P1-3 · “Review results” while still reviewing - fixable
**Problem:** Title sounds finished while the user is still deciding.
**Fix:** Call the active step **Review tags** (or **Review**). Use **Review summary** only when done.
**Done:** Active phase title is **Review tags**.

### [x] P1-4 · Empty states are unclear - fixable
**Problem:** Lines like “No validated findings to summarise” don’t help.
**Fix:** Say what happened and what to do next in plain words.
**Done:** Summary, review empty, export tooltip, and no-tags footer copy updated.

### [x] P1-5 · British spelling in one place - fixable
**Problem:** “summarise” while the rest of the app is US English.
**Fix:** Use **summarize** (en-US) everywhere.
**Done:** Removed with the empty-state rewrite.

### [x] P1-6 · Dialog button tone mixes casual and formal - fixable
**Problem:** “No, skip” / “Yes, upload” next to formal “Cancel” / “Delete.”
**Fix:** Align to calm, direct labels (e.g. **Skip** / **Upload anyway**).
**Done:** Duplicate dialog uses **Skip** / **Upload anyway**.

### [ ] P1-7 · Home page is prototype language
**Problem:** `/` says “Prototype versions” and designer notes.
**Fix:** Hide from real users, or send `/` to the main workspace.
**Status:** Leave as-is for now (prototype picker is intentional).

---

## P2 — Polish

### [x] P2-1 · Title Case vs sentence case - fixable
**Problem:** “Last Updated,” “Tags Extracted” vs “Extract tags,” “Review jobs.”
**Fix:** Sentence case for labels: **Last updated**, **Tags extracted**.
**Done.**

### [x] P2-2 · Mixed ellipsis style - fixable
**Problem:** `...` in one title, `…` elsewhere.
**Fix:** Always use `…`.
**Done:** Page title uses **Extracting tags…**.

### [x] P2-3 · Brand name form - fixable
**Problem:** Title is `rive.ai`, aria label is `Rive`.
**Fix:** Pick one display name for UI chrome.
**Done:** Document title is **Rive** (matches sidebar aria).

### [x] P2-4 · PDF controls “Fit” / “Focus” - fixable
**Problem:** Labels are short and unclear without a tooltip.
**Fix:** Prefer **Fit width** / **Focus tag**.
**Done.**

### [x] P2-5 · “Engineering” repeated too often - fixable
**Problem:** Upload empty state says “engineering” three times nearby.
**Fix:** Say it once, then use drawings / P&IDs / tags.
**Done:** Empty upload copy simplified.

### [ ] P2-6 · Copy duplicated in two workspaces
**Problem:** Home and Version 4 each own the same strings → they drift.
**Fix:** Shared copy module both import.

---

## Glossary (keep these)

| Term | Meaning |
|------|---------|
| Review job | One upload → extract → review → export |
| Engineering tag | The ID being reviewed |
| Occurrence | One place that tag appears (document + page) |
| Needs review | Third decision (not approve, not reject) |
| Ready for review | Extraction done; human review pending |

---

## Progress

- Started: Aug 2, 2026
- Fixed: all items marked **fixable**
- Still open: P1-2, P2-6
- Deferred: P1-7 (prototype landing kept on purpose)


