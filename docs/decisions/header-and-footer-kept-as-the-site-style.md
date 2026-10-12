# The header and footer are kept as the site style is: one row for the site, live on every page with nothing to publish

Decided on 9 October 2026, when the header and footer moved from a file
of the CMS into the editor. Replaced on 12 October 2026 by
[the header and footer as parts of the site](header-and-footer-are-parts.md),
documents of blocks edited and published as pages are: what follows is
kept as it was decided, the files and commands it names as they were
then.

## The question

Until then the site's name, its menu, the header's button and the
footer's two lines were the theme's: `cms/config/site.yml`, read as the
CMS started. The published pages drew them, and the editor's canvas drew
them too, but a click on them only said that they were not changed there.

They are not a page's. The same header and footer are drawn around every
page, the 404 page and every preview, so they cannot simply join a page's
document. Three places were open: in every page's document, published
with it; in a document of their own with a draft, versions and a publish,
as a page has; or as the site style is kept, which already colours every
page: one row for the site, changed live.

## The decision

- **One row for the whole site**, `Site` (`cms/app/models/site.rb`,
  since removed), id 1, as `SiteStyle` is. Until the first change there is no row, and the values
  of [cms/config/site.yml](../../cms/config/site.yml) apply, as the
  defaults of `schema/tokens.json` do for the style. That file keeps
  them as the defaults, checked as the CMS starts against the rules a
  change is held to, and keeps the site's time zone, a setting of the
  CMS that the editor shows and never changes. The mark beside the name
  stays the design's.
- **Changed in the editor**, in Header and footer: a level below the Page
  tab, beside Site style, or opened by a click on either on the canvas,
  on the value clicked. Save sends the four values whole to
  `PUT /api/site`. Their shape is `$defs/site` of the page schema, read
  by ajv in the editor and by json_schemer on the server; a text is one
  line with no control character, and a link is held to what a link in a
  page may be, `javascript:` and `data:` refused.
- **Live at the next visit, with no publish.** The public layout draws
  the row around every page. A published page's ETag and the key of its
  whole HTML in Solid Cache hold a digest of the four values
  (`PageCache.site_key`), beside the site style's: a saved change is a
  new page for every visitor at the next request, a copy a browser kept
  is no longer answered 304, and the blocks' own fragments, which hold no
  part of the header, are read back from the cache.
- **Two things differ from the site style**, each for a reason. A write
  names the revision it was read at, and an older one is a 409 holding
  the header and footer as they are now: the four values are written
  whole, so a tab left open would otherwise put back another tab's new
  link. And the panel saves on Save, not at each change: its words are
  typed, and each keystroke saved would reach every published page.
- **The browser demo keeps the same record** in IndexedDB, held to the
  same cases of the storage battery; every page published in that browser
  shows a change at once.

The other ways, and why not:
- **In every page's document**: a change of the menu would need every
  page published again, and until then pages published before and after
  it would show two different menus.
- **A draft, versions and a publish of their own**: a second publishing
  path, a second History and a second set of versions, for a few words
  and links that are the same on every page. It is what would give the
  header a preview and a way back (below).

## What it costs

- **No preview on the published site, no version, no schedule, and no
  undo once saved.** The canvas draws a change as it is typed, and Discard
  changes drops it before Save; once saved, it is on every published page
  at its next visit. The way back is to type the old words again. A page's
  versions do not hold the header either: a version restored and
  published is served with today's.
- **`config/site.yml` counts only until the first change.** Once the
  editor has saved, editing the file changes no page, and nothing puts the
  defaults back but typing them again.
- **Every change redraws every published page once**, around blocks read
  from the cache, and turns every visitor's kept copy into a full answer
  at the next visit.
- **A link of the menu is an address**, as a link in a page is. A page
  whose address changes leaves a redirect from the old one, so the link
  still leads there; a page deleted leaves the link leading to the 404
  page, and nothing changes the menu for it.
- **Another tab open on Header and footer keeps the old values** until it
  is reloaded, and its Save is stopped by the conflict, Reload or Keep
  mine.

## The proof

From `cms/`, `ruby bin/rails test test/models/site_test.rb
test/integration/api/site_test.rb test/integration/page_cache_test.rb`
(after `ruby bin/rails db:test:prepare`): the defaults with no row at
revision 0; a change kept at the next revision; a write from an older
revision refused with the values as they are, unless it asks for exactly
what is stored; every refusal at its pointer, with nothing stored; and a
change of the header and footer as a new page for every browser, on every
page, at the next visit, drawn around blocks all read from the cache.

From `builder/`, `npm run e2e -- header-footer`: in Chromium against a
CMS of its own, the name changed, a link added to a page's section and
the button taken away, saved from the panel; a visitor's kept page is
answered 304 until the save and shows the new header at the next visit,
the CMS drawing only the page again around its cached blocks. Also
another tab's save first, and a refusal said at its value.

From `builder/`, `npm run e2e:demo`: the same in the browser demo, where
the pages already published in that browser show the change with nothing
published again, and a reload finds it.
