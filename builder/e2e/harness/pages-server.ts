// A server that serves built sites the way GitHub Pages serves a project's
// site, for the browser demo: its serving check (../serving/check-serving.ts),
// its story (../demo/), and a person trying the build (npm run serve:demo).
// On 127.0.0.1 alone, in this process.
//
// What it copies from Pages, which the demo cannot change there:
// - each site under its own path (/page-builder-cms/), several on one
//   origin, as projects share <user>.github.io; anything outside them is
//   a 404;
// - a folder's address without its slash is moved to it (301), and a
//   folder answers its index.html; the query is no part of a file's name;
// - a missing file is a 404 with the server's own page, never the site's
//   index: Pages has no fallback but a 404.html of the site's, which it
//   then serves with the 404, and the demo has none;
// - the same headers on every file, which a site cannot set: a ten-minute
//   Cache-Control, an ETag and a Last-Modified, and a 304 for a request
//   that sends either back.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { CouldNotRun, listeners } from "../../../tools/lib/processes.ts";

export const PAGES_CACHE = "max-age=600";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const NOT_FOUND = "<!doctype html><title>Page not found</title><h1>404</h1><p>File not found</p>";

export interface PagesServer {
  url: string;
  port: number;
  // Stops the server, shows the port closed, and says so. Throws if it is
  // not.
  stop(): Promise<string[]>;
}

// The file a path names inside a site's folder, or null when it names
// none: outside the folder, or not there.
function fileOf(folder: string, inner: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(inner);
  } catch {
    return null;
  }
  const path = normalize(join(folder, decoded));
  if (path !== folder && !path.startsWith(folder.endsWith(sep) ? folder : folder + sep)) return null;
  return existsSync(path) ? path : null;
}

function send(req: IncomingMessage, res: ServerResponse, status: number, file: string): void {
  const stat = statSync(file);
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const modified = new Date(Math.floor(stat.mtimeMs / 1000) * 1000).toUTCString();
  const headers = { "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream", "Cache-Control": PAGES_CACHE, ETag: etag, "Last-Modified": modified };
  const since = req.headers["if-modified-since"];
  if (status === 200 && (req.headers["if-none-match"] === etag || (since !== undefined && Date.parse(since) >= Date.parse(modified)))) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  res.writeHead(status, { ...headers, "Content-Length": stat.size });
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}

// sites: each path ("/page-builder-cms/") and the folder it serves.
export async function startPagesServer(port: number, sites: Readonly<Record<string, string>>): Promise<PagesServer> {
  const taken = listeners(port);
  if (taken.length > 0) throw new CouldNotRun(`port ${port}, for the Pages-like server, is already taken by ${taken.map((l) => `${l.address} (process ${l.pid})`).join(", ")}: nothing was started`);
  const mounts = Object.entries(sites).map(([base, folder]) => ({ base, folder: normalize(folder) }));

  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split(/[?#]/, 1)[0] ?? "/";
    const missing = (folder: string | null) => {
      const own = folder ? fileOf(folder, "404.html") : null;
      if (own) return send(req, res, 404, own);
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": PAGES_CACHE });
      res.end(NOT_FOUND);
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    const mount = mounts.find((m) => path === m.base.slice(0, -1) || path.startsWith(m.base));
    if (!mount) return missing(null);
    if (path === mount.base.slice(0, -1)) {
      res.writeHead(301, { Location: mount.base, "Cache-Control": PAGES_CACHE });
      res.end();
      return;
    }
    const file = fileOf(mount.folder, path.slice(mount.base.length));
    if (!file) return missing(mount.folder);
    if (statSync(file).isDirectory()) {
      if (!path.endsWith("/")) {
        res.writeHead(301, { Location: `${path}/`, "Cache-Control": PAGES_CACHE });
        res.end();
        return;
      }
      const index = fileOf(file, "index.html");
      return index ? send(req, res, 200, index) : missing(mount.folder);
    }
    return send(req, res, 200, file);
  });

  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => done());
  });
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    port,
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      const still = listeners(port);
      if (still.length > 0) throw new Error(`the Pages-like server stopped, but port ${port} is still held by ${still.map((l) => `${l.address} (process ${l.pid})`).join(", ")}`);
      return [`the Pages-like server: stopped`, `the Pages-like server: nothing listens on ${port}`];
    },
  };
}
