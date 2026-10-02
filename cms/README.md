# cms/

The Rails 8.1 application of the project: it stores the pages, their draft
and versions, publishes them, keeps the media library and the site style,
answers the editor through a JSON API under `/api`, and serves the pages a
visitor sees, rendered on the server in the approved design's theme
(`../design/`). Caching of those pages (ETag, Solid Cache fragments) and
the background jobs arrive with stage 4.

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

`bundle clean`, run with the same `BUNDLE_SYSTEM_BINDIR`, removes from
`vendor/bundle` the gems the lockfile no longer names. On 1 October 2026
it removed `image_processing`, `mini_magick`, `ruby-vips` and `ffi`, left
from before libvips was dropped (129 MB to 127 MB); `bundle check` was
satisfied afterwards, the suite passed, and the listing of
`AppData/Local/Microsoft/WindowsApps` was the same before and after.

## Running it

```
ruby bin/rails db:prepare
ruby bin/rails db:seed
ruby bin/rails server
```

`http://127.0.0.1:3900/up` answers 200 when the app is up. The server
listens on 127.0.0.1 only, port 3900, the project's own (3000 is every
project's): the API has no authentication. That is not left to the command
line. `bin/rails` makes 127.0.0.1 and 3900 the defaults of `rails server`,
which would otherwise listen on 0.0.0.0:3000 in production;
`config/puma.rb` does the same for `puma` started by itself; and a Puma
plugin there stops the boot, before any socket is opened, when the server
is asked to listen anywhere else (`-b 0.0.0.0`, `BINDING`, a bind line, a
host name). `-p` changes the port. `ruby bin/dev` starts the same server.
[test/config/puma_binding_test.rb](test/config/puma_binding_test.rb) builds
Puma's configuration from the file as Puma does and starts its plugins as
Puma's launcher does. On 2 October 2026, `ruby bin/rails server` with no
option printed `Listening on http://127.0.0.1:3900`, and netstat showed
that one listener.

`db:seed` loads the example site of the design, Slack Water, an invented
swimming club ([db/seeds/example_site.rb](db/seeds/example_site.rb)):
- the home page as `design/index.html#page` draws it, at
  `http://127.0.0.1:3900/`;
- a content page, `/winter-series`;
- a page that breaks assumptions on purpose, `/notices`: four columns, a
  word too long for any line, emoji and right-to-left text, nested lists, a
  long alt text, a dark band, a heading hidden on phones.

The nine images go into the media library as an upload does (a blob on the
storage service, then `MediaItem.create_from_upload!` and its checks), from
PNGs that `node tools/seed-images.ts` renders from the design's SVGs
(`db/seed_images/`). Run on a fresh development database on 1 October 2026,
it printed:

```
Seeding the example site, Slack Water:
  Slack Water                  /                version 2, home
  Winter series                /winter-series   version 2
  Notices                      /notices         version 2
  9 images in the media library
```

Running it again changes nothing (`test/integration/seed_test.rb` runs it
twice). Version 1 of each page is the automatic version the first save
makes; version 2 is the publish.

To start again from an empty site, with the server stopped:

```
ruby bin/rails db:drop
ruby bin/rails db:prepare
```

`db:drop` deletes the development and test databases; `db:prepare`
creates the development one, loads the schema and, on a database it has
just created, runs the seed (`ruby bin/rails db:reset` does both in one).
The images the old database pointed at stay in `storage/`, in its
two-character folders, as files no row names any more (the nine seed
images, 182 KB, per seed run); delete those folders too for a clean disk.

On Windows `db:drop` used to fail with `Permission denied @ apply2files -
.../storage/development.sqlite3` even with nothing else running: its
environment check opens the database and keeps the connection, and
Windows does not delete an open file. [lib/tasks/release_connections.rake](lib/tasks/release_connections.rake)
closes every connection first. `test/lib/tasks/db_drop_test.rb` runs
`db:create db:schema:load`, then `db:drop`, in processes of their own on a
database of their own; with the rake file moved away it failed with that
error, and with it in place it passed, as did `db:drop` and `db:reset` on
the development database (1 October 2026). A server still running holds
the file the same way: stop it first.

A first look at the API with curl:

```
curl -s -X POST http://127.0.0.1:3900/api/pages -H "Content-Type: application/json" -d '{"title":"Winter series","slug":"winter"}'
curl -s http://127.0.0.1:3900/api/pages
curl -s -X POST http://127.0.0.1:3900/api/pages/1/publish -H "Content-Type: application/json"
curl -s http://127.0.0.1:3900/api/site-style
```

Every POST, PUT and PATCH says `Content-Type: application/json`, even
with no body, as the publish above does; without it the answer is 415
(see "Writes from other sites" below).

## Testing it

In two commands:

```
ruby bin/rails db:test:prepare
ruby bin/rails test
```

The single form `ruby bin/rails db:test:prepare test` works as well, with
one condition. railties 8.1.4 runs the second task by spawning `rails`
(`test_unit/runner.rb`), found on the PATH, and Bundler puts
`vendor/bundle/ruby/3.4.0/bin`, where the install above writes the gems'
launchers, `rails.bat` among them, first on it, so it is found even with
no `rails` on the machine's own PATH. On 2 October 2026, with no `rails`
on that PATH, a Ruby process that loaded `config/boot` found
`vendor/bundle/ruby/3.4.0/bin` first on its PATH and ran `rails
--version`; with that folder's `rails` and `rails.bat` moved away, the
single form exited 1 without printing anything, after preparing the
database. The two commands above do not depend on the launcher.

The run of 2 October 2026 (Windows 11, Ruby 3.4.10), the same with `CI=1`,
which loads the whole app first as production does:

```
[draft concurrency] 10 rounds: requests overlapping in 10, transactions overlapping in 10
225 runs, 1074 assertions, 0 failures, 0 errors, 0 skips
openapi: 184 API response(s) checked against cms/openapi.yaml
```

The run includes `test/lib/tasks/db_drop_test.rb`, which starts Rails
twice in processes of its own and takes about 13 seconds of it.

- **Every API response is held to `openapi.yaml`**
  ([test/support/openapi_contract.rb](test/support/openapi_contract.rb)):
  after each request under `/api/`, the response is looked up by path,
  method, status and media type, and its body is validated with
  json_schemer's OpenAPI 3.1 support. A response the document does not
  describe fails the test. With a `required` member the server does not
  send planted in one response schema, and the 409 of the draft save
  removed, 12 request tests failed. The hook cannot stop checking
  unnoticed: the requests the application receives under `/api/` are
  counted apart, where they enter it, and the run fails unless every one
  was checked, and unless some were whenever the API's request tests ran
  (parallel workers on Linux and macOS leave their counts in `tmp/` for
  the main process to add up; Windows runs the tests in one process, so
  `test/contract/openapi_counts_test.rb` runs the saving and the adding
  up on files of its own, and they wait for CI to run in real forked
  workers). With the hook's path test changed to `/apix/`, as a
  review planted it, `test/integration/api` exited 1 with "181 API
  request(s) answered by the API, 0 held to openapi.yaml"; with the counts
  planted to zero, as when no worker's arrive, it exited 1 with "13 API
  request test(s) ran and no response was held".
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
- **The published pages** are asked for as a browser asks
  ([test/integration/public_pages_test.rb](test/integration/public_pages_test.rb)):
  the live version and not the draft, 301 from a moved address, the 404
  page, the preview's `no-store`, the exact Content-Security-Policy on
  every answer, and no `Set-Cookie` on any of them. That last test runs
  with forgery protection on, as production has it: with it off, as the
  test environment sets it, `csrf_meta_tags` writes nothing, and a call to
  it planted in the layout passed; with it on, the plant failed the test
  with the session cookie it set.
- **The block partials** ([test/views/blocks_test.rb](test/views/blocks_test.rb)):
  every root names its id and type, styles become classes, markup typed in
  any text stays text (a heading planted to skip escaping failed it), the
  tree stays strict, the video and the map are closed details with a lazy
  frame, column widths apply only to a section with one part per column,
  and images are cropped per device.
- **No brand on a page:** the visible text of every golden and of the
  seeded site and its 404 page (text, title, alt, aria-label, placeholder)
  names no provider and none of a list of brands
  ([test/support/visible_text.rb](test/support/visible_text.rb)).
- **The contract goldens** ([test/contract/goldens_test.rb](test/contract/goldens_test.rb)),
  described in [../contract/README.md](../contract/README.md).
- **tokens.css** must be what `ruby bin/rails tokens:css` writes from
  `schema/tokens.json` ([test/lib/site_theme/token_css_test.rb](test/lib/site_theme/token_css_test.rb));
  one value changed by hand in the file failed it.

Also run, from this folder: `ruby bin/rubocop` (104 files, no offenses on
2 October, with `Layout/SpaceAroundOperators` switched on over the
omakase style) and `ruby bin/brakeman` (no warnings).

## The pages a visitor sees

| Address | What it serves |
| --- | --- |
| `/` | the page marked as home (`PATCH /api/pages/:id {home: true}`), its last published version; the 404 page while there is none |
| `/<slug>` | any other published page; an address it had before answers 301 to where it is now, and the home page's own slug answers 301 to `/` |
| `/preview/<page id>` | the page's draft, through the same layout and partials, with `Cache-Control: no-store`, `X-Robots-Tag: noindex` and a robots meta tag |
| anything else shaped like a slug | the 404 page, a document of its own rendered in the site's look, with status 404 |

- **One partial per block type** in [app/views/blocks/](app/views/blocks/),
  fourteen in all, walked by `BlocksHelper#render_document`. Every block
  root carries `data-block-id` and `data-block-type`, and `data-style`
  repeats the stored style for the contract with the editor's renderer.
- **Style is by class.** [BlockStyle](app/models/block_style.rb) turns each
  token of a block's style into a class of
  `app/assets/stylesheets/tokens.css` (`spaceInside: "l"` is `pad-l`, the
  same on tablets only is `tablet-pad-l`), and only for values the
  schema's enums list. `tokens.css` is generated from `schema/tokens.json`
  by `ruby bin/rails tokens:css`; `site.css` is the design's `theme.css`,
  with the same class names and the same container queries on the page
  root. The site style's tones and type scale reach the page as data
  attributes on `.site`, which the generated rules read. A section's
  `columnWidths` (`3:2` is `widths-3-2`, on desktop only), an image's crop
  (`aspect: "16:9"` is `aspect-16-9`) and a section's `spaceAbove` and
  `spaceBelow` (`space-above-section-s`, `phone-space-below-xxl`) are
  classes of the same file.
- **Colours that read on every band.** A background class also sets the
  colours of what sits on it: paper text, headings, links and icons on the
  dark slots (Text, Primary, Muted), ink on Accent, the theme's own on the
  other light slots, and those of the band behind for `none`, so a light
  column inside a dark band, or a phone override to `none`, never keeps
  paper text on paper. The focus ring, 3 px and 3 px outside what has
  focus, is ink on light bands and paper on dark ones: the background
  class sets `--ring-color` for the elements inside it, not for itself,
  because a button with a dark background of its own draws its ring on
  the band around it.
- **No script, no inline style.** The pages carry a static
  Content-Security-Policy, `script-src 'none'`, frames only from the video
  and map providers, and no nonce: Rails' nonce reads the session, and a
  session writes a cookie onto a page meant to be cached. The layout has
  no `csrf_meta_tags` and no `csp_meta_tag`.
- **Video and map load on click, without script**: a lazy iframe inside a
  closed `details`. `node tools/probes/lazy-iframe-in-details.ts`, from the
  repository root, showed on Chromium 151 that such a frame is not
  requested until the details opens, even 3000 px from the viewport where
  a lazy frame without details is fetched at once. The closed card is
  drawn in CSS, so nothing reaches the provider before the click. Other
  browsers were not tried.
- **Rich text** ([RichTextHelper](app/helpers/rich_text_helper.rb)) is
  built with `tag`, `content_tag` and `safe_join`, so it is a SafeBuffer
  and the author's text is always escaped; there is no `raw` and no
  `html_safe` on what an author typed. Addresses go through
  [RenderPolicy](app/models/render_policy.rb), a small pure module the
  editor will get a TypeScript twin of: a refused address is dropped and
  its text kept; a player or map address is built from provider and id, or
  coordinates.
- **Library images** are served through Active Storage's proxy route, on
  the page's own origin, with their width, height and alt text.
- **Icon box icons** are drawn inline from `../schema/icons.svg`, rebuilt
  element by element with tag helpers; loading refuses anything but plain
  shapes.
- **The header and footer** are the theme's, as the design draws them. Their
  name, menu and footer line are in [config/site.yml](config/site.yml)
  until the editor can change them.

From the repository root, with the server running and seeded,
`node tools/site-shots.ts http://127.0.0.1:3900 <folder> [preview page id]`
photographs the pages headless at the widths of the design's shots, and
checks that no request leaves the site before a click, that opening the
video and the map asks each provider for exactly one frame (answered
inside the browser), and that no page it photographs scrolls sideways at
320 wide. On the seeded development site on 2 October 2026 it printed
`reflow: 5 pages measured at 320 wide` and passed.

Laid beside `design/shots/page.png` and `page-phone.png` on 1 October
2026, the seeded home page has the design's bands at the design's
heights: at 390 wide every band edge falls on the same row down to the
end of the quote band; at 1280 wide every edge from the hero down is
9 px higher, because the hero's columns are 3:2, the preset nearest the
design's 1.45 to 1, so its square image is 434 px instead of 444. What
still differs:
- the join band holds the design's form there, and a button here until
  forms arrive (stage 5);
- the video card's still frame has no swimmers, and the map card is a
  plain shore with the pin in the middle, not the design's slipway: both
  are the theme's own drawings in CSS, coloured from the site style, for
  any video and any map rather than this one;
- "Meeting point:" is not bold: a map's label is plain text;
- narrower than 360 px, a width the design does not draw, the header
  wraps, the brand above and Join and Menu below. The design's header
  needs 359 px in a row, so at 320, the width WCAG's reflow criterion
  tests (a 1280 window at 400%), every page scrolled sideways by 39 px
  with Menu cut off, in the design's own mock as well.

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
| `GET /api/pages/:id`, `PATCH /api/pages/:id` | the page, its draft, what is live, links; set the next address `{slug}`, make it the home page `{home: true}` |
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
that is not JSON or not UTF-8 gets 400 `malformed_json`. A string member
holding U+0000 gets 422 with keyword `pattern` at its pointer, a media id
in the path that is not in the form of one gets 404, and so does any other
address or method under `/api/`. A failure nothing foresaw is logged and
answered 500 `internal_error`, in the same shape: the API never answers
with an HTML page.

U+0000 is refused before any query because SQLite stops reading a
statement's text at it. Development turns prepared statements off for its
query log tags, so values travel inside the SQL text, and a slug, a file
name, a checksum or a media id holding one failed there with an HTML 500.
[test/integration/api/unexpected_input_test.rb](test/integration/api/unexpected_input_test.rb)
sends each of them the way development does; with the refusal taken out,
the slug of a new page, the next address and the upload got a 500, the
media id a 500 instead of a 404, and an alt text was refused by the model
under another keyword. With the catch-all handler taken out, a planted
failure reached the test as an exception instead of the JSON 500.

**Writes from other sites.** Listening on 127.0.0.1 keeps other machines
out, but not other sites: a page from anywhere, open in a browser on this
machine, can send requests that need no CORS preflight (a form POST, or a
fetch with mode `no-cors` and a `text/plain` body), and the browser
delivers them. Before this rule such a page could create pages, publish a
draft nobody had reviewed, save and restore versions and start uploads.
So every write is refused with 403 `forbidden_origin` when the browser
says it comes from another site (`Sec-Fetch-Site: cross-site` or
`same-site`) or names another origin (`Origin`), and every POST, PUT and
PATCH with 415 `unsupported_media_type` unless it is sent as
`application/json`, which a browser cannot do towards another origin
without a preflight the API never grants. curl and the repository's tools
send no `Origin`, and pass. In production `config.hosts` lets only
`127.0.0.1`, `localhost` and `[::1]` in, so a domain made to resolve to
127.0.0.1 (DNS rebinding) cannot pass for the CMS's own origin; development
has Rails' own list, which refuses such a name too.
[test/integration/api/other_sites_test.rb](test/integration/api/other_sites_test.rb)
sends the text/plain create, the empty form post that publishes, and JSON
from a foreign origin: with the rule taken out, five of its seven tests
failed, the page created and the draft published. The editor (stage 2)
will reach the API through its development server's proxy, which keeps
the Host the browser asked for, so its origin is the one addressed: a
test saves a draft and starts an upload with `Host: 127.0.0.1:4900` and
that origin, and gets the upload address on that host. With the Host
planted as the CMS's own, 127.0.0.1:3900, the save got 403.

**Saving.** The revision check is one statement,
`UPDATE drafts SET ..., revision = revision + 1 WHERE page_id = ? AND revision = ?`,
and the rows it changed decide. A 409 gives `currentRevision` and
`lastSaveId`, the id of the save that got there. A retry of the last
accepted save, the same `saveId`, `revision` and document, is answered
200, so a save whose answer was lost never comes back as a false
conflict; the same `saveId` with another document or another revision is
a 409, so a second tab that numbers its saves the same way is never told
that text the server dropped was saved.

**Versions** are kept on publish, on restore, on "Save version", and at
most every ten minutes while someone saves. A restore first keeps the
draft it is about to replace as a `before-restore` version (unless the
draft is exactly the newest version already), so the edits made since the
last automatic version are never lost to it; the answer names that
version as `kept`. Restoring copies a version
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
[`../schema/tokens.json`](../schema/tokens.json). The choice reaches the
page as `data-type-scale` on `.site`, and `tokens.css` sizes every step of
Gentle and Strong under that attribute (Balanced, the default, is the
plain `.sw`). From the repository root, with the server running,
`node tools/type-scales.ts http://127.0.0.1:3900` sets each choice
through the API in turn, reads the computed font sizes of the home
page's headings in headless Chromium at 1280, 768 and 390 wide, and puts
the style back. On 1 October 2026 (Gentle / Balanced / Strong, px):

```
1280 wide: display 45.0 / 76.0 / 102.0;  heading-2 31.0 / 42.0 / 51.0;  heading-3 26.0 / 32.0 / 36.0
 768 wide: display 34.0 / 52.0 / 66.0;  heading-2 26.0 / 33.0 / 38.0;  heading-3 22.0 / 27.0 / 29.0
 390 wide: display 28.0 / 40.0 / 48.0;  heading-2 22.0 / 28.0 / 31.0;  heading-3 20.0 / 23.0 / 25.0
```

With Gentle's rules renamed away in `tokens.css`, it failed on every
step and width, Gentle drawing Balanced's sizes.

## Where things are

- `app/models/block_document.rb`: the checks a document passes before it
  is stored: the application rules of
  [`lib/block_document/rules.rb`](lib/block_document/rules.rb) (the twin of
  the editor's), then the schema, then `2.0` normalised to `2`.
- `app/controllers/api/`: the API. `json_body.rb` reads every body from the
  raw bytes; `base_controller.rb` turns every failure into the error shape.
- `app/models/`: `Page`, `Draft`, `PageVersion`, `SlugRedirect`,
  `MediaItem`, `MediaUsage`, `SiteStyle`; for the rendering,
  `RenderPolicy`, `BlockStyle`, `MediaResolver` and `SiteIcons`.
- `app/controllers/pages_controller.rb`, `previews_controller.rb` and
  `concerns/public_page.rb`: the pages a visitor sees, their layout
  (`app/views/layouts/public.html.erb`) and their policy.
- `app/views/blocks/`: one partial per block type; `app/helpers/`:
  `BlocksHelper`, `RichTextHelper`, `SiteHelper`.
- `app/assets/`: `stylesheets/site.css` (the theme), `stylesheets/tokens.css`
  (generated by `lib/site_theme/token_css.rb`), the site's fonts with their
  SIL licences, and the favicon.
- `db/seeds/`: the example site; `db/seed_images/`: its pictures.

## Production

No credentials file is committed. Production reads its secret from the
`SECRET_KEY_BASE` environment variable and does not boot without it; for a
local run with nothing to protect, `SECRET_KEY_BASE_DUMMY=1` uses a
throwaway one. The databases are SQLite files in `storage/`.

Production forces SSL and assumes a proxy in front that ends it;
`CMS_FORCE_SSL=0` turns both off for a local run over plain HTTP, where
Strict-Transport-Security would pin 127.0.0.1 to HTTPS in the browser.
The fingerprinted files under `/assets` are served with
`public, max-age=31536000, immutable` by a `Rack::Static` rule scoped to
`/assets`, with `cascade: true`, so a file that does not exist is the app's
404 without that header.

From the repository root, `node tools/check-production.ts` boots production
on port 3902 with throwaway databases under `tmp/`. It first asks the
server to listen on 192.0.2.1, an address no machine has, and checks the
refusal and that nothing listened; then starts it with no address and
asks the system who listens: 127.0.0.1:3902 only, the process it started.
It publishes a page through the API and checks the page, its policy, the
absence of cookies and HSTS, the 301 and 404, the preview's `no-store`,
the stylesheets and fonts as immutable and a missing asset without the
header. Then, in headless Chromium
([../tools/lib/visitor-checks.ts](../tools/lib/visitor-checks.ts)), it
measures what the page draws, which the Rails tests, reading classes and
rule text, cannot see: the published page has a 3:2 section, a band on
every background slot each holding a link and a button, a light column
in a dark band, a dark button on a light band and a dark band that
phones show on no band. The 3:2 columns must come out 3 to 2 at 1280
wide, the Primary band in the slot's tone and the Display heading at its
size from `schema/tokens.json`; no page may scroll sideways at 320, 340,
360 or 390 wide; and Tab, walked through the page, its preview and the
404 at 1280 and 390 wide, must reach every band's link and button and
find each ring drawn, 2 px or more, at 3:1 against its band, and each
text link at 4.5:1. It then stops the server tree, shows the port
closed, removes the precompiled assets with `assets:clobber` and deletes
its databases. It runs on Windows (netstat, taskkill) and on Linux and
macOS (ss or lsof, and the server's own process group, signalled); it was
run on Windows only. The run of 2 October 2026: `RESULT: 35 checks
passed`. With seven faults planted at once in the stylesheets (`.cols-2`
outweighed as `.sw .cols-2`, the Primary band painted Muted, Display
capped at 70 px, the header's wrap moved to 300 px, the ring back to ink
everywhere, the colours of a phone's `none` and of Accent undone), 8 of
the 35 failed, each fault named in its line: columns 536 and 536 px, the
band `rgb(78, 98, 91)`, `70px`, `scrollWidth 359, clientWidth 320`, rings
of 2.17:1 and 1:1 on the dark bands, paper text on paper, and a link at
3.85:1 on Accent. With `cascade: false` planted (1 October), it failed on
the missing asset, which came back 404 with the year-long immutable
header.

`npm run test:tools`, from the repository root, tests how the check reads
who listens from netstat, ss and lsof, on any system, with a sample of
each system's output that holds lines to skip next to the ones to find.
With three faults planted in the readers (netstat's established
connections let through, ss's process name cut at its first space,
lsof's process ids never read), all three tests failed.
