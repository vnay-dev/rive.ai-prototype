const blobBaseUrl = (import.meta.env.VITE_BLOB_BASE_URL as string | undefined)?.trim() ?? ""
const normalizedBlobBaseUrl = blobBaseUrl.replace(/\/+$/, "")

/** Resolve a public asset path from Vercel Blob when configured, else local `/public`. */
export function getPublicAssetUrl(assetPath: string) {
  const normalizedPath = assetPath.replace(/^\/+/, "")

  if (!normalizedBlobBaseUrl) {
    return `/${normalizedPath}`
  }

  return `${normalizedBlobBaseUrl}/${normalizedPath}`
}
