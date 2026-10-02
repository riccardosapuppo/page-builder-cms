// Where the editor finds the CMS's API. VITE_API_BASE, read when the editor
// is built, defaults to /api: on the editor's own origin, which the
// development server passes to the CMS (vite.config.ts). An absolute
// address (https://cms.example/api) sends the editor's requests to that
// server directly, which must then answer this origin's CORS preflight:
// ../docs/decisions/editor-api-through-the-dev-proxy.md.
export const DEFAULT_API_BASE = "/api";

export function apiBase(env: { VITE_API_BASE?: string | undefined } = import.meta.env): string {
  const configured = env.VITE_API_BASE?.trim();
  // A trailing slash would double the one every path starts with.
  return (configured ? configured : DEFAULT_API_BASE).replace(/\/+$/, "");
}
