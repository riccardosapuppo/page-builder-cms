# The browser demo is a build of its own, and draws what the CMS would serve

Decided on 8 October 2026, with the browser demo.

## The question

"Try the editor in your browser" is the editor on GitHub Pages, with no
CMS behind it: its pages kept in the browser's IndexedDB
([builder/src/storage/browser.ts](../../builder/src/storage/browser.ts)).
Three things the full system does with a server have no server there: the
preview and the live page, which the CMS serves; a form's answers, which
it takes; and the choice of storage itself, which the editor made when it
started, so every build carried both adapters, and the demo the CMS's
address.

## The decision

1. **The storage is chosen when the editor is built, by its entry point.**
   A build for the browser's storage (`npm run build:demo`) loads
   `src/demo/main.tsx` in place of `src/main.tsx`
   ([builder/build/storage-entry.ts](../../builder/build/storage-entry.ts)),
   so neither build's module graph holds the other's storage. The bundle
   check fails a build that holds the other's marks, or lacks its own.
2. **The demo draws the preview and the page as published itself**
   ([builder/src/demo/PageView.tsx](../../builder/src/demo/PageView.tsx)),
   on the editor's own address (`?preview=<id>`, `?published=<id>`), with
   the canvas's renderer, under one line saying what the full system does.
   Publish keeps a version and the page's published state and opens that
   page; nothing is served at an address of its own. The capability
   `livePages: false` says so to the editor, which then links the page as
   published in place of a live one.
3. **A form there is not sent**: one line under it says what Rails does
   with its answers, and sending says it again. Scheduling and Form
   responses are not drawn at all.
4. **The example site is put in on a first visit**, as the CMS's seed puts
   it in, from the same files (`example-site/`), and only into a browser
   that keeps no page and no picture.
5. **Deployed only while the repository is public**: the CI's `pages` job
   deploys the build its `demo` job tried, from main, only when the
   repository is not private and is public.

## What it costs

- Two entry points to keep in step: `src/main.tsx` and
  `src/demo/main.tsx` make the editor's store, clock and ids the same way,
  each for itself.
- The page as published in the demo is React's drawing, not the CMS's
  HTML. The render contract holds the two to the same markup, but the
  demo shows neither the cache nor the headers the CMS sends.
- On Pages the demo's page is cached ten minutes by headers a site cannot
  set: for that long after a deploy, a browser may load the previous page.
- A private repository has no demo online at all.

## What shows it holds

- `npm run build` and `npm run build:demo`: each ends with the bundle
  check's line naming the storage it holds and the marks it does not.
- `npm run check:serving`: the demo as Pages serves it, its service
  worker line in Chromium, a 404 for what it does not serve, no request
  outside its path.
- `npm run e2e:demo`: the demo's story in Chromium.
- `node --test tools/ci.test.ts`: the deploy held to a public repository,
  failing on planted copies.
