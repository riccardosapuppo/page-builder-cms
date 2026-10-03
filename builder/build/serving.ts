// How Vite's own servers send the editor's shell (rule 27 of the project's
// prompt; check:serving, e2e/serving/check-serving.ts, holds them to it):
// - the editor's page (its index.html) is never stored and never
//   revalidated: "no-store, no-cache, must-revalidate, max-age=0", with no
//   ETag and no Last-Modified, and a conditional request gets the page, not
//   a 304, so an old page can never come back from a cache;
// - the built files under assets/, whose names carry their content's
//   hash, are kept for a year: "public, max-age=31536000, immutable", but
//   only when they are there (a 404 is not kept);
// - an address that names no file stays a 404 (appType "mpa" in
//   vite.config.ts: there is no fallback page).
// The development server (`vite`, what npm start runs) and `vite preview`
// (the build) both take these. The browser demo of stage 6 is served by
// GitHub Pages, where headers cannot be set: there, the index's own line
// unregistering service workers (index.html) is what stands.
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

export const PAGE_CACHE = "no-store, no-cache, must-revalidate, max-age=0";
export const ASSET_CACHE = "public, max-age=31536000, immutable";

// What a request asks for, by its path under the editor's base: the page,
// a fingerprinted built file (only `vite preview` serves those), or
// something else, left as Vite sends it.
export function servingKind(url: string, base: string, built: boolean): "page" | "asset" | null {
  const path = (url.split(/[?#]/, 1)[0] ?? "/");
  if (!path.startsWith(base)) return null;
  const inner = path.slice(base.length);
  if (inner === "" || inner.endsWith("/") || inner.endsWith(".html")) return "page";
  if (built && inner.startsWith("assets/")) return "asset";
  return null;
}

const VALIDATORS = new Set(["etag", "last-modified"]);

// The middleware: it rewrites the headers whoever answers sets, at the
// moment they are written, so it holds for every way Vite sends a file.
export function shellHeaders(base: string, built: boolean): Connect.NextHandleFunction {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const kind = servingKind(req.url ?? "/", base, built);
    if (kind === null) return next();
    if (kind === "page") {
      // No 304 for the page, whatever the browser remembers.
      delete req.headers["if-none-match"];
      delete req.headers["if-modified-since"];
    }
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name: string, value: number | string | readonly string[]) => {
      const key = name.toLowerCase();
      if (kind === "page" && VALIDATORS.has(key)) return res;
      if (kind === "page" && key === "cache-control") return setHeader(name, PAGE_CACHE);
      return setHeader(name, value);
    };
    const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => ServerResponse;
    res.writeHead = ((status: number, ...rest: unknown[]) => {
      const headers = rest.find((arg): arg is OutgoingHttpHeaders => typeof arg === "object" && arg !== null && !Array.isArray(arg));
      const set = (name: string, value: string) => {
        if (headers) {
          for (const key of Object.keys(headers)) if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
          headers[name] = value;
        } else {
          setHeader(name, value);
        }
      };
      if (kind === "page") {
        if (headers) for (const key of Object.keys(headers)) if (VALIDATORS.has(key.toLowerCase())) delete headers[key];
        for (const name of ["ETag", "Last-Modified"]) res.removeHeader(name);
        set("Cache-Control", PAGE_CACHE);
      } else if (status === 200) {
        set("Cache-Control", ASSET_CACHE);
      }
      return writeHead(status, ...rest);
    }) as ServerResponse["writeHead"];
    if (kind === "page") setHeader("Cache-Control", PAGE_CACHE);
    next();
  };
}

export function shellServing(): Plugin {
  let base = "/";
  return {
    name: "page-builder-cms:shell-serving",
    configResolved(config) {
      base = config.base;
    },
    // Before Vite's own middlewares, so every answer passes through it.
    configureServer(server) {
      server.middlewares.use(shellHeaders(base, false));
    },
    configurePreviewServer(server) {
      server.middlewares.use(shellHeaders(base, true));
    },
  };
}
