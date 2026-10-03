// Where the editor finds the CMS. Both are read when the editor is built.
//
// - VITE_API_BASE, the API, defaults to /api: on the editor's own origin,
//   which the development server passes to the CMS (vite.config.ts). An
//   absolute address (https://cms.example/api) sends the editor's requests
//   to that server directly, which must then answer this origin's CORS
//   preflight: ../docs/decisions/editor-api-through-the-dev-proxy.md.
// - VITE_CMS_ORIGIN, the CMS's own origin, where a person opens the pages
//   it serves: the draft's preview and the live page. Those are pages, not
//   API calls, so they open on the CMS itself, never through the editor's
//   proxy. It defaults to the origin of an absolute API base, else to
//   http://127.0.0.1:3900, where `npm start` runs the CMS; the development
//   server sets it from CMS_URL when it is not given:
//   ../docs/decisions/editor-links-to-the-cms-origin.md.
export const DEFAULT_API_BASE = "/api";
export const DEFAULT_CMS_ORIGIN = "http://127.0.0.1:3900";

type Env = { VITE_API_BASE?: string | undefined; VITE_CMS_ORIGIN?: string | undefined };

export function apiBase(env: Env = import.meta.env): string {
  const configured = env.VITE_API_BASE?.trim();
  // A trailing slash would double the one every path starts with.
  return (configured ? configured : DEFAULT_API_BASE).replace(/\/+$/, "");
}

// The origin alone (scheme, host, port), whatever path the setting carries.
// A value that is not an http(s) address is a mistake in the build's
// settings, said at once rather than turned into links that go nowhere.
export function cmsOrigin(env: Env = import.meta.env): string {
  const configured = env.VITE_CMS_ORIGIN?.trim();
  if (configured) return originOf(configured, "VITE_CMS_ORIGIN");
  const api = apiBase(env);
  if (/^https?:\/\//i.test(api)) return originOf(api, "VITE_API_BASE");
  return DEFAULT_CMS_ORIGIN;
}

function originOf(address: string, name: string): string {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Error(`${name} must be an http or https address, not "${address}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${name} must be an http or https address, not "${address}"`);
  return url.origin;
}

// A path the CMS gives (links.preview, links.live: "/preview/12",
// "/winter-series") as an address on the CMS's origin.
export function cmsAddress(path: string, origin: string = cmsOrigin()): string {
  return new URL(path, `${origin}/`).href;
}
