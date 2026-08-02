const DEFAULT_BLOB_BASE_URL = "https://cc69j6usle9t0ikq.public.blob.vercel-storage.com"

const blobBaseUrl =
  (import.meta.env.VITE_BLOB_BASE_URL as string | undefined)?.trim() || DEFAULT_BLOB_BASE_URL
const normalizedBlobBaseUrl = blobBaseUrl.replace(/\/+$/, "")

/** Resolve a public asset path from Vercel Blob. */
export function getPublicAssetUrl(assetPath: string) {
  const normalizedPath = assetPath.replace(/^\/+/, "")
  return `${normalizedBlobBaseUrl}/${normalizedPath}`
}
