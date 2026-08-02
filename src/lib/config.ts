/**
 * Local-dev only. Ignored in production builds.
 *
 * `true`  → skip OpenRouter and use mock data (saves tokens while testing)
 * `false` → OpenRouter first, mock only if the API fails
 *
 * Production always uses: OpenRouter → mock fallback.
 */
const USE_MOCK_DATA_IN_DEV = true

export const USE_MOCK_DATA = import.meta.env.DEV && USE_MOCK_DATA_IN_DEV
