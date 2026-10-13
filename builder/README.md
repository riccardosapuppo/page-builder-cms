# builder/

The editor of Page Builder CMS: a React 19 and TypeScript app, built with
Vite, that builds pages and saves them to the CMS (`../cms/`) through its
JSON API. It is a package of its own, with its own `package.json` and
lockfile.

**Stage 2.** What the interface stands on, each part with its tests:
the pinned toolchain, the document's types and its validator, the
published page's CSS and fonts, the fence around
the code that talks to the server, the test harness; the page as data
and every change to it as a command with its inverse (`src/document/`),
the store with undo, redo and drag and drop (`src/store/`); the storage
adapter for the CMS's API and the autosave (`src/storage/`); the React
renderer and the fifteen widgets' definitions, held to the server's pages
(`src/render/`, `src/widgets/`). On those, the editor's interface
(`src/editor/`), in the approved design's identity: the shell, the page
switch, the blocks to add (the Insert drawer since stage 3 bis), the
canvas with its marks and the device widths, the property panels with
each widget's own settings in its folder, and the page's tree (the
Outline drawer since stage 3 bis); drag and drop on the canvas and from
the blocks to add, by mouse and by keyboard, with one drop indicator
and a live region saying where the block will go; one keyboard map,
which the "?" window lists; the focus placed after every command; the
block's menu (copy, paste, duplicate, delete); where the edits are (saved,
saving, retrying with a countdown, the conflict's banner with Reload and
Keep mine); Preview and Publish, on the CMS's own origin; Site style, the
palette, the type scale and the letter width; the mark as the page's icon,
a manifest and About. Each widget has its accessibility test, run with axe
on the published page and on the canvas.

**Stage 3, rich text.** A text block is written where it stands on the
canvas, in TipTap (`src/editor/rich/`), loaded on demand: bold, italic
and links from the block's toolbar or the keys, a link refused at its field
for what the server would refuse, a paste cut to what the schema allows.
Its typing becomes one command of the page, kept in one form
(`src/document/rich-text.ts`), when the person pauses or leaves the text
and before any other command or drag; inside the text Ctrl+Z is
TipTap's, outside it the page's.

**Stage 3, tablet and phone, and the keys.** With a tablet or a phone
previewed, the style settings edit that device's values only
(`src/editor/panels/StyleFields.tsx`, `src/editor/device-style.ts`): each
setting says whether its value is the device's own or the desktop's, and
Remove takes the device's key out of the page, never writing the
desktop's value in its place. The canvas, 768 or 390 wide, shows them
through the page's own container queries, as the CMS's page does at
those widths; the Outline flags a block with a device's own values. One
keyboard map names every key the interface shows and binds, the text
editor's too; in a field or a text being written the typing keys are the
text's, and only keeping a version, previewing and publishing work there.

**Stage 3, the media library.** Every image tile, Replace image and a
gallery's Add images open the library of the approved design
(`src/editor/library/`): images uploaded straight to the CMS with
Active Storage, each drawn again in the browser first (turned the way
its camera said, at most 2400 pixels on its long side, since the CMS
makes no smaller copies and says so), with their progress; alt text or
the decorative mark required before an image is placed, placing being
one command born with its mediaId; the library's alt text, and delete,
refused while a page shows the image, with which page.

**Stage 3 bis, the layout.** The same editor, rearranged as the layout
approved on 3 October 2026 (`../design/layout/`): a top bar with
Insert, Outline and History, each opening a drawer (Insert floats over the
canvas's left so the page keeps its width; the Outline and History push
the page aside), undo and redo, the page's
title in the middle (it opens the site's pages, with a search) with
whether it is live under it, the save state, Preview and Publish; one
sidebar on the right with a Page tab and a Block tab, their settings in
collapsible groups named after what they hold (a closed one says its
value, and which device differs; the ones a person keeps open are kept
in the browser, per block type), the site style one level below the Page
tab, with its way back; a bottom line with
the selection's path (each step a button), Block edges, the devices in
one click and the page's width. The page is 1088 wide in a 1440 window
and keeps its desktop layout at 1280. On the page, the selected block's
tools stand in a toolbar floating by the selection's frame, over none of
the page's words (`src/editor/Clamp.tsx`): a yellow chip naming the
block, which opens the block menu, a grip, move up and down, More; while
a text is written, bold, italic and link. Adding is on the page: a round "+" on the selected block's edge, on
the seams between sections and large in every empty column opens a
yellow line at its place and a picker beside it with only what fits
there (`src/editor/InsertPicker.tsx`), which adds by one command; the
"+" key opens it after the selection. The layout's own keys are Alt and
Shift with a letter or a digit (Preview, Insert, the Outline, the three
devices), never Ctrl and Alt. `npm run shots:editor` photographs every
state the layout draws but Schedule (stage 4), named as its shots are,
to set beside them.

**Stage 6 ter, the header and footer as parts of the site.** The
header and the footer are documents of blocks, built in the editor as a
page is (sections, columns, blocks dragged where they go, the Outline,
History) and published as a page is. A click on either around a page on
the canvas opens it, and so do the Page tab and the page switch's "On
every page"; the part open is drawn in its own element, with the page it
was opened from around it, dimmed and locked, and a click on that page
goes back to it (`src/editor/Canvas.tsx`, `PartRoot`). A part holds no
form, so neither Insert nor a "+" offers one there. Two widgets are made
for them, Logo and Menu, in Insert's Site group; a menu folds its links
into Menu on its own block's width where the published page does
(`src/render/header-fit.ts`, held to the CMS's `HeaderFit` to the bit).
A section's columns may take what they hold (`fit:1`, `1:fit`,
`fit:1:fit`), and stack on phones only or never.

## Before you start

- **Node** `^22.13.0 || ^24.0.0 || >=26.0.0` (`engines`, the narrowest of
  the toolchain's: Vitest 5's), and npm.
- For the commands that start a CMS of their own (`npm run test:rails`,
  `e2e`, `check:a11y`, `check:serving` and `shots:editor`) only: **Ruby**
  on the PATH and the CMS's gems installed
  ([../cms/README.md](../cms/README.md)), and Playwright 1.62.1's Chromium
  (revision 1234) in Playwright's cache. Nothing needs to be running.

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
npm run e2e:browser
npm run check:a11y
npm run check:serving
npm run shots:editor -- <folder>
npm run build
npm run preview
npm run build:demo
npm run serve:demo
npm run e2e:demo
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
| `npm test` | Vitest, the "unit" project (pure tests in Node, tests marked `// @vitest-environment jsdom` in jsdom with only a `ResizeObserver` stub, and the first-run note closed as by a browser that has seen it, `test/setup-dom.ts`), then the "contract" project. Each test file runs in the one project its name says (`*.rails.test.*`, `*.contract.test.*`, any other `*.test.*` in "unit"); `build/projects.test.ts` asks Vitest and fails on a file in none. |
| `npm run test:contract` | Vitest, the "contract" project alone (`*.contract.test.tsx`): the render contract, on React's production build ([src/render/README.md](src/render/README.md)). |
| `npm run test:rails` | Vitest, the "rails" project (`*.rails.test.ts` and `.tsx`, in `src/` and `test/`), against a CMS the run starts for itself on `E2E_CMS_PORT` (3901): the storage battery on the Rails adapter ([src/storage/README.md](src/storage/README.md)); the random-page agreement check (`AGREEMENT_RUNS`, 60, at least 1, and `AGREEMENT_SEED`); the renderer's twins and a menu's fold against the CMS's Ruby; the header and footer against the CMS's, each from what it published or its starter; the canvas's layout against the CMS's pages in headless Chromium; the API examples of cms/README.md, run as written in a POSIX shell and in Windows PowerShell. Needs Ruby on the PATH and Playwright's Chromium. |
| `npm run e2e` | Playwright, Chromium headless, against a CMS and a development server the run starts for itself on `E2E_CMS_PORT` (3901) and `E2E_BUILDER_PORT` (4901). |
| `npm run e2e:browser` | Playwright, Chromium headless, against an editor server of the run's own on the browser's storage (`VITE_STORAGE=browser`), port `E2E_BROWSER_PORT` (4902), with no CMS: the storage battery on the real IndexedDB, two tabs of one browser, the editor's own tests on that storage, and each way the storage gives up, said on screen ([src/storage/README.md](src/storage/README.md#checks)). Needs Playwright's Chromium, not Ruby. On 12 October 2026, with the header and footer kept in this storage as parts and their cases in the battery: 74 passed, 7 skipped (the cases that need a server). |
| `npm run check:a11y` | The same, only the tests tagged `@a11y`: the whole path by the keyboard alone (insert from Insert opened by its chord, move with Space and the arrows, add from the page with the "+" key and its picker and move that block up from its clamp, edit a heading's text and level in its Text group, write in a text on the canvas and make a word bold, look at a tablet from the bottom line's devices and give a column a tablet's own space in its Spacing group, go through the Outline, upload an image and place it with its alt text, undo and redo, keep a named version, publish, open the served page and read it at a desktop's and a tablet's width); the focus after every command; every key of the keyboard map and the "?" window that lists them, and the typing keys inside a text being written; a tablet's and a phone's own values set and taken back; the block's menu from the keyboard; undo, redo, versions and restore from the history; an image uploaded, described, placed and served; axe with no serious or critical finding on the editor in thirty-nine states, in a window of 1440 by 900 and one of 1280 by 800 (each drawer and the Outline's headings, the clamp's block menu, the block picker and the section picker, a seam under the pointer, Insert open over a first column's block, a key of Insert picked up by the keyboard and a dropped Video asking for its address, Block edges and the Page tab, the sidebar hidden, a text being written and its link's field, a tablet's override, a block hidden on the phone previewed and selected, the "?" window, the history and its name field, and the media library among them), on the Schedule dialog and on the Publish menu with a publish waiting, on the published page, and on every widget's accessibility test (`src/widgets/<widget>/a11y.ts`); the save states, a publish, a publish set for a time going live, a cancel by the keyboard, Site style, and the header opened from a page's Page tab by the keyboard alone, with axe on the editor while it is open, and back to the page. |
| `npm run check:serving` | How the editor's shell and the published pages are served, over HTTP and in Chromium (`e2e/serving/check-serving.ts`): on the development server and on `vite preview` of a build it makes, the page never stored, no validators and no 304, the line unregistering service workers, a 404 for a missing file and no `404.html`, the hashed files kept a year; the demo's build served as GitHub Pages serves it (below), its line unregistering a service worker left in its own path and keeping another project's, a 404 for a missing file, no CMS adapter or address in its files and no request outside its path; on the CMS, published pages with no script and no service worker, and an ETag that gets a 304. Starts its own servers on the same two ports and on `E2E_DEMO_PORT` (4903); prints `RESULT: <n> checks passed`, exits 1 on a failure and 2 when it could not run. On 9 October 2026, with the demo keeping the header and footer, it printed `RESULT: 60 checks passed`, 19 of them on the demo's build. |
| `npm run shots:editor -- <folder>` | Photographs the editor, headless, in every state of the approved layout's shots but Schedule, whose dialog stage 4 built and this does not photograph yet, named and staged as they are (`../design/layout/shots`: editor, add, structure, style, drag, tablet, publish, history, media, site-style, empty, shortcuts; `shots-extra`: text-editing, small-block, insert-at-seam, insert-drawer, page-tab, block-menu, more, new-section, phone, section, pages, conflict, offline, narrow-gutter, seam-hover, outline-col1, insert-col1), and in a right click's menu, a text's link field, a drag from Insert, a dropped Gallery key with its library open (`drop-asks`), the hero's own space on phones, Block edges, the mark's menu and About, and the home page as the CMS serves it to a tablet and a phone (`served-tablet`, `served-phone`, to set beside the canvas at 768 and 390), at 1280 by 800 and, in `<folder>/1440`, at the layout's own 1440 by 900 (the layout's `editor-1280`, `insert-drawer-1280` and `outline-col1` are the 1280 ones), on the example site of `../cms/db/seeds.rb`, in a CMS and a development server of its own on the same two ports. Fails on a console error, a page error or a request that leaves them, saying after which shot. On 4 October 2026 it printed `RESULT: 74 shots`, and, once `drop-asks` was added, `RESULT: 76 shots`. |
| `npm run build` | The bundle in `dist/`, then its check (below). |
| `npm run preview` | Serves `dist/` on 127.0.0.1, port `BUILDER_PORT`, with the same proxy as `npm run dev`. |
| `npm run build:demo` | The browser demo in `dist-demo/`, then the bundle check (below): for GitHub Pages, under `/page-builder-cms/`, or with `DEMO_BASE=/` for a host of its own, at the root. |
| `npm run serve:demo` | Serves `dist-demo/` as GitHub Pages serves it, at `http://127.0.0.1:4903/page-builder-cms/`, or at `http://127.0.0.1:4903/` with `DEMO_BASE=/` (`E2E_DEMO_PORT` moves the port), until Ctrl+C. |
| `npm run e2e:demo` | Builds the demo, serves it so, and tells its story in Chromium headless (`e2e/demo/demo.spec.ts`, below), under the base `DEMO_BASE` gives. Needs Playwright's Chromium, not Ruby. On 9 October 2026: 9 passed; on 13 October, 9 passed under each base, and that evening, with the test of the example site's editions, 10. |

The editor's page is sent never stored, with no ETag and no Last-Modified,
by both servers, and the built files under `assets/` are kept a year by
`vite preview` (`build/serving.ts`).

`VITE_API_BASE`, read at build time, is where the editor finds the API:
`/api` by default. An absolute address needs that server to allow the
editor's origin by CORS (the decision note above). `VITE_CMS_ORIGIN` is
the CMS's own origin, where the preview and the live page open: by
default the origin of an absolute `VITE_API_BASE`, else
`http://127.0.0.1:3900`; `npm run dev` sets it from `CMS_URL`
([../docs/decisions/editor-links-to-the-cms-origin.md](../docs/decisions/editor-links-to-the-cms-origin.md)).

## The browser demo

The editor with no CMS behind it, for a person to try in their browser:
"Try the editor in your browser". It is the second mode of the project;
the first, the full system, is the CMS and this editor together.

**Building and serving it.** `npm run build:demo` runs `vite build --mode
demo`: the storage is the browser's (`VITE_STORAGE=browser`; asked for the
CMS's, the build stops), the base is `/page-builder-cms/`, the path GitHub
Pages gives this repository's project site, or the one `DEMO_BASE` names
(`build/demo.ts`): `/` for a host of its own, which serves the demo at
its root; any other path that starts and ends with a slash; anything else
stops the build, saying why. (In Git Bash, `DEMO_BASE=/` reaches Node as
Git's own folder: set it in PowerShell or cmd, or with
`MSYS2_ENV_CONV_EXCL=DEMO_BASE`.) The output is `dist-demo/`, so `dist/`
is never replaced by it. Every page of the editor, the demo's included,
asks search engines to leave it out of their indexes (`noindex,
nofollow` in `index.html`), since Pages lets a site set no header. The page loads
`src/demo/main.tsx` in place of `src/main.tsx` (`build/storage-entry.ts`),
so the demo's bundle holds no CMS adapter and no CMS address, and the
editor's holds no browser storage and no demo: `build/bundle-check.ts`
fails either build otherwise, each by marks only that code carries.
`npm run serve:demo` then serves the build as Pages serves it
(`e2e/harness/pages-server.ts`): under its base, a missing file a 404,
and the host's own headers. `VITE_STORAGE=browser npm run dev` serves the
same demo from the source, at `/`.

**What it does.**
- On a first visit, with nothing kept in the browser, it puts in the
  example site of `../example-site/`, as the CMS's seed does: the three
  pages and fifteen pictures, each page published, the header and footer
  published as their starters are, the home page open
  (`src/storage/example-site.ts`). A site with a page or a picture is
  never added to. Each build's example site has an edition, a digest of
  its files and of the header's and footer's starters: on a visit to a
  build of another edition, a site nobody has changed since its seed
  (every record the browser keeps of it as the seed left it, checked in
  the transaction that lets go of it) is let go of and the new edition
  put in at once; a site somebody has changed is kept, and the demo's
  line offers to start over with the new one, asking twice.
- It keeps pages, drafts with their revisions, versions, a publish, the
  media library with each image's bytes, the site style, and the header
  and footer, parts kept as pages are, in the browser's IndexedDB
  (`src/storage/browser.ts`), held
  to the CMS adapter's storage battery. Two tabs of one browser share
  them, and the one that saves second gets the conflict bar.
- Preview opens the draft as it would be published (`?preview=<id>`), and
  Publish keeps the page as published and opens it in a new tab
  (`?published=<id>`): the demo draws each with the canvas's renderer,
  inside the header and footer as the CMS draws them (the parts' drafts
  in a preview, what each published around a page as published) and in
  the site style kept in this browser, under one line saying what the
  full system does (`src/demo/PageView.tsx`); a part's own preview is the
  home page's. A header or footer published shows on every page
  published in this browser. A form there says in one line
  what becomes of its answers instead of sending them; a link to another
  page of the site opens that page as the demo draws it.
- At the bottom, under the editor's bottom line and under each page it
  draws, one line: "Browser demo: drafts stay in this browser. The full
  CMS runs on Rails 8, with publishing, shared versions and caching.
  Source on GitHub."

**Its limits.**
- Nothing is served: no page at an address of its own, no cache, no
  publish at a set time, no form answers and no Form responses. What is
  not there has no control: the editor draws none (capabilities).
- Drafts stay in one browser. Another browser, or another person, sees
  none of them; clearing the site's data deletes them. A browser that
  refuses IndexedDB (some private windows), one with no room left, or a
  tab holding an older version of the storage, says so instead of
  starting or saving.
- No smaller copies of an image: each is resized in the browser to
  2400 px on its long side before it is kept, as for the CMS.
- On Pages the page is cached for ten minutes by headers a site cannot
  set, so for that long after a new deploy a browser may load the
  previous page; the line that unregisters service workers in the demo's
  own path is what the site itself can do.

**Its story** (`npm run e2e:demo`), each test a first visit in a browser
of its own, on the build as Pages serves it: the example site's three
pages, published, with the demo's line at the bottom; an edit kept after
a reload; two tabs and the conflict bar; an image added to the library;
Publish opening the page as published with its line, its form and its
links; Preview showing the draft; the header opened from the canvas, the
page dimmed around it, its logo renamed and a link added to its menu,
published and shown by the pages published here, the footer's draft shown
by the preview alone, and kept after a reload; the screens a person opens
(the Page panel, the header's Page tab and Publish menu,
the history, the menus and dialogs), none of which speaks of a visitor, a
live page, a server or a CMS without naming the full system; a large image
refused in the browser's words; the notice that says how Publish went,
closed from the keyboard with the focus kept; axe on each screen; and no
request off the demo's path.

**Online on a host of its own, with a mirror on GitHub Pages.** The demo
is at `https://builder.riccardosapuppo.com/`: a build of `main` made with
`DEMO_BASE=/`, uploaded from this machine. The CI's `demo` job builds and
tries the demo on every run. Its `pages` job deploys that build to GitHub
Pages, from `main`, on a push or run by hand, and only while the
repository is public: the free plan publishes Pages from public
repositories alone (`../tools/ci.test.ts` holds the job to that). That
copy, at `https://riccardosapuppo.github.io/page-builder-cms/`, is a mirror
every push brings up to date.

A link to the demo shared on a site that draws previews shows the editor
on the example site: the demo's page, and only the demo's, carries Open
Graph tags (`build/demo.ts`, `linkPreviewTags`), every address absolute on
the demo's own host, since those sites resolve none, and the build puts the
picture at its root as `preview.png`, 1200 by 627. `npm run shots` makes it
with the README's pictures, as `docs/images/demo-preview.png`; the editor the
CMS serves carries neither.

## Where things are

| Folder | What goes there |
| --- | --- |
| [`src/shared/`](src/shared/README.md) | What comes from the rest of the repository: the document's types, the validator, the published page's CSS, the editor's font. Every other folder imports from here. |
| [`src/document/`](src/document/README.md) | The tree, the commands with their inverses, the reducer, migrations: pure functions. |
| [`src/store/`](src/store/README.md) | The vanilla zustand store that runs the reducer, the selection, the history. |
| [`src/widgets/<widget>/`](src/widgets/README.md) | Each widget's definition, renderer, icon, its panel with the panel's test, and its accessibility test (`a11y.ts`, run by `npm run check:a11y`). `registry.ts` lists the definitions, `panels.ts` the panels. |
| [`src/storage/`](src/storage/README.md) | The storage adapter, the only code that talks to a server. |
| [`src/render/`](src/render/README.md) | The React renderer, held to the server's by the render contract. |
| [`src/editor/`](src/editor/README.md) | The interface, on the approved design. |
| [`src/demo/`](src/demo/README.md) | The browser demo's entry point, the pages it draws where the CMS would serve them, and its bottom line. |
| `build/` | The Vite plugins (compiled validator and nesting rule, font licences, bundle check), the tests of the package itself, and `measure.config.ts`, the configuration measurements run under, apart from the tests. |
| `e2e/` | The Playwright tests, their pages, and `harness/`, which starts and stops the servers and gives every browser of the runs the first-run note already seen (`welcome.ts`). |
| `test/` | The Vitest setup; `env.ts`, which reads a run's seed or count from the environment; and what the tests of `src/document` and `src/store` share: a small page, the random pages and sessions, the measurements. For storage: the fake clock. For the renderer: the comparison of two renders (`html-compare.ts`), the safety check, the goldens' freshness, the agreement check's random pages and harness, and the tests that read pages the CMS serves (outside the fence of `src/`); `ruby/twins.rb`, the server's side of the twins. |

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
  at the manifest's pointer, with its keyword, by the layer it names (on
  2 October 2026, with other work keeping the CPU 40% busy, 1.0 s for the
  manifest's files and 1.9 s for the comparison with ajv). The same module
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
  3 October 2026, with the interface, printed: `bundle check: 2 JavaScript
  file(s), 702.9 KiB, parsed; eval() 0, Function() 0, new Function() 0,
  require() 0; validator in assets/index-CQM1kcnj.js; fonts with their
  licence: 4/4` (371.7 KiB on 2 October, before the interface; the second
  file is `@rails/activestorage`, loaded when an image is uploaded). The
  main file was then one chunk of 704 kB, 185 kB gzipped. The text editor
  is a chunk of its own, fetched when a text is first selected or edited:
  the build of 3 October 2026 with it printed `bundle check: 3
  JavaScript file(s), 1077.8 KiB`, the main file 734.45 kB (194.58 kB
  gzipped, with the history panel of the same day in it too) and
  `TextEditor-*.js` 353.93 kB (113.28 kB gzipped), every TipTap and
  ProseMirror module in the second and none in the first (their source
  maps list them). A clean copy of `a1688e2`, the end of stage 2, built
  the same day with the same packages, gave a main file of 714.30 kB,
  188.80 kB gzipped. With the media library and the rest of stage 3's
  first part, the build `npm run check` made on 3 October 2026 printed
  `bundle check: 3 JavaScript file(s), 1103.8 KiB`: the main file
  760.81 kB (203.44 kB gzipped), `TextEditor-*.js` 354.24 kB (113.37 kB
  gzipped) and `@rails/activestorage` 15.26 kB. With stage 3 bis's
  layout, the build `npm run check` made on 4 October 2026 printed
  `bundle check: 3 JavaScript file(s), 1161.3 KiB`: the main file
  815.31 kB (220.74 kB gzipped), `TextEditor-*.js` 358.57 kB (114.94 kB
  gzipped) and `@rails/activestorage` 15.26 kB. Vite still warns the main
  file is over its 500 kB.
  With `new Function` planted in `src/main.tsx`, the build failed: the
  minifier had made it `Function()`, which the check counted.
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
  sessions), the texts the canvas's text editor hands over, written as
  TipTap writes them, among them, and a form's own edits (a field's type
  and longest answer, the button's text, the message), each of which the
  run must have made. `src/document/mutants.test.ts` runs the
  same sessions on a copy of `src/document` and `src/store` with one fault
  planted in its source, nine faults in all, and each one fails while the
  unchanged copy passes. What the checks of a change cost on 500 blocks:
  `npx vitest run --config build/measure.config.ts`.
- **The text editor** ([src/editor/README.md](src/editor/README.md)): its
  nodes, marks and their attributes are the schema's rich text, compared
  with the schema itself, a planted underline and TipTap's own link (with
  its title) each failing the comparison (`src/editor/rich/extensions.test.ts`);
  on random texts, a text kept and read back by the editor is the same
  text, and random editing in the real editor, handed over after every
  step, is always taken by the page and undone and redone through the
  page's history exactly (`src/editor/rich/editor.test.ts`); the two
  histories' hand-over is tested on the editor in jsdom
  (`src/editor/rich/text-session.test.ts`) and in Chromium
  (`e2e/rich-text.spec.ts`), and so is what the page takes of a text: a
  paste of 501 or 600 lines cut to 500 paragraphs and said, the words
  typed before and after it kept through Esc, a drag, Duplicate, and Undo
  and Redo; Enter and Tab stopped twelve lists deep, where a linked word
  still fits the page's nesting; a paste of which nothing fits not kept;
  and a text the store refuses all the same kept open, the commands and
  drags waiting. Every package the text editor's chunk imports is in
  `vite.config.ts`'s `optimizeDeps` (`build/optimize-deps.test.ts`): one
  that is not is bundled when a text is first edited, and the page
  reloads.
- **The renderer** ([src/render/README.md](src/render/README.md)) is held
  to the server's four ways, each shown failing with faults planted:
  - the render contract: every fixture of `../contract` against the
    server's golden, after the goldens are shown current against their
    manifest, with the normalization `../contract/README.md` lists and the
    safety check on both sides (`npm run test:contract`; the 500-block
    page drew in a median of 70.8 ms with other work keeping the CPU 93%
    busy, and of 35.9 ms in a later run on a less busy machine, both on
    2 October 2026: an order of magnitude, not a measure);
  - the random-page agreement check: random valid pages saved through
    the API and compared with the preview the CMS serves, and since
    stage 4 each also published and compared three ways through Solid
    Cache: drawn and kept block by block, published again (every block
    read back), and read whole; with the page's own entry planted to be
    keyed on the page instead of its version, it failed at the second
    page (on 2 October 2026, 300
    pages with seed 7 agreed, 26527 nodes, in 117.5 s, and the same in
    119.1 s in a later run; the default run, 60 pages, 4952 nodes, took
    25.7 s and later 30.8 s; four faults planted in the renderer were each
    found within 39 pages. On 3 October, with the generator held to the
    schema's new rules on marks and anchors, the default run drew 4411
    nodes, in 6.9 s on the virtual machine of the root README; on
    4 October, each page also published three times, the same 4411
    nodes in 18.8 s, in `npm run check`);
  - the twins: the URL policy and rich text against the CMS's own Ruby on
    values the schema refuses too (57000 policy answers and 1500 rich
    texts the same);
  - the layout: the canvas's page roots against the CMS's pages in
    headless Chromium at 1280, 900 and the editor's two previews, 768 and
    390 (`src/shared/preview-widths.ts`, from `schema/tokens.json`), every
    element's box and computed style, to 1/64 of a pixel (536 elements on
    a responsive page and 2152 on three random pages, the same, on
    2 October 2026; 536 and 1468 on 3 October, the random pages drawn by
    the generator as it is now).
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
shows the port closed, and deletes the folder. On 2 October 2026, on
Windows 11 with Ruby 3.4.10 and an Intel Core i5-7200U, the CMS was ready
25.9 s after the start, and 137.6 s in a later run with other work
keeping the CPU fully busy; stopping it took under a second.

Every page a test drives ends with no error on it, none in its console
and no request anywhere but those two servers, which is refused before it
leaves the machine; the pictures "from another site" are answered inside
the browser (`e2e/helpers/site.ts`, `watchQuietly`). The shared fixture
holds each test's own page to it; a page of a browser or a context a test
opens for itself (one that draws its scrollbars, a second tab) is held to
it by the test with the same function, and `e2e/quiet.spec.ts` plants
each of the three faults in such a browser and sees it caught. The one
exception is a visitor of the published pages (`e2e/helpers/visitor.ts`),
whose context must not be routed, since Playwright turns Chromium's HTTP
cache off where requests are routed: it is held to the same three by
listening, and reads the status that crossed the wire, a 304 included,
from Chromium's DevTools protocol.

The harness names the CMS's folder in `E2E_CMS_FOLDER`, so a test can
read what the CMS keeps there (`e2e/helpers/cms-store.ts`, read only):
`e2e/publish-story.spec.ts` counts the fragments Solid Cache holds
before and after each visit, and finds the job Solid Queue ran for a
cancelled publish. The CMS runs Solid Queue inside its server, as
threads on Windows and a forked process elsewhere, so a publish set for a
time happens while the tests watch.

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
