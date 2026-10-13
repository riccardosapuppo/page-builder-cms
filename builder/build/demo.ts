// The browser demo's build (`vite build --mode demo`, npm run build:demo):
// the editor on the browser's storage. GitHub Pages serves a repository's
// project site under its name, the default base; a host of its own serves
// it at its root, DEMO_BASE=/ in the environment of the build, of
// serve:demo and of e2e:demo. Its own folder, so the editor's build in
// dist/ is never replaced by it.
import { storageKind, type StorageKind } from "../src/storage/config.ts";

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
