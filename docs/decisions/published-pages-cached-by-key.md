# Published pages are cached by key, and nothing is deleted to refresh them

Decided on 4 October 2026, with the caching of the published pages.

## The question

A published page should cost little to serve again, in the visitor's
browser and on the server, and a publish should show at once. Each cache
must then know when its copy is no longer the page. The two usual ways are
to delete copies when something changes (on publish, on a style change,
on a deploy), or to name each copy by what it was made from, so a change
gives a new name and old copies are simply never asked for again.

## The decision

Every copy is named by what makes the page's bytes
([cms/app/models/page_cache.rb](../../cms/app/models/page_cache.rb)):

- **The browser** gets `Cache-Control: max-age=0, public, must-revalidate`
  and an ETag made of the published version, the site style and the
  release, with no `Last-Modified`. Every visit asks again; an unchanged
  page is a 304 with no body, decided from the page row and the site style
  before the version's document is read. The version is named by its id
  and by the moment the page was put live, to the microsecond (both are on
  the page's row): ids start again in a database made anew, and a restored
  backup or a kept cache database would otherwise give the old database's
  page to the new one's.
- **Solid Cache** keeps the page's whole HTML under the version (named the
  same way) and the
  site style, and each block's HTML under a digest of its subtree and the
  fingerprint of `tokens.css`, read one level at a time with Rails'
  collection caching. Every key starts with the release.
- **The release** is a digest of the CMS's `app/`, `config/` and `lib/`,
  its `Gemfile.lock`, the schema folder's own files, the Ruby version and
  a key derived from the secret (which signs library images' addresses),
  computed once per process, and again after an edited file where code
  reloads.

A publish of any kind (now, from a restored version, at a scheduled
time) makes a new version, so a new ETag and a new page entry, and only
the blocks that changed are drawn again; a new site style redraws the
page around blocks all read back; a deploy finds nothing of the release
before. Nothing calls a cache to clear it, so no publishing path can
forget to.

The other ways, and why not:
- **Deleting on change**: every path that changes a page (publish,
  scheduled publish, site style, a deploy, whatever comes later) would
  have to remember to delete, and a missed one serves an old page with no
  error anywhere. A browser's copy cannot be deleted at all.
- **A max-age window** (say a minute): cheaper visits, but a publish
  would show only after the window, and the page would contradict the
  editor's "Published" for that long.
- **`Last-Modified`**: a restored version published again carries an
  older time, and a browser holding a newer copy would keep it.
- **`fresh_when`**: its digest of the action's template does not see the
  layout, where the site style is, nor the partials a helper renders.

## What it costs

- **Every visit is a request.** A 304 is small and decided early, but it
  is a round trip; there is no window in which a visitor reads the page
  without asking.
- **Old entries take room until they go.** They are never read again,
  and Solid Cache drops them by age (two weeks by default) or when the
  cache passes its size (256 MB in `cms/config/cache.yml`).
- **Bytes are kept more than once.** A block's HTML is in its own entry
  and again inside its column's, its section's and the page's.
- **Any change to the release redraws every page once,** even a change
  that could not alter one (a job's code, a comment in a config file).
- **One partial more per block** on a cached page: Rails caches a
  collection through a single partial, so `blocks/_block` hands each block
  to its type's.
- **Development caches only in the browser** unless `ruby bin/rails
  dev:cache` turns the server's caching on, as Rails does by default;
  then in Solid Cache, on a cache database of its own, as production does.

## The proof

From `cms/`, `ruby bin/rails test test/integration/page_cache_test.rb
test/models/page_cache_test.rb` (after `ruby bin/rails db:test:prepare`):
the headers, the 304, a new page for the old ETag after a publish, a
restore published, a new style and a new release; the reads and writes of
Solid Cache on a page of 2 sections, 4 columns and 12 widgets (one widget
changed: 4 written, 4 found); the same bytes as the partials draw with no
cache on the 500-block fixture; no cookie in any answer.

From the repository root, `node tools/check-production.ts`: the same from
outside a production server, with production's Solid Cache rows counted
(the page and its 45 blocks, then 4 more for one edited widget).

From `builder/`, `npm run e2e -- published-cache`: in Chromium with its
cache on, a 200, a 304 over the wire, and after a publish from the
editor, the new words for the old ETag.
