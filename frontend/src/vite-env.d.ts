/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional absolute API origin for split deployments (e.g. https://api.example.com).
   * Unset = same-origin relative /api/v1 (dev proxy or reverse proxy). */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
