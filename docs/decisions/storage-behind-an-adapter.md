# The editor reaches storage through one interface, and one battery holds every adapter to it

Decided on 2 October 2026, with the editor's storage; the browser's
adapter came on 8 October 2026, and this was written down that day. The
header and footer joined both adapters on 9 October 2026.

## The question

The editor must talk to the CMS, and it must not know how. Two reasons.
The contract between them is the API's description, not Rails' code, so
the editor should work with any server that keeps it. And a visitor with
no server at all can still try the editor, if something else keeps the
pages. A second storage that is not held to the first is worth little:
its refusals, its conflicts and its numbering would differ, and the
editor would meet them as bugs.

## The decision

- **One interface**, `StorageAdapter`
  ([builder/src/storage/adapter.ts](../../builder/src/storage/adapter.ts)),
  and the only folder of the editor that may talk to a server: a lint rule
  makes `fetch`, `XMLHttpRequest` and the upload library an error anywhere
  else in `src/`. Every call answers what it was asked for, or an outcome
  the compiler makes the caller look at (`conflict`, `invalid`, `in-use`),
  or throws a `StorageError` of one of four kinds.
- **Two adapters**: the CMS's (`rails.ts`, over the JSON API) and the
  browser's (`browser.ts`, over IndexedDB, with the images as blobs). The
  browser's refuses what the CMS refuses, with the same pointers, keywords
  and words, because the CMS's checks are copied in TypeScript and a test
  reads the Ruby files to keep them in step.
- **Capabilities say what an adapter has.** Publishing, scheduling, form
  responses, changing the header and footer, smaller copies of images and
  live pages are each declared, and the editor draws no control for one
  that is missing, so the browser demo shows no Schedule and no Form
  responses rather than a button that does nothing. Both adapters change
  the header and footer.
- **One battery**, `STORAGE_CONTRACT`
  ([contract.ts](../../builder/src/storage/contract.ts)): cases written
  against the interface alone, run on each adapter. A case an adapter's
  capabilities lack is skipped, visibly, and one case calls every optional
  operation on a page that does not exist: not found where the adapter has
  the operation, unsupported where it does not. The second tab is a second
  page of the same browser context.

## What it costs

- **A rule in two languages again.** The browser's checks are a copy of
  Ruby's. A test reads the Ruby files and fails when they drift, but the
  copy is still work every time the CMS refuses something new.
- **The browser's adapter is weaker, honestly.** It runs 48 of the 55
  cases: scheduling and form responses need a server and are not there.
  What it keeps lives in one browser; clearing the site's data deletes it.
- **Every call is asynchronous and can fail in the same four ways**, even
  where the browser's storage almost cannot, and the browser's can also
  give up in its own ways (no IndexedDB, a full quota, an older tab
  holding the database), each with a sentence on screen.

## The proof

From `builder/`, with Ruby on the PATH and Playwright's Chromium:

```
npm run test:rails
npm run e2e:browser
```

The first starts a CMS of its own and runs the battery on the CMS's
adapter: on 9 October 2026, with the header and footer's cases, the file
of the battery ran 57 tests, the 55 cases each named once and none
skipped, with two checks of the battery itself. The second runs it on the
browser's adapter in Chromium, with real IndexedDB: 49 tests passed (the
48 cases it can run and its check of the battery) and 7 were skipped, the
cases that need a server, named in the first test. With the revision check
removed from the browser's adapter, five tests failed, and two with it
removed from its change of the header and footer; with a refused open or
a full quota not mapped to its sentence, the test of each failed
(`builder/src/storage/README.md` lists the faults planted).
