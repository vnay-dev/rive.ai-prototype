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

### [ ] P0-1 · “Flag” vs “Needs review”
**Problem:** Onboarding says “flag tags.” The button says “Needs review.”
**Why it matters:** Users learn the wrong word, then can’t find that action.
**Fix:** Use **Needs review** everywhere (button, preview, docs). Drop “flag.”

### [ ] P0-2 · Two names for the same job status
**Problem:** Sidebar says “Ready for review.” Job details say “In Review.” Same state.
**Why it matters:** Status looks broken or out of sync.
**Fix:** Use **Ready for review** in both places.

### [ ] P0-3 · Fake-sounding extraction messages
**Problem:** Status rotates through lines like “Validating…” and “Matching…” on a timer — not real steps.
**Why it matters:** Engineers stop trusting the AI progress text.
**Fix:** Only show real progress (e.g. “Reading documents 2/5”, “Extracting tags…”).

### [ ] P0-4 · Vague error messages
**Problem:** Failures say “Review failed. Try again.” or show raw API text.
**Why it matters:** Users don’t know what went wrong or what to do next.
**Fix:** Short human reason + one clear next step.

### [ ] P0-5 · Upload subtitle is marketing, not help
**Problem:** “Turn drawings into trusted, searchable data with AI-assisted…”
**Why it matters:** User already started a job. They need what to upload next, not a pitch.
**Fix:** Something like: “Add P&IDs or PDFs, then extract tags for review.”

---

## P1 — Consistency

### [ ] P1-1 · Occurrence vs match
**Problem:** UI mixes “occurrence,” “match,” and “tag occurrence.”
**Fix:** One glossary — **tag** → **occurrence** (page hit). Use “match” only if needed for multi-hits on one page, and keep it consistent.

### [ ] P1-2 · Home and Version 4 say different things when complete
**Problem:** Completion sentences don’t match between workspaces.
**Fix:** One shared completion sentence for both.

### [ ] P1-3 · “Review results” while still reviewing
**Problem:** Title sounds finished while the user is still deciding.
**Fix:** Call the active step **Review tags** (or **Review**). Use **Review summary** only when done.

### [ ] P1-4 · Empty states are unclear
**Problem:** Lines like “No validated findings to summarise” don’t help.
**Fix:** Say what happened and what to do next in plain words.

### [ ] P1-5 · British spelling in one place
**Problem:** “summarise” while the rest of the app is US English.
**Fix:** Use **summarize** (en-US) everywhere.

### [ ] P1-6 · Dialog button tone mixes casual and formal
**Problem:** “No, skip” / “Yes, upload” next to formal “Cancel” / “Delete.”
**Fix:** Align to calm, direct labels (e.g. **Skip** / **Upload anyway**).

### [ ] P1-7 · Home page is prototype language
**Problem:** `/` says “Prototype versions” and designer notes.
**Fix:** Hide from real users, or send `/` to the main workspace.

---

## P2 — Polish

### [ ] P2-1 · Title Case vs sentence case
**Problem:** “Last Updated,” “Tags Extracted” vs “Extract tags,” “Review jobs.”
**Fix:** Sentence case for labels: **Last updated**, **Tags extracted**.

### [ ] P2-2 · Mixed ellipsis style
**Problem:** `...` in one title, `…` elsewhere.
**Fix:** Always use `…`.

### [ ] P2-3 · Brand name form
**Problem:** Title is `rive.ai`, aria label is `Rive`.
**Fix:** Pick one display name for UI chrome.

### [ ] P2-4 · PDF controls “Fit” / “Focus”
**Problem:** Labels are short and unclear without a tooltip.
**Fix:** Prefer **Fit width** / **Focus tag**.

### [ ] P2-5 · “Engineering” repeated too often
**Problem:** Upload empty state says “engineering” three times nearby.
**Fix:** Say it once, then use drawings / P&IDs / tags.

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
- Next up: **P0-1** (not started — waiting)
