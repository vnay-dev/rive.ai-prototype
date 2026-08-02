/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BLOB_BASE_URL?: string
  readonly VITE_OPEN_ROUTER_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
