// The editor's page is never stored and never answered with a 304; a
// hashed built file is kept a year, unless it is missing; nothing else is
// touched. The middleware is driven as Vite's servers drive it: headers set
// one by one (the development server's index), or all at once in
// writeHead (sirv, which `vite preview` serves files with).
// @vitest-environment node
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { ASSET_CACHE, PAGE_CACHE, servingKind, shellHeaders } from "./serving.ts";

test("the page, the built files and the rest, by path under the base", () => {
  expect(servingKind("/", "/", false)).toBe("page");
  expect(servingKind("/?page=3", "/", false)).toBe("page");
  expect(servingKind("/index.html", "/", true)).toBe("page");
  expect(servingKind("/assets/index-abc123.js", "/", true)).toBe("asset");
  // The development server's files carry no hash: left alone.
  expect(servingKind("/assets/index-abc123.js", "/", false)).toBeNull();
  expect(servingKind("/src/main.tsx", "/", false)).toBeNull();
  expect(servingKind("/api/pages", "/", false)).toBeNull();
  expect(servingKind("/page-builder-cms/", "/page-builder-cms/", true)).toBe("page");
  expect(servingKind("/page-builder-cms/assets/a-1.css", "/page-builder-cms/", true)).toBe("asset");
  expect(servingKind("/other/", "/page-builder-cms/", true)).toBeNull();
});

// A response that records what is written on it.
function exchange(url: string, requestHeaders: Record<string, string> = {}) {
  const set = new Map<string, unknown>();
  const written: { status: number; headers: OutgoingHttpHeaders | null } = { status: 0, headers: null };
  const req = { url, headers: { ...requestHeaders } } as unknown as IncomingMessage;
  const res = {
    setHeader(name: string, value: unknown) {
      set.set(name.toLowerCase(), value);
      return res;
    },
    removeHeader(name: string) {
      set.delete(name.toLowerCase());
    },
    writeHead(status: number, headers?: OutgoingHttpHeaders) {
      written.status = status;
      written.headers = headers ?? null;
      return res;
    },
  } as unknown as ServerResponse;
  return { req, res, set, written };
}

test("the development server's index: set one by one, the validators are dropped and the conditional headers ignored", () => {
  const { req, res, set } = exchange("/", { "if-none-match": 'W/"12-abc"', "if-modified-since": "Sat, 03 Oct 2026 08:00:00 GMT" });
  let passed = false;
  shellHeaders("/", false)(req, res, () => { passed = true; });
  expect(passed).toBe(true);
  expect(req.headers["if-none-match"]).toBeUndefined();
  expect(req.headers["if-modified-since"]).toBeUndefined();
  // What Vite's send() does next.
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Etag", 'W/"12-abc"');
  expect(Object.fromEntries(set)).toEqual({ "cache-control": PAGE_CACHE, "content-type": "text/html" });
});

test("vite preview's files: written at once, the page loses its validators and a hashed file is kept a year, unless it is a 404", () => {
  const page = exchange("/index.html");
  shellHeaders("/", true)(page.req, page.res, () => {});
  page.res.writeHead(200, { "Content-Type": "text/html", ETag: 'W/"1-2"', "Last-Modified": "Sat, 03 Oct 2026 08:00:00 GMT" });
  expect(page.written.headers).toEqual({ "Content-Type": "text/html", "Cache-Control": PAGE_CACHE });

  const asset = exchange("/assets/index-abc123.js");
  shellHeaders("/", true)(asset.req, asset.res, () => {});
  asset.res.writeHead(200, { "Content-Type": "text/javascript", ETag: 'W/"1-2"' });
  expect(asset.written.headers).toEqual({ "Content-Type": "text/javascript", ETag: 'W/"1-2"', "Cache-Control": ASSET_CACHE });

  const missing = exchange("/assets/gone-0.js");
  shellHeaders("/", true)(missing.req, missing.res, () => {});
  missing.res.writeHead(404, { "Content-Type": "text/plain" });
  expect(missing.written.headers).toEqual({ "Content-Type": "text/plain" });

  const other = exchange("/favicon.svg");
  shellHeaders("/", true)(other.req, other.res, () => {});
  other.res.writeHead(200, { ETag: 'W/"1-2"' });
  expect(other.written.headers).toEqual({ ETag: 'W/"1-2"' });
});
