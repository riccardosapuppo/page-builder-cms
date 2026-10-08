# src/storage/

The only folder of the editor that talks to a server. Oxlint makes
`fetch`, `XMLHttpRequest`, `EventSource` (also as properties of `window`,
`globalThis` and `self`) and any import of `@rails/activestorage` errors
everywhere else in `src/` (`../../.oxlintrc.json`, shown firing by
`../../build/lint-fence.test.ts`).

| File | What it is |
| --- | --- |
| `config.ts` | Which storage the build uses (`VITE_STORAGE`: `rails` by default, or `browser`), and where the API is: `VITE_API_BASE`, `/api` by default. |
| `adapter.ts` | The storage adapter's interface, whole from stage 2, and the types of what it answers. |
| `rails.ts` | The adapter for the CMS's API ([`../../../cms/openapi.yaml`](../../../cms/openapi.yaml)). |
| `browser.ts` | The adapter that keeps everything in the browser, in IndexedDB, with no CMS: the editor in the browser alone. |
| `browser-rules.ts` | The CMS's checks of what it keeps (request members, page addresses, version names, images, the site style) as TypeScript, for `browser.ts`. |
| `site-theme-module.d.ts` | The type of `virtual:site-theme`, the theme's header and footer read from `cms/config/site.yml` when the editor is built (`../../build/site-theme.ts`). |
| `contract.ts` | The battery every adapter must pass, written against the interface alone. |
| `autosave.ts` | Saving on its own: the module the store hands each new document to, and the interface reads. |
| `clock.ts` | The clock the storage code waits on, passed in so tests move time by hand. |

## The interface

`StorageAdapter` has every operation of the full system: pages (list,
create, read, set the next address or the home mark), the draft (read,
save at a revision), publish, schedule, versions (list, read, "Save
version", restore), the media library (list, upload, alt text, delete),
the site style, the theme's header and footer (read only: `getSite`, which
the canvas draws around the page), the responses visitors send with a
page's forms, and `capabilities`, which says which of the optional
operations (publish, schedule, responses) this adapter has. The editor
shows no control for one it lacks; the adapter refuses it as
`unsupported` without asking anyone. The Rails adapter has all three:
scheduling (schedule a revision of the draft for a time, cancel, list;
the times in UTC, the site's zone in `getSite`'s `timeZone`), and
responses: a page's list, newest first and `RESPONSES_PER_PART` (50) at
a time, with the `next` that continues it, a count per form and an
excerpt of each (`listResponses(pageId, { form, before })`); one
response whole, with the published version it came from and its form's
fields as that version had them (`getResponse`); and deleting one for
good (`deleteResponse`). What a visitor wrote comes back as strings,
which the editor's Form responses (`../editor/responses/`) shows as text.
`capabilities.imageVariants` says one thing more, not an operation:
whether the storage makes smaller copies of an uploaded image for the
pages to serve. The CMS does not (it has no image library: no libvips),
so the Rails adapter says false, the battery reads an image's bytes back
unchanged, and the media library says so on screen and resizes each
image in the browser before it goes up. `capabilities.livePages` says
another: whether a publish puts the page in front of visitors, served at
`links.live` with the cache. The CMS does; the browser's storage keeps a
publish as a version and the page's published state, for the editor to
show, but serves nothing, so its `links.live` stays null. `MAX_UPLOAD_BYTES` (10 MB) and
`MAX_IMAGE_SIDE` (10,000 px) are the CMS's limits, held to
`openapi.yaml`; the editor uses them to word a refusal, and the CMS
enforces them.

How an operation answers:
- what it was asked for; or, where the editor has a way forward, an
  `Outcome` naming the refusal: `conflict` (with `currentRevision` and
  the `lastSaveId` that took the draft there), `invalid` (with each error's
  `pointer`, `keyword` and `blockPointer`), `in-use` (an image, with the
  pages and versions that show it). The compiler makes the caller look at
  them;
- anything else is thrown as a `StorageError`, whose `failure` is one of
  four: `unknown` (no answer that says what happened: no network, the time
  ran out, a 5xx, something that is not the API's JSON; a write may or may
  not have taken effect), `refused` (a 400, 403 or 415: nothing changed,
  and sending it again changes nothing), `not-found`, `unsupported`.

A refusal's pointers point into the request as it was given to the
adapter: `/document/sections/0/...` for a save, `/slug` for a page,
`/file`, `/width`, `/height` and `/alt` for an upload (the Rails adapter
moves the API's `/blob/content_type` and `/signedBlobId` there).
`errorsByBlock(sent, errors)` lays a refused save's errors out by block
id and field (`/props/level`), the way the editor shows them.

## The Rails adapter

- Every call names its method, path and body in `RAILS_ROUTES`, by the
  API's `operationId`; no method is deduced from whether there is a body.
  Every POST, PUT and PATCH says `Content-Type: application/json`, even
  with no body, which the CMS requires of every write.
- Each call times out after `timeoutMs` (30 s) on the injected clock, and
  the caller can abandon it with a signal: both are an `unknown` outcome.
- An image goes up with `@rails/activestorage`'s `DirectUpload`,
  unchanged, to `POST /api/media/direct_uploads`, then becomes a library
  item with `POST /api/media`. The library is imported only when an image
  is uploaded. `DirectUpload` reports a failure as a sentence with the
  status in it; the adapter keeps its request through the delegate and
  reads the API's answer from there, so a 422 keeps its fields.
- With an absolute `VITE_API_BASE`, an image's address is made absolute on
  that origin. The `preview` and `live` links of a page stay paths on the
  CMS's origin, which the editor's development proxy does not forward
  (only `/api` and `/rails/active_storage`).

## The browser adapter

`createBrowserAdapter()`, chosen when the editor is built with
`VITE_STORAGE=browser` (`../main.tsx`); nothing else in the editor
changes. Capabilities: `publish` (a publish is a version and the page's
published state), no `schedule` and no `responses` (no server to publish
at a time or to take a visitor's form: refused as `unsupported`), no
`imageVariants`, no `livePages`.

- **Where.** One IndexedDB database, `page-builder-cms`, on the editor's
  origin: `pages` (each record holds its draft, so a save's revision
  check and its write touch one record), `versions` (by page and
  number), `media` (the library's items) and `blobs` (each image's bytes,
  apart, so the list is read without them), `site` (the site style). Its
  layout is `LAYOUT`, a step per version, as the document upgrades are:
  a later layout is a step added at the end.
- **Two tabs.** Every write is one readwrite transaction, and IndexedDB
  runs the transactions of one database's stores one after the other,
  whichever tab sends them: a save checks the revision and writes in the
  same one, so of two saves from one revision the second gets the
  conflict the CMS answers with its 409 (`currentRevision`,
  `lastSaveId`), and the editor's conflict screen works unchanged. A
  refusal undoes what its transaction had written, as the CMS's
  transaction rolls back on a refusal raised inside it.
- **The same refusals.** The document by the editor's twin of the schema
  and the application rules (`../shared/validate.ts`); a page's address,
  a version's name, an image, the site style and each request's members
  by `browser-rules.ts`, the twin of the CMS's checks, with the same
  pointers, keywords and words, so the editor shows the same message in
  either mode. An image named by a document must be in the library
  (`mediaExists`); an image in use is not deleted (`in-use`, naming the
  pages and versions).
- **Documents.** Brought up to the current `schemaVersion` when read and
  restored by `../document/upgrade.ts`, the twin of the CMS's upgrades,
  held to the Ruby by the shared fixtures of `schema/corpus/upgrade/`.
  There is no upgrade yet (the schema is at version 1): a document of a
  version with no step is refused in the upgrade's words, and a change
  of shape adds its step to both sides.
- **Images.** The bytes as a blob in IndexedDB; the item's `url` an
  object URL of the blob, one per item in each tab, revoked when the item
  goes (deleted here, or found gone when the library is read again after
  another tab deleted it). The editor resizes each image before it goes
  up, as it does for the CMS. The theme's header and footer come from
  `virtual:site-theme`, the file the CMS reads.
- **When it gives up**, the failure is `refused` (status 0), with a
  sentence the editor shows (`GIVING_UP`): IndexedDB missing or refused,
  as in some private windows (`storage_unavailable`); the browser's
  storage full (`quota_exceeded`); an upgrade of the database held up by
  another tab still open on an older version (`storage_blocked`); this
  tab's database taken over by a newer version in another tab, which it
  lets go of at once (`storage_upgraded`), or deleted there
  (`storage_deleted`); a database made by a newer version
  (`storage_newer`).
- `links.preview` is the address the build gives (`previewAddress`,
  `?preview=<id>` by default), on the editor's own site; the other links
  name the page's records, since there is no API.

## Checks

- `openapi.test.ts` holds the adapter to `cms/openapi.yaml`. Each type the
  adapter reads or writes is written out once more as a table of its keys,
  each with its JSON type, whether it may be null and whether it is
  required; the compiler holds the table to the type, and the test holds
  it to the schema the API gives for it (47 of them, answers and requests),
  with the version reasons, the image types, the kinds of a kept form
  field, the longest part of a response list, the list's query
  parameters (against `ResponseQuery`) and the refusal codes. The
  route table is held to the API's operations both ways: method, path and
  body. Planted, each failed: a required key added to `MediaItem` in the
  YAML, `getDraft`'s path changed, and `MediaItem.filename` made optional
  in the type (the compiler refused the table). It found the publish
  answer described as nullable though a publish always says what went
  live; the description now says so (`Published` and `PublishedOrNone`).
- `rails.test.ts` runs the Rails adapter on a fetch that records what it
  is asked: each operation's method, address, headers and body, and what
  each kind of answer becomes (a 5xx, an HTML page, a 2xx without the
  API's object, a timeout on the fake clock, an abandoned call). A wrong
  method and a bodiless POST without its JSON type, planted, failed it.
- `rails.rails.test.ts` runs the battery of `contract.ts` against a CMS
  the run starts for itself (`npm run test:rails`, port `E2E_CMS_PORT`,
  3901), on its own databases and Active Storage root, deleted at the end.
  It first checks the battery holds its 35 cases, each named once, and
  that the Rails adapter skips none of them (with `publish` planted as
  absent in its capabilities, that check failed). A visitor's form is
  sent by the runner as a browser sends it from the live page (form
  encoded, with the page's `Origin`), each from an address of its own
  through `X-Forwarded-For`, which only the CMS of this run
  (`config/environments/e2e.rb`) counts under: the cases send more forms
  than one address may in ten minutes.
  With the adapter planted to leave `before` out of the list's query, the
  case that reads the list to its end failed. It runs in jsdom, whose
  document is on the CMS's origin
  (`../../vite.config.ts`), so `DirectUpload`'s requests are same-origin,
  as the editor's are through its proxy; jsdom fixes a window's origin
  when the window is made, and an origin changed afterwards sent the
  upload's first request cross-origin. Three faults planted at once in
  the adapter (a 409 not read as a conflict, an image address left
  relative to the API, upload errors left on the API's fields) failed six
  of its cases.
- `browser-rules.test.ts` holds the twins of the CMS's checks to the
  Ruby they follow, read out of the CMS's files: the page address's form,
  length and reserved names (with the files of `cms/public/`), the ids,
  the limits, the image signatures in their order, and every word the
  CMS writes itself. A reserved name and a word changed, planted, failed
  it.
- `../../e2e/browser/` runs the battery on the browser's adapter in a
  real Chromium, on its real IndexedDB (`npm run e2e:browser`, port
  `E2E_BROWSER_PORT`, 4902, an editor server of the run's own with no
  CMS): the cases run in Node on adapters that live in pages of the
  browser (`remote.ts`), the second tab is a second page of the same
  browser context, and the first test names the cases it skips, the four
  of scheduling and the three of responses. `adapter.spec.ts` checks what
  the interface cannot show: a deleted image's bytes gone from the
  database and its address revoked, here and after a delete in another
  tab; two tabs saving from one revision at the same moment, one saved
  and one in conflict, five times over; a refusal undoing what its
  transaction wrote; a document of an unknown `schemaVersion` refused in
  the upgrade's words. Planted one at a time, each failed it: the
  revision check removed (five cases), the version kept before a restore
  skipped (the restore case), a schema rule skipped (the invalid
  document case), an image's blob left behind by its delete
  (`adapter.spec.ts`).
- `autosave.test.ts` runs the autosave on a fake clock
  (`../../test/fake-clock.ts`) against a fake CMS that keeps a draft by the
  CMS's own rules, and looks at what it holds and received.

## The battery

`contract.ts` exports `STORAGE_CONTRACT`, a list of cases, each with the
optional operations it needs and a `run(env)`. The runner hands it the
adapter, a way to open a second tab on the same storage, its `expect`,
fresh names, a way to read an image's bytes back, and a way to send a
visitor's form from a live page (`sendForm`); it runs each case as
a test of its own, and skips (visibly) a case its adapter's capabilities
lack. Every case makes its own pages; the site style is put back as it was
found. The cases: pages and drafts, the conflict between two tabs, the
same save sent twice being a success counted once, the same `saveId` with
another document being a conflict, the schema's and the application
rules' refusals by block and field, a page's address and home mark,
versions and restore, publishing and publishing a stale revision, the
draft revision what is live came from (the saves since it are the changes
not live), a publish set for a time (pending on the page, replaced by a
second, cancelled, refused at its field or as a conflict, and, on the
real clock, a few seconds ahead: the page watched until it goes live with
the revision scheduled, not the draft edited since), the
media library (upload and bytes read back, refusals at `/file`, alt text,
deleting, an image in use naming who uses it, an image that does not
exist), the site style, the responses to a page's forms (kept with the
version and the fields they were sent with across a change of the form,
newest first, counted by form, a part at a time to the end, deleted for
good, found only under their own page), every optional operation called
on a page that does not exist (refused as unsupported when the
capabilities declare it absent, not found when they declare it present),
and the autosave on top of the adapter (a run of edits one request at a
time, a lost answer, a conflict resolved both ways). It runs unchanged
on the browser's adapter too, in Chromium, with two pages of one browser
as the two tabs.

## The autosave

`createAutosave({ adapter, pageId, revision, document, clock, ... })`.
The store calls `edit(document)` with each new document; the interface
reads `getSnapshot()` and `subscribe(listener)` (the shape React's
`useSyncExternalStore` takes). It imports nothing of either.

- A save leaves `debounceMs` (1 s) after the last edit, and at the latest
  `maxWaitMs` (5 s) after the first edit it carries.
- One request in flight. Edits made meanwhile wait, and leave with the
  revision its answer gave.
- `phase`, kept apart from publishing, which this module knows nothing
  about: `saved`; `waiting` (the pause has not run out); `saving`;
  `retrying` (the outcome is unknown: the very same request, same
  `saveId`, revision and document, goes again at `retryAt`, after 2, 4,
  8, 16, then every 30 s, and the CMS answers a save it had stored as
  saved); `conflict` (saving stops until `reload()`, which takes the
  server's draft and gives it to the caller, or `overwrite()`, which saves
  this tab's document on top); `invalid` (a 422, with `errors`; the next
  edit saves again); `refused` (a 403, 404, 415...: the next edit or
  `retryNow()` sends again). An edit made while the refused save was on
  its way counts as that next edit: it leaves once the refusal lands, at
  the end of its own pause, and the refusal is dropped, since it was
  about a document the person has already changed. Refused in turn, it
  stops there: nothing is sent twice by itself.
- `warnOnClose` is up whenever an edit is not confirmed, or an outcome is
  unknown: the interface asks before the tab closes. `unsavedEdits`,
  `savedAt`, `sentAt` (for "Saving..." after half a second) and `retryAt`
  (for the countdown) are there for the top bar.
- A state that asks for a person, a conflict or an unknown outcome, is
  cleared only by a definite answer about that save or by the person's
  choice: a later edit does not clear a conflict, and a refusal after an
  unknown outcome keeps the outcome unknown, and the same save, to send
  again.
- `flush()` sends what waits at once and resolves on the first phase that
  is neither `waiting` nor `saving`: publishing goes ahead only on
  `saved`.
- `adopt(draft)` takes as the draft one this tab's own request has just
  put on the server, as a restore answers with it: the next save starts
  from its revision, where it would otherwise meet a conflict of its own
  making. It refuses while a save is in flight; the editor calls it only
  once a flush has found nothing waiting (`reload()` is `getDraft()` and
  the same step).

Four faults planted one at a time each failed `autosave.test.ts`: queued
edits sent from the first revision, a new `saveId` on a retry, a second
request in flight, a conflict cleared by an edit. The three tests of an
edit made while a refused save travelled failed on the autosave as it was
before them, which kept the refusal and never sent the edit.

Not here yet: the browser case with a slowed network, which needs the
editor's interface.
