// The editor's build and development server, and its unit tests.
//
// - The development server listens on 127.0.0.1 only, on BUILDER_PORT
//   (4900, the project's own; 4901 for the tests, which start their own),
//   and stops rather than take another port when that one is taken.
// - It passes /api and /rails/active_storage to the CMS at CMS_URL
//   (http://127.0.0.1:3900), keeping the Host the browser asked for, so the
//   editor and the API share one origin and need no CORS. The proxy exists
//   only here, in development: ../docs/decisions/editor-api-through-the-dev-proxy.md
//   says what that costs.
// - The schema's validator is compiled ahead of time (build/validator.ts),
//   the icon box's icons are read from schema/icons.svg (build/site-icons.ts),
//   the theme's header and footer from cms/config/site.yml for the browser's
//   storage (build/site-theme.ts),
//   the published page's stylesheets and the fonts are read from where the
//   repository keeps them (build/paths.ts, build/fonts.ts), and the built
//   bundle is checked before the build says it is done (build/bundle-check.ts).
// - The editor's page is never stored and the hashed files are kept a year,
//   on this server and on `vite preview` (build/serving.ts).
// - The storage is chosen when the editor is built (VITE_STORAGE, or the
//   demo's mode, build/demo.ts): the page loads that storage's entry point
//   (build/storage-entry.ts), so the one not chosen is not in the bundle,
//   which bundle-check holds each build to.
// - `--mode demo` builds the browser demo for GitHub Pages: the browser's
//   storage, the base /page-builder-cms/, and its own folder, dist-demo/.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { bundleCheck } from "./build/bundle-check.ts";
import { buildStorage, DEMO_BASE, DEMO_MODE, DEMO_OUT_DIR, demoLinkPreview } from "./build/demo.ts";
import { shellServing } from "./build/serving.ts";
import { storageEntry } from "./build/storage-entry.ts";
import { cmsPort } from "./e2e/harness/ports.ts";
import { fontAliases, fontLicences } from "./build/fonts.ts";
import { builderRoot, cmsFonts, cmsStylesheets, designFonts, exampleSite, schemaDir } from "./build/paths.ts";
import { siteIcons } from "./build/site-icons.ts";
import { siteTheme } from "./build/site-theme.ts";
import { documentValidator, validatorSource } from "./build/validator.ts";

const port = Number(process.env.BUILDER_PORT ?? 4900);
const cmsUrl = process.env.CMS_URL ?? "http://127.0.0.1:3900";
if (!Number.isInteger(port) || port <= 0) throw new Error(`BUILDER_PORT must be a port number, not "${process.env.BUILDER_PORT}"`);
// The preview and the live page open on the CMS itself, which is where
// the proxy sends /api: unless the build says otherwise (VITE_CMS_ORIGIN,
// or an absolute VITE_API_BASE, src/storage/config.ts), the editor links
// to the CMS_URL it was started with. Set before Vite reads the VITE_
// variables, which it does after loading this file.
const absoluteApi = /^https?:\/\//i.test(process.env.VITE_API_BASE?.trim() ?? "");
if (!process.env.VITE_CMS_ORIGIN?.trim() && !absoluteApi && process.env.CMS_URL) process.env.VITE_CMS_ORIGIN = new URL(cmsUrl).origin;

// changeOrigin false keeps the browser's Host (127.0.0.1:<port>): the CMS
// takes writes only from its own origin, which through this proxy is the
// editor's, and builds the upload address on that host, so the bytes come
// back through the proxy too.
const toCms = { target: cmsUrl, changeOrigin: false };

// Set before Vite reads the VITE_ variables, as above; the function runs
// before it does.
export default defineConfig(({ mode }) => {
  const demo = mode === DEMO_MODE;
  const storage = buildStorage(mode);
  return {
    base: demo ? DEMO_BASE : "/",
    plugins: [storageEntry(storage), react(), documentValidator(), siteIcons(), siteTheme(), fontLicences(), bundleCheck(storage), shellServing(), ...(demo ? [demoLinkPreview()] : [])],
    resolve: { alias: fontAliases() },
    // No fallback page: an address that is not a file is a 404, never the
    // editor's index answered for it.
    appType: "mpa",
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      proxy: {
        "^/api(/|$)": toCms,
        "^/rails/active_storage/": toCms,
      },
      fs: {
        // Only the folders outside builder/ the editor reads.
        strict: true,
        allow: [builderRoot, schemaDir, cmsStylesheets, cmsFonts, designFonts, exampleSite],
      },
    },
    // `vite preview` serves the build the same way, and takes server.proxy
    // as its own.
    preview: { host: "127.0.0.1", port, strictPort: true },
    optimizeDeps: {
      // The compiled validator imports ajv's runtime helpers from a virtual
      // module, which the dependency scan does not read. The text editor's
      // packages are imported only by the chunk loaded when a text is first
      // edited (src/editor/rich/): found then, they would be bundled anew and
      // the page told to reload, losing that first edit; named here, they are
      // bundled when the server starts.
      include: [
        ...validatorSource().runtimeModules.map((path) => `${path}.js`),
        "@tiptap/core", "@tiptap/extension-bold", "@tiptap/extension-document", "@tiptap/extension-hard-break", "@tiptap/extension-italic",
        "@tiptap/extension-link", "@tiptap/extension-list", "@tiptap/extension-paragraph", "@tiptap/extension-text",
        "@tiptap/extensions/undo-redo", "@tiptap/pm/history", "@tiptap/pm/model", "@tiptap/pm/state",
      ],
    },
    build: {
      outDir: demo ? DEMO_OUT_DIR : "dist",
      sourcemap: true,
    },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            // Pure tests run in Node; a test that needs a DOM says so in its
            // first line, `// @vitest-environment jsdom`.
            environment: "node",
            // Each test file runs in the one project its name says
            // (build/projects.test.ts holds every file to it).
            include: ["src/**/*.test.{ts,tsx}", "build/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
            exclude: ["**/*.rails.test.{ts,tsx}", "**/*.contract.test.{ts,tsx}"],
            setupFiles: ["test/setup-dom.ts"],
          },
        },
        {
          extends: true,
          // The render contract (*.contract.test.tsx) on React's production
          // build, JSX included: the development build checks every element
          // as it is made and is many times slower on the 500-block page,
          // and its JSX would call a jsxDEV the production build does not have.
          oxc: { jsx: { runtime: "automatic", development: false } },
          test: {
            name: "contract",
            environment: "node",
            env: { NODE_ENV: "production" },
            include: ["src/**/*.contract.test.{ts,tsx}", "test/**/*.contract.test.{ts,tsx}"],
          },
        },
        {
          extends: true,
          test: {
            name: "rails",
            // Suites that talk to a real CMS: e2e/harness starts one of
            // their own on E2E_CMS_PORT (3901), with its own databases and
            // storage, and deletes them afterwards.
            environment: "node",
            // A suite there that needs a browser's XMLHttpRequest (an
            // upload through @rails/activestorage) says
            // `// @vitest-environment jsdom`, and its document is on the
            // CMS's origin, so those requests are same-origin as the
            // editor's are through its proxy. jsdom takes a window's origin
            // when the window is made, so it is set here, not later.
            environmentOptions: { jsdom: { url: `http://127.0.0.1:${cmsPort()}/` } },
            // test/: the random-page agreement check, which reads the pages
            // the CMS serves and so sits outside the fence of src/.
            include: ["src/**/*.rails.test.{ts,tsx}", "test/**/*.rails.test.{ts,tsx}"],
            globalSetup: ["e2e/harness/vitest-rails.ts"],
            testTimeout: 30_000,
            hookTimeout: 30_000,
          },
        },
      ],
    },
  };
});
