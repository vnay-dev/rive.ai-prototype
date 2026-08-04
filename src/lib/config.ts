/**
 * Local-dev only. Ignored in production builds.
 *
 * `true`  → skip OpenRouter; use fixture tags for generated P&IDs, else PDF text
 * `false` → OpenRouter first; on failure, fall back to local text extraction
 *
 * Fixture / local tags must exist in the PDF text layer so highlights work.
 */
const USE_MOCK_DATA_IN_DEV = true

export const USE_MOCK_DATA = import.meta.env.DEV && USE_MOCK_DATA_IN_DEV
