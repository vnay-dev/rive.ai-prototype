# AGENTS.md

## Project

Enterprise AI application for reviewing engineering documents (P&IDs, drawings, PDFs). AI extracts engineering tags, engineers validate them before exporting.

## Core Workflow

Review Job
→ Upload Documents
→ Extract Tags
→ Review
→ Summary
→ Export

## UX Principles

- Enterprise-first, minimal, trustworthy.
- Optimize for speed with large datasets.
- AI assists. Humans make final decisions.
- Prefer clarity over cleverness.
- Avoid unnecessary steps and visual noise.

## Review Experience

- Primary entity is the engineering tag.
- Each tag groups all matching document occurrences.
- Users review, approve, reject, or mark tags as needs review.
- PDF viewer opens in a right drawer with highlighted occurrences.
- Review state is auto-saved.

## Visual Direction

- Clean enterprise UI inspired by Linear, GitHub and Stripe.
- Neutral palette with a blue accent.
- Consistent spacing and typography.
- Dense but readable layouts.

## Code

- Build reusable, composable components.
- Prefer accessibility and keyboard support.
- Keep components small and scalable.
- Avoid hardcoded values where possible.