# builder/

The editor of Page Builder CMS: a React 19 and TypeScript app, built with
Vite, that builds pages and saves them to the CMS (`../cms/`) through its
JSON API. It is a package of its own, with its own `package.json` and
lockfile.

**Stage 2 has just begun.** What is here is the foundation the editor is
built on: the pinned toolchain, the source layout, the document's types
and its validator, the published page's CSS and fonts, the fence around the
code that talks to the server, and the test harness with its first probe.
The editor's interface is not written yet: `npm run dev` shows a
placeholder page.

## Before you start

- **Node** `^22.13.0 || ^24.0.0 || >=26.0.0` (`engines`, the narrowest of
  the toolchain's: Vitest 5's), and npm.
- For `npm run test:rails` and `npm run e2e` only: **Ruby** on the PATH and
  the CMS's gems installed ([../cms/README.md](../cms/README.md)), and for
  `npm run e2e` Playwright 1.62.1's Chromium (revision 1234) in
  Playwright's cache. These tests start a CMS of their own; nothing needs
  to be running.

## Commands

From this folder:

```
npm ci
npm run dev
npm run typecheck
npm run lint
npm run lint:plants
npm test
npm run test:contract
npm run test:rails
npm run e2e
npm run build
npm run preview
```

From the repository's root, the same through `npm run builder:install`,
`builder:typecheck`, `builder:lint`, `builder:test`, `builder:build`,
`builder:test:rails` and `builder:e2e`.

| Command | What it does |
| --- | --- |
| `npm run dev` | The development server, on 127.0.0.1 only, port `BUILDER_PORT` (4900); it stops rather than take another port. `/api` and `/rails/active_storage` go to the CMS at `CMS_URL` (`http://127.0.0.1:3900`), keeping the Host: [../docs/decisions/editor-api-through-the-dev-proxy.md](../docs/decisions/editor-api-through-the-dev-proxy.md) says why and what it costs. An address that is no file is a 404. |
| `npm run typecheck` | `tsc` three times: the code that ships (`src/` without tests, no Node types), the tests, and what runs in Node (`vite.config.ts`, `build/`, `e2e/`). Strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. |
| `npm run lint` | Oxlint, the default rules plus the fence below. It prints how many files it read. |
| `npm run lint:plants` | Shows the fence firing: `build/lint-fence.test.ts`. |
| `npm test` | Vitest, the "unit" project (pure tests in Node, tests marked `// @vitest-environment jsdom` in jsdom with only a `ResizeObserver` stub, `test/setup-dom.ts`), then the "contract" project. |
| `npm run test:contract` | Vitest, the "contract" project alone (`*.contract.test.tsx`): the render contract, on React's production build ([src/render/README.md](src/render/README.md)). |
| `npm run test:rails` | Vitest, the "rails" project (`*.rails.test.ts` in `src/`, `*.rails.test.tsx` in `test/`), against a CMS the run starts for itself on `E2E_CMS_PORT` (3901): the storage battery on the Rails adapter ([src/storage/README.md](src/storage/README.md)); the rule-9 check (`RULE9_RUNS`, 60, and `RULE9_SEED`); the renderer's twins against the CMS's Ruby; the canvas's layout against the CMS's pages in headless Chromium. Needs Ruby on the PATH and Playwright's Chromium. |
| `npm run e2e` | Playwright, Chromium headless, against a CMS and a development server the run starts for itself on `E2E_CMS_PORT` (3901) and `E2E_BUILDER_PORT` (4901). |
| `npm run build` | The bundle in `dist/`, then its check (below). |
| `npm run preview` | Serves `dist/` on 127.0.0.1, port `BUILDER_PORT`, with the same proxy as `npm run dev`. |

`VITE_API_BASE`, read at build time, is where the editor finds the API:
`/api` by default. An absolute address needs that server to allow the
editor's origin by CORS (the decision note above).

## Where things are

| Folder | What goes there |
| --- | --- |
| [`src/shared/`](src/shared/README.md) | What comes from the rest of the repository: the document's types, the validator, the published page's CSS, the editor's font. Every other folder imports from here. |
| [`src/document/`](src/document/README.md) | The tree, the commands with their inverses, the reducer, migrations: pure functions. |
| [`src/store/`](src/store/README.md) | The vanilla zustand store that runs the reducer, the selection, the history. |
| [`src/widgets/<widget>/`](src/widgets/README.md) | Each widget's definition, renderer and icon; its panel and accessibility test come with the interface. `registry.ts` lists them. |
| [`src/storage/`](src/storage/README.md) | The storage adapter, the only code that talks to a server. |
| [`src/render/`](src/render/README.md) | The React renderer, held to the server's by the render contract. |
| [`src/editor/`](src/editor/README.md) | The interface, on the approved design. |
| `build/` | The Vite plugins (compiled validator and nesting rule, font licences, bundle check), the tests of the package itself, and `measure.config.ts`, the configuration measurements run under, apart from the tests. |
| `e2e/` | The Playwright tests, their pages, and `harness/`, which starts and stops the servers. |
| `test/` | The Vitest setup, and what the tests of `src/document` and `src/store` share: a small page, the random pages and sessions, the measurements. For the renderer: the comparison of two renders (`html-compare.ts`), the safety check, the goldens' freshness, the rule-9 pages and harness, and the tests that read pages the CMS serves (outside the fence of `src/`); `ruby/twins.rb`, the server's side of the twins. |

## What the checks hold

- **The document's types** (`src/shared/document.ts`) are written by hand
  from `../schema/block-document.schema.json`, as a union by block type.
  The compiler holds their key tables to the interfaces, and
  `src/shared/document.test.ts` holds the same tables, every token list,
  each type's style keys, the column-width presets and the rich-text nodes
  to the schema. Shown failing on 2 October 2026 three ways: an optional
  prop marked required (`tsc`), a spacing step dropped from the types, a
  key planted in the schema.
- **Validation** is the server's, in the browser: the application rules
  are `../schema/tools/rules.ts` itself, imported, and the schema is
  compiled by ajv 8.20.0 when the editor is built, with the comparator's
  options (`../schema/tools/ajv-options.ts`), so no compiler and no
  `new Function` reach the browser. ajv's ESM output still calls
  `require()` for its runtime helpers; `build/validator.ts` replaces each
  with an import and stops the build on any other. On the corpus, the
  compiled validator gives the same verdict and errors as ajv compiled at
  run time on every file, and `validateDocument` refuses every invalid file
  at the manifest's pointer, with its keyword, by the layer it names (about
  1.6 s for the corpus at 16% CPU on 2 October 2026). The same module
  exports `validateBlock`, for one block against `$defs/block`, which the
  editor's own checks use on the one parent a change touches
  (`src/document/check.ts`); `build/validator.test.ts` validates every
  section of the corpus both ways and shows a page whose sections all pass
  alone fails only for its own keys or for a block type the nesting rule
  refuses. That rule, page > section > column > widget, is read from the
  schema at build time too (`build/nesting.ts`), and a schema it cannot
  read stops the build.
- **The bundle check**, after every `npm run build`, parses the
  JavaScript it wrote and fails on a call of `eval`, `Function` or
  `require`, and on a missing validator, font or licence. The build of
  2 October 2026 printed: `bundle check: 1 JavaScript file(s), 371.7 KiB,
  parsed; eval() 0, Function() 0, new Function() 0, require() 0; validator
  in assets/index-DPqO62fD.js; fonts with their licence: 4/4` (358.7 KiB
  before `validateBlock` was added).
- **The published page's CSS** is the CMS's own `site.css` and
  `tokens.css`, imported where they are (`src/shared/site.css`); its fonts
  come from `../cms/app/assets/fonts`, the editor's from `../design/fonts`,
  each emitted with its SIL licence. `e2e/canvas-css.spec.ts` shows page
  roots 1280, 768 and 390 wide in one window laid out by their own width
  with the tokens' values and fonts.
- **The fence**: Oxlint makes `fetch`, `XMLHttpRequest`, `EventSource`
  (also on `window`, `globalThis` and `self`) and any import of
  `@rails/activestorage` errors everywhere in `src/` except
  `src/storage/` ([`.oxlintrc.json`](.oxlintrc.json)).
  `build/lint-fence.test.ts` plants 8 violations in three folders and the
  same calls in `src/storage/`: each planted line is reported by its rule,
  the storage file is not, and the real tree lints clean.
- **Storage**: the adapter's types and its route table are held to
  `../cms/openapi.yaml` key by key and operation by operation
  (`src/storage/openapi.test.ts`); the battery every adapter must pass
  runs on the Rails adapter against a CMS of the run's own
  (`src/storage/rails.rails.test.ts`); the autosave runs on a fake clock
  against a fake CMS keeping a draft by the CMS's rules
  (`src/storage/autosave.test.ts`). Each was shown failing with faults
  planted: [src/storage/README.md](src/storage/README.md).
- **The commands** ([src/document/README.md](src/document/README.md)): on
  random valid pages and random editing sessions (fast-check, seeded and
  replayable), every command the reducer accepts gives a page the schema
  and the application rules accept, its inverse gives back the same page
  byte for byte with every removed key absent, and redoing it gives the
  same page with the same ids (`src/document/property.test.ts`, 300
  sessions). `src/document/mutants.test.ts` runs the same sessions on a
  copy of `src/document` and `src/store` with one fault planted in its
  source, six faults in all, and each one fails while the unchanged copy
  passes. What the checks of a change cost on 500 blocks:
  `npx vitest run --config build/measure.config.ts`.
- **The renderer** ([src/render/README.md](src/render/README.md)) is held
  to the server's four ways, each shown failing with faults planted:
  - the render contract: every fixture of `../contract` against the
    server's golden, after the goldens are shown current against their
    manifest, with the normalization `../contract/README.md` lists and the
    safety check on both sides (`npm run test:contract`; the 500-block
    page drew in a median of 70.8 ms on 2 October 2026, on a busy machine);
  - rule 9: random valid pages saved through the API and compared with the
    preview the CMS serves, and a published page (on 2 October 2026, 300
    pages with seed 7 agreed, 26527 nodes, in 117.5 s; the default run, 60
    pages, took 25.7 s; four faults planted in the renderer were each found
    within 39 pages);
  - the twins: the URL policy and rich text against the CMS's own Ruby on
    values the schema refuses too (57000 policy answers and 1500 rich
    texts the same);
  - the layout: the canvas's page roots against the CMS's pages in
    headless Chromium at 1280, 900, 768 and 375, every element's box and
    computed style, to 1/64 of a pixel (536 elements on a responsive page,
    2152 on three random pages, the same).
- **The packages**: every version exact; one `playwright-core`, 1.62.1;
  every `@tiptap` package at 3.31.3 and every `@dnd-kit` one at 0.5.0; and
  every installed package accepts the lowest Node of each line the editor
  declares (`build/packages.test.ts`).
- **The probe** (`e2e/probe.spec.ts`): from Chromium, on the development
  server's origin and through its proxy, a draft is saved and a PNG is
  uploaded with `@rails/activestorage`'s `DirectUpload`, to a CMS with
  forgery protection on; every write leaves from and goes to the editor's
  origin, and the bytes come back unchanged. With the proxy planted to
  rewrite the Host, the first write got 403.

## The servers the tests start

`e2e/harness/servers.ts` starts the CMS in its e2e environment
(`../cms/config/environments/e2e.rb`) on three SQLite databases (primary,
cache, queue) and an Active Storage root, in a folder made for the run
under `../cms/tmp`, and the Vite server with its proxy pointed at that CMS.
It waits for each to answer for itself (`/up` and an empty page list, the
index page and the same list through the proxy), then checks that the
process it started, and no other, listens on the port. At the end it stops
each tree (`taskkill /T /F` on Windows, the process group elsewhere),
shows the port closed, and deletes the folder. On 2 October 2026 the CMS
was ready 25.9 s after the start, on Windows 11 with Ruby 3.4.10.

## Versions

React and React DOM 19.3.0, Vite 8.3.1 with `@vitejs/plugin-react` 6.1.1,
TypeScript 6.0.3, `@dnd-kit/react` 0.5.0 (and `abstract`, `collision`,
`dom`, `geometry`, `state` at 0.5.0), `@tiptap/*` and
`@tiptap/static-renderer` 3.31.3, zustand 5.0.15, ajv 8.20.0,
`@rails/activestorage` 8.1.400 (Rails 8.1.4's), Vitest 5.0.2 with jsdom
29.1.1, `@testing-library/dom` 10.4.2 and `@testing-library/react` 16.3.3,
`@playwright/test` 1.62.1 and `@axe-core/playwright` 4.13.0, fast-check
4.10.2, parse5 8.0.1, Oxlint 1.86.0. `package.json` has the rest; every
version there is exact, and `.npmrc` keeps the next one exact too.
