I had a round 1 feedback review with the team and these are the feedback points that they shared that we need to fix:

1. Currently you have a sidebar with New job, the logo, completed jobs etc. This layout is exactly like a AI chat application layout like ChatGPT or Claude which is not what we want. Our product uses table format inside which we show the current review jobs and their current status, so try to follow the same.
   → Fix: Replace chat-style sidebar with a jobs table (name, status, progress, dates). Job detail becomes a separate page, not a sidebar thread list.
   → Done (v5): `/version5` is Review Jobs table; `/version5/jobs/:jobId` is job-only (title + workflow). No left sidebar / Back / New job chrome inside a job — leave via the logo to the jobs table.

2. User should be able to say work on 100 documents review, pause and save their work, then come back later with their progress auto saved. Progress should not be lost. Currently it feels like the user cannot proceed unless they mark everything as complete. (i am not quite agreeing with this feedback though)
   → Fix: Make review statuses optional mid-session; auto-save drafts and allow leaving/resuming anytime. Soften “must complete all” UX (disable hard gates; show progress as informational). Your disagreement is fair if auto-save already works—then clarify in UI that leaving mid-review is fine.
   → Done (v5): No “Mark as complete”. Mid-review Export lives in Summary dialog footer (not on the review canvas). Job auto-completes when every occurrence has a decision; leave/resume anytime with progress saved.

3. Whatever you design, always remember to test it with large scale of documents. say 100s of documents maybe. your design choice should be a scalable solution.
   → Fix: Virtualize lists/tables, paginate or window tags/docs, avoid loading all PDFs at once, profile with ~100–500 doc fixtures.

4. Option for bulk approval and bulk rejection can also be thought of.
   → Fix: Add multi-select + bulk Approve/Reject (and maybe Needs review) on the tags table; confirm before applying.

5. This is the most critical feedback that we should first fix: Document view should be the primary view for the user. Currently the user have to click view eye icon every single time to open the document. User should only spend probably one or two secs max to review a tag occurence.
   → Fix (P0): Document is the center workspace. Land on first page of first doc with highlights. Show a decision bubble on the active highlight (Approve / Needs review / Reject). Deciding advances the chain. No permanent progress chrome — open Summary for a full progress overview + Export.
   → Done (v5): Document-canvas review mode — PDF fills the workspace; floating decision bubble (A/R/N + Enter); Summary button opens a large dialog (counts, occurrence table, Export in footer).
