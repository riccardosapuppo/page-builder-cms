// The browser demo's build (`vite build --mode demo`, npm run build:demo):
// the editor on the browser's storage. GitHub Pages serves a repository's
// project site under its name, the default base; a host of its own serves
// it at its root, DEMO_BASE=/ in the environment of the build, of
// serve:demo and of e2e:demo. Its own folder, so the editor's build in
// dist/ is never replaced by it.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HtmlTagDescriptor, Plugin } from "vite";
import { storageKind, type StorageKind } from "../src/storage/config.ts";
import { repoRoot } from "./paths.ts";

export const DEMO_MODE = "demo";
export const DEMO_PAGES_BASE = "/page-builder-cms/";
export const DEMO_OUT_DIR = "dist-demo";

// The path the demo is served under: DEMO_BASE, a path that starts and
// ends with a slash ("/", "/page-builder-cms/"), or the Pages path.
export function demoBase(env: NodeJS.ProcessEnv = process.env): string {
  const asked = env.DEMO_BASE?.trim();
  if (!asked) return DEMO_PAGES_BASE;
  if (!/^\/(?:[a-z0-9][a-z0-9._-]*\/)*$/.test(asked)) {
    throw new Error(`DEMO_BASE must be a path that starts and ends with "/", such as "/" or "${DEMO_PAGES_BASE}", not "${asked}"`);
  }
  return asked;
}

export const DEMO_BASE = demoBase();

// The address a link to the demo is shared by: its own host. The copy on
// GitHub Pages, a mirror no page links to, names it too.
export const DEMO_SITE = "https://builder.riccardosapuppo.com/";

// The picture a shared link previews with: the editor on the example site,
// which `npm run shots` makes with the README's pictures
// (docs/images/demo-preview.png, ../../tools/lib/shot-images.ts), at the
// size and shape the sites that draw previews ask for (1.91 to 1). The
// demo's build puts it at its root under a name of its own, unhashed, so
// the tags' address stays the same from one build to the next.
export const DEMO_PREVIEW = {
  file: "preview.png",
  source: join(repoRoot, "docs", "images", "demo-preview.png"),
  width: 1200,
  height: 627,
  alt: "The Page Builder CMS editor with the home page of Slack Water, an invented swimming club, on its canvas",
} as const;

export const DEMO_DESCRIPTION = "Try a page builder in your browser: build a page from sections, columns and eighteen kinds of block, then preview and publish it, all kept in this browser.";

// The picture's fingerprint, the first 12 hex digits of its SHA-256, which
// its address carries (?v=): a site that keeps link previews by address
// (LinkedIn keeps them for weeks) sees a new picture as a new address. null
// before there is one.
export function previewVersion(source: string = DEMO_PREVIEW.source): string | null {
  return existsSync(source) ? createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 12) : null;
}

// The tags a shared link's preview is read from: Open Graph's, the
// description beside them, and the card's size for the sites that read
// Twitter's. Every address is absolute: those sites resolve none.
export function linkPreviewTags(site: string = DEMO_SITE, version: string | null = previewVersion()): Array<Record<string, string>> {
  return [
    { name: "description", content: DEMO_DESCRIPTION },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Page Builder CMS" },
    { property: "og:title", content: "Page Builder CMS" },
    { property: "og:description", content: DEMO_DESCRIPTION },
    { property: "og:url", content: site },
    { property: "og:image", content: `${new URL(DEMO_PREVIEW.file, site).href}${version === null ? "" : `?v=${version}`}` },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: String(DEMO_PREVIEW.width) },
    { property: "og:image:height", content: String(DEMO_PREVIEW.height) },
    { property: "og:image:alt", content: DEMO_PREVIEW.alt },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

// The demo's page carries the tags, and its root the picture. Without the
// picture (`npm run shots` builds the demo to make it, before there is
// one) the build says so and goes on: build/demo.test.ts and the serving
// check fail on a demo that lacks it.
export function demoLinkPreview(): Plugin {
  return {
    name: "page-builder-cms:demo-link-preview",
    transformIndexHtml: (): HtmlTagDescriptor[] => linkPreviewTags().map((attrs) => ({ tag: "meta", attrs, injectTo: "head" })),
    generateBundle() {
      if (!existsSync(DEMO_PREVIEW.source)) {
        this.warn(`no ${DEMO_PREVIEW.file} at the demo's root: ${DEMO_PREVIEW.source} is not there yet (npm run shots makes it)`);
        return;
      }
      this.emitFile({ type: "asset", fileName: DEMO_PREVIEW.file, source: readFileSync(DEMO_PREVIEW.source) });
    },
  };
}

// The storage a build keeps its pages in, from VITE_STORAGE and the mode,
// written back into the environment trimmed, so the editor's entry point
// can compare it as it is (src/main.tsx). The demo has no CMS: asked for
// one, it is a mistake in the build's settings, said at once.
export function buildStorage(mode: string, env: NodeJS.ProcessEnv = process.env): StorageKind {
  const asked = env.VITE_STORAGE?.trim();
  if (mode === DEMO_MODE && asked && asked !== "browser") {
    throw new Error(`the demo keeps its pages in the browser: VITE_STORAGE must be browser or unset with --mode ${DEMO_MODE}, not "${asked}"`);
  }
  const storage = mode === DEMO_MODE ? "browser" : storageKind({ VITE_STORAGE: asked });
  env.VITE_STORAGE = storage;
  return storage;
}
