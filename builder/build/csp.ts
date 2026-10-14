// The editor's Content-Security-Policy, written into the page of every
// build (the browser demo, and the build `vite preview` serves) as the
// first element of its head, so that it holds for everything the page
// loads after it. Static hosts such as GitHub Pages set no headers; a
// meta tag is what every host serves.
//
// Its point is the Assistant's (src/assistant/README.md): a key a visitor
// pastes can go to the visitor's provider and nowhere else, whatever runs
// on the page. connect-src names this site and the two providers' APIs
// only; scripts come from this site alone, the page's one inline script
// allowed by its hash; nothing is embedded but the video and map players
// the renderers allow (src/render/frames.ts, FRAME_ORIGINS, the published
// pages' own list). Styles may be inline: React writes style attributes
// and the canvas a <style> of the page's own colours.
//
// A build for a CMS on another origin (an absolute VITE_API_BASE,
// src/storage/config.ts) connects there too, and shows its library's
// images and files from there.
//
// The development server (`vite`, what npm start runs) has none: its hot
// reload needs inline scripts of its own.
import { createHash } from "node:crypto";
import type { Plugin } from "vite";
import { FRAME_ORIGINS } from "../src/render/frames.ts";

export const PROVIDER_ORIGINS = ["https://api.anthropic.com", "https://api.openai.com"] as const;

// The inline scripts of a page: what stands between <script> and
// </script> where the tag has no src.
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((found) => found[1]!).filter((body) => body.trim() !== "");
}

// The origin of an absolute API base, or null for one on the editor's own
// origin (/api, the default).
export function apiOrigin(apiBase: string | undefined): string | null {
  const base = apiBase?.trim();
  return base && /^https?:\/\//i.test(base) ? new URL(base).origin : null;
}

const hash = (script: string): string => `'sha256-${createHash("sha256").update(script, "utf8").digest("base64")}'`;

export function editorPolicy(scripts: readonly string[], api: string | null = null): string {
  const cms = api === null ? "" : ` ${api}`;
  return [
    "default-src 'self'",
    ["script-src 'self'", ...scripts.map(hash)].join(" "),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${cms}`,
    "font-src 'self' data:",
    `connect-src 'self' blob: ${PROVIDER_ORIGINS.join(" ")}${cms}`,
    `media-src 'self' blob:${cms}`,
    `frame-src ${FRAME_ORIGINS.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

// The page with its policy, first in its head.
export function withPolicy(html: string, api: string | null = null): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${editorPolicy(inlineScripts(html), api)}">`;
  return html.replace(/<head>/i, `<head>\n    ${meta}`);
}

export function editorCsp(apiBase: string | undefined = process.env.VITE_API_BASE): Plugin {
  const api = apiOrigin(apiBase);
  return {
    name: "editor-csp",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => withPolicy(html, api) },
  };
}
