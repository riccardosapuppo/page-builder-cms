# cms/

The Rails 8.1 application of the project: it stores the pages, their draft
and versions, publishes them, keeps the media library and the site style,
and answers the editor through a JSON API under `/api`. The pages a visitor
sees are not served yet (stage 4); `links.preview` and `links.live` in the
API already name their addresses.

Run the commands from this folder. They are written `ruby bin/rails ...`
because Windows cannot start an extensionless script by itself; on Linux
and macOS `bin/rails ...` works as well.

## Installing the gems

The gems go into `vendor/bundle`, inside this folder, never into the
system:

```
bundle config set --local path vendor/bundle
bundle install
```

On Windows with RubyInstaller, Bundler writes the gems' launchers into the
user's `AppData/Local/Microsoft/WindowsApps` folder unless told otherwise.
Point it inside `vendor/bundle` before installing, in PowerShell:

```
$env:BUNDLE_SYSTEM_BINDIR = "$PWD/vendor/bundle/ruby/3.4.0/bin"
```

or in a POSIX shell, on the same line as the install:

```
BUNDLE_SYSTEM_BINDIR="$PWD/vendor/bundle/ruby/3.4.0/bin" bundle install
```

`json` is pinned at 3.0.2 or later on purpose: from 3.0 the parser refuses
a member name repeated in one object, which the API answers with a 422;
under 2.x the same option is silently ignored and the last value wins.
There is no `image_processing` and no libvips: the editor resizes images in
the browser before uploading them, and the server makes no variants
(`config.active_storage.variant_processor = :disabled`).

## Running it

```
ruby bin/rails db:prepare
ruby bin/rails server -p 3900 -b 127.0.0.1
```

`http://127.0.0.1:3900/up` answers 200 when the app is up. The server
listens on 127.0.0.1 only: the API has no authentication.

A first look with curl:

```
curl -s -X POST http://127.0.0.1:3900/api/pages -H "Content-Type: application/json" -d '{"title":"Winter series","slug":"winter"}'
curl -s http://127.0.0.1:3900/api/pages
curl -s -X POST http://127.0.0.1:3900/api/pages/1/publish
curl -s http://127.0.0.1:3900/api/site-style
```

## Testing it

In two commands:

```
ruby bin/rails db:test:prepare
ruby bin/rails test
```

The single form `ruby bin/rails db:test:prepare test` exits 1 without
printing anything on a machine where no `rails` launcher is on the PATH,
which is the state the install above leaves: railties 8.1.4 runs the second
task by spawning `rails` (`test_unit/runner.rb`), and that fails.

The run of 1 October 2026 (Windows 11, Ruby 3.4.10), the same with `CI=1`,
which loads the whole app first as production does:

```
[draft concurrency] 10 rounds: requests overlapping in 10, transactions overlapping in 10
122 runs, 456 assertions, 0 failures, 0 errors, 0 skips
openapi: 123 API response(s) checked against cms/openapi.yaml
```

- **Every API response is held to `openapi.yaml`**
  ([test/support/openapi_contract.rb](test/support/openapi_contract.rb)):
  after each request under `/api/`, the response is looked up by path,
  method, status and media type, and its body is validated with
  json_schemer's OpenAPI 3.1 support. A response the document does not
  describe fails the test. With a `required` member the server does not
  send planted in one response schema, and the 409 of the draft save
  removed, 12 request tests failed.
- **The concurrency test** races two saves of one draft from the same
  revision, in two threads with their own sessions and database
  connections, outside any test transaction, ten rounds. Each round must
  end with one 200 and one 409 that names the winner's save id. A small
  save takes less than one turn of Ruby's thread scheduler, so the first
  UPDATE of a round holds its transaction open for 50 ms, and the test
  checks that the two transactions overlapped: without that hold they
  overlapped in 0 rounds of 10 and the test failed. With the
  `WHERE revision` condition removed from the save, both tabs got 200 and
  seven tests failed, this one among them.
- **Time is injected** with `travel_to`: the automatic version every ten
  minutes and `publishedAt` never moving back are tested without waiting.
- **Files.** The test storage service writes under `tmp/storage`. Tests
  that upload delete their files before their transaction rolls back, and
  the run fails if any file is left there at the end (shown with a planted
  file: exit 1, and 0 without it).

Also run, from this folder: `ruby bin/rubocop` (70 files, no offenses on
1 October) and `ruby bin/brakeman` (no warnings).

## The API

[`openapi.yaml`](openapi.yaml) describes every route, request and answer
(OpenAPI 3.1). The page document is not copied there: it refers to
[`../schema/block-document.schema.json`](../schema/block-document.schema.json),
the one schema the editor and the server validate with. From the
repository root, `npm ci` then `npm run lint:openapi` lints it with Redocly
CLI 2.57.0 (with its usage data switched off); the run of 1 October found
no errors and no warnings, and planted faults (a missing `info.title`, a
reference to a missing component, a reference to a missing `$defs` inside
the schema file) each failed it.

| Route | What it does |
| --- | --- |
| `GET /api/pages`, `POST /api/pages` | list; create with `{title, slug}` |
| `GET /api/pages/:id`, `PATCH /api/pages/:id` | the page, its draft, what is live, links; set the next address `{slug}` |
| `GET /api/pages/:id/draft`, `PUT /api/pages/:id/draft` | read; save `{revision, document, saveId}` |
| `POST /api/pages/:id/publish` | publish the draft, optionally only at `{revision}` |
| `GET /api/pages/:id/versions`, `POST ...` | list; "Save version" `{name?}` |
| `GET /api/pages/:id/versions/:number`, `POST .../restore` | read one; restore it into the draft |
| `POST /api/media/direct_uploads` | start an image upload (Active Storage's request and answer) |
| `GET /api/media`, `POST /api/media` | list; create from `{signedBlobId, width, height, alt?}` |
| `PATCH /api/media/:id`, `DELETE /api/media/:id` | change the proposed alt text; delete, or 409 with who uses it |
| `GET /api/site-style`, `PUT /api/site-style` | the palette and type scale, with their curated values; replace them |

**Errors** have one shape, `{"error": <code>, "message": <sentence>}`. A
422 adds `errors`, each with a JSON `pointer` into the request body, the
`keyword` of the rule broken, and the `blockPointer` of the block that
holds the value, so the editor can mark it. A body with a member name
repeated in one object gets 422 `duplicate_key` with its `pointer`; a body
that is not JSON or not UTF-8 gets 400 `malformed_json`.

**Saving.** The revision check is one statement,
`UPDATE drafts SET ..., revision = revision + 1 WHERE page_id = ? AND revision = ?`,
and the rows it changed decide. A 409 gives `currentRevision` and
`lastSaveId`, the id of the save that got there; a retry with the same
`saveId` as the last accepted save is answered 200, so a save whose answer
was lost never comes back as a false conflict.

**Versions** are kept on publish, on restore, on "Save version", and at
most every ten minutes while someone saves. Restoring copies a version
back into the draft after upgrading it to the current `schemaVersion`
([app/models/block_document/upgrade.rb](app/models/block_document/upgrade.rb),
where the steps will go when the schema changes; version 1 is the first).

**Publishing** makes a `publish` version, points the page at it, moves
`publishedAt` forward and never back, and applies the draft's address; the
old one becomes a redirect to the page. `api`, `up`, `assets`, `rails`,
`preview` and any name a file in `public/` answers (such as `404`) are
refused as addresses.

**Media.** JPEG, PNG, WebP and GIF, never SVG, at most 10 MB, recognised
by their first bytes. The upload goes to `/api/media/direct_uploads`, not
to Active Storage's own endpoint, which wants a CSRF token the editor does
not have (a test shows the stock one refusing with forgery protection on,
and this one accepting). Every save indexes the images a draft or version
uses, so a delete can answer 409 with them.

**Site style.** The tone of each palette slot and the type-scale choice,
only from `site-tones` and `site-type-scale` in
[`../schema/tokens.json`](../schema/tokens.json).

## Where things are

- `app/models/block_document.rb`: the checks a document passes before it
  is stored: the application rules of
  [`lib/block_document/rules.rb`](lib/block_document/rules.rb) (the twin of
  the editor's), then the schema, then `2.0` normalised to `2`.
- `app/controllers/api/`: the API. `json_body.rb` reads every body from the
  raw bytes; `base_controller.rb` turns every failure into the error shape.
- `app/models/`: `Page`, `Draft`, `PageVersion`, `SlugRedirect`,
  `MediaItem`, `MediaUsage`, `SiteStyle`.

## Production

No credentials file is committed. Production reads its secret from the
`SECRET_KEY_BASE` environment variable and does not boot without it; for a
local run with nothing to protect, `SECRET_KEY_BASE_DUMMY=1` uses a
throwaway one. The databases are SQLite files in `storage/`.
