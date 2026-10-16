# Collections are typed entries: a definition held to a schema, values held to it by rules written twice, a template kept as a part

Decided on 15 October 2026, with stage 13, collections first and a shop
built on them later: its first phase, the model on both sides, the CMS's
tables and API, the editor's storage on both adapters. The editor's
screen came in the second phase; the two widgets, the template drawn
with an entry and the entries' pages on the site in the third, the same
day (below, "On the page and on the site"). In the fourth, on 16
October, the example site's News, and a page at a collection's prefix
(below, "A page at the prefix").

## The question

The project reads as a page builder more than a CMS: everything it keeps
is a page. A site wants content that repeats, news, events, later
products, each item of a kind typed the same way, listed on pages and
drawn by one design. Two ways were open. Items as pages, each article a
page with a tag, keep one model but leave the shape of an item to each
page, a list to a search through documents, and every article's design
to be copied by hand. Typed content, a collection with fields and its
entries holding values of them, needs a model of its own, and the
project's rule that the editor and the server agree on what is valid
then has to hold for something whose shape is data, which no fixed
schema can describe.

## The decision

- **A collection is a definition**: its name, the prefix of its entries'
  addresses (`/news/<entry>`), its fields (a key, a label, a type of a
  closed list of nine, `text`, `paragraph`, `richText`, `number`, `date`,
  `image`, `link`, `toggle` and `choice`, and whether it is required) and
  the order its entries are listed in. It is held to one schema,
  [`schema/collection.schema.json`](../../schema/collection.schema.json),
  which ajv and json_schemer both read, and to rules the schema cannot
  hold (keys and options unique, a number field's bounds in order and with
  two decimals, an order by a date or number field), written once in
  TypeScript ([`schema/tools/collection-rules.ts`](../../schema/tools/collection-rules.ts),
  imported by the editor as it is) and once in Ruby
  ([`cms/lib/collection_document/rules.rb`](../../cms/lib/collection_document/rules.rb)),
  as a page's are ([one-schema-two-validators.md](one-schema-two-validators.md)).
- **An entry is held to its collection's fields by those rules**: they
  give each value to the definition of its field's type in the schema,
  which reuses the page schema's own (the text widget's rich text, the
  image widget's library image, the button's label and address), and say
  what the schema cannot (a value under a key no field has, a required
  field without one, a number within its field's bounds, a day that
  exists, a choice among its options). Unlike a page's rules, they do not
  stand in front of the schema: both answer together, so a person filling
  in an entry sees every fault at once. A corpus of 124 cases,
  [`schema/collection-corpus/`](../../schema/collection-corpus/), holds
  the two validators to one verdict, and the editor's checks and the
  CMS's to it.
- **An entry has a draft and what is live**, no versions: the draft saved
  at a revision as a page's is ([one-draft-saved-at-a-revision.md](one-draft-saved-at-a-revision.md):
  one conditional statement, a retry recognised, a conflict naming where
  it is), and a publish copying its title, slug and values, checked again
  against the fields as they are then. A live entry published under a new
  slug leaves a redirect from the old one, as a page does. When it went
  live is its first publish since its last unpublish, so a news list does
  not reorder at every correction.
- **A collection's template is a page of kind `template`**, a row of
  `pages` that belongs to its collection (`collection_id`, one each,
  deleted with it), and not a table of its own. The parts showed that a
  document kept as a page gets, for nothing, everything this one needs: a
  draft saved at a revision, versions, a restore, a publish and a
  schedule, its images counted as used, the page API by its id, and the
  editor's autosave and History. A table of its own would have copied all
  of it. Like a part it has no address and is never the home page; unlike
  a part it takes anchors, since it is the whole of what its entry's page
  holds between the header and the footer, which take none. It holds no
  form (keyword `template`): a form's answers are kept with a page and the
  version they were sent from, and an entry is no page.
- **A prefix is one collection's**, never another's, and never an
  address the application answers itself, `sent` among them, whose
  `/sent/<form>` confirms the home page's forms. A page may have it as
  its address, next or live: the section's page at `/news` lists the
  entries at `/news/<slug>` (below, "A page at the prefix", which says
  why the rule that kept them apart went).
- **A counter of what a visitor could see**, `publishedRevision` on the
  collection: every publish, unpublish and delete of a live entry moves
  it, and so does every change of the definition, whose prefix the
  entries' links start with and whose fields a list of entries draws. A
  save does not. The pages that list a collection's entries are cached
  by it, with the moment it last moved ([published-pages-cached-by-key.md](published-pages-cached-by-key.md),
  and below).
- **Both storages keep collections**, behind the same interface and
  held by the same battery ([storage-behind-an-adapter.md](storage-behind-an-adapter.md)):
  the CMS's JSON API, and the browser's IndexedDB, whose layout's third
  step adds two stores and touches no record of the others. A capability,
  `collections`, says a storage keeps them, as `responses` says it keeps
  form answers. An image an entry shows, in its draft or in what is live,
  is in use: not deleted, not purged, and the refusal names the entry.

## On the page and on the site

- **Two widgets, written twice and held by the render contract.** A
  Collection list draws a collection's published entries as cards,
  each linking to its entry's page; a Field block draws one value of the
  entry a template is drawn with, as the widget its type draws as (a
  heading of a level or a text for the title and a text field, an image,
  a link as a button by the button's URL policy, a day in the site's
  words), with that widget's markup and style keys, so it looks and is
  set as that widget is. What they draw from is the render's content,
  given beside the page (`SiteContent` on the server; the renderer's
  `collections` and `entry`), never written into the document: a page
  names a collection by its id, and its entries change without the page
  being saved. The contract's fixtures carry their content in members of
  their own (`collections`, `entry`), which both sides read. On an
  entry's page a list of its collection leaves the entry out: a "More
  news" list never lists the story above it.
- **A Field block goes only in a template.** Insert offers it there
  alone, in a group of its own, This entry, first; Paste refuses it
  elsewhere, and so does the storage, at the block, keyword `field`, on
  a page's draft and a part's. On a page it would draw nothing, so it is
  refused rather than drawn empty.
- **Published entries only, on the canvas as on the site.** The canvas
  reads every collection and every entry when the editor starts and when
  the Collections screen closes, and a list draws what each entry went
  live with; its panel says how many drafts it leaves out and leads to
  them. A template is drawn with an entry's draft: the one its Page tab
  picks, by default the first published in the collection's own order,
  else the first; values made up from the fields' types when the
  collection has none (no image, which none could make up), as the CMS's
  preview makes them (`CollectionTemplate.sample`). A value an entry does
  not have draws nothing, and the canvas alone says so, faintly.
- **An entry's page is `/<prefix>/<slug>`**: the published template drawn
  with what the entry went live with, under its title, its description
  the entry's first paragraph field with a value, else its first text
  field, on one line and cut at a word within a page description's 160
  characters, else the template's own. A draft, an unknown slug or prefix
  is the 404 page, and so is an entry whose template has nothing live:
  no design is made up for it. An old slug answers 301, as a page's does.
- **The preview of a template is the preview of an entry's draft**:
  `/preview/<template id>?entry=<entry id>`, or `?entry=sample` for the
  made-up values, the address the Preview button opens with what the
  canvas draws, and the entry's form's Preview. The demo's are
  `?preview=<template id>&entry=...`, and an entry as published in the
  browser is `?entry=<entry id>`, where its cards lead.
- **Cached by keys, as pages are.** A page's keys name every collection
  that a Collection list of the page, of its header or of its footer
  lists: each by its id, its
  `publishedRevision` and the moment that last moved (`revised_at`), so
  a database made anew, whose counters start again, never meets an old
  key. The collections a version lists are written on the page's row as
  it is published, so a 304 is still answered before a document is read.
  A list's fragment holds its collection's key, so an entry's publish
  redraws the list, its column, its section and the page. An entry's
  page is keyed on a digest of what the entry went live with and its
  collection's fields, not on a counter: a save of the draft, or a
  publish of the same values, keeps it, and the template's blocks are
  shared by every entry, a Field block's keyed on what it draws.
- **One order, written twice**: the entries in a list's order, ties by
  when they were made, a title by its code points as Ruby compares
  strings, those with nothing to order by last (`EntryOrder` and
  `shared/entry-order.ts`), the order the API's list of entries uses too.

## A page at the prefix

Changed on 16 October 2026, with the example site's News. Until then a
prefix was never a page's address, nor a page's address a prefix,
checked both ways, next and live: `/news` would be a page and
`/news/<entry>` an entry, two things under one name, and the rule kept
them apart. It kept apart what a site wants together. The usual shape
of a site's section is the page that lists its entries at their prefix,
News at `/news` and each story at `/news/<slug>`, and the rule sent that
page to another address (the tests had `/club-news`), leaving `/news`
to nothing. The two never meet: a page's address is one part and an
entry's two, each in a slug's form (`config/routes.rb`), so no address
is both, and each is answered by its own route.

So the rule went: from the CMS's `Collection` and `Draft`, from the
browser's storage, and from the editor's words for it. What stays is
that two collections never share a prefix, and that a prefix is never
an address the application answers itself. The example site's News has
that shape: the page at `/news`, linked from the footer, its entries
under it.

## What it costs

- **Another pair of twins.** The collection rules are written twice, with
  a corpus to keep and a comparator to run, and the comparator holds
  pointers and keywords to one verdict, not words: a test reads the Ruby
  file for each word of the TypeScript twin.
- **One check per value.** An entry is checked value by value, each
  against its field's definition, and the editor's bundle carries eleven
  more compiled validators.
- **A collection's definition is not saved at a revision.** Two tabs
  changing one collection's fields at once keep the last, as the site
  style does; an entry's save is conditional, a definition's change is not.
- **A field deleted leaves its values** in the entries until each is
  saved again, without them; a key added again with another type finds
  the old values, which a publish refuses at the value, and which what
  draws an entry must read by its field, never by the key found.
- **The list of entries is read whole.** It is searched in the titles
  only, ASCII letters without their case (any other letter keeps it), and
  ordered after reading, with no pages of results.
- **No form in a template**, and no versions of an entry: its draft and
  what is live are all it keeps.
- **The browser's storage keeps no redirects**, since it serves nothing.
- **Two tables rebuilt**: `pages` (a check, a column and its foreign key)
  and `media_usages` (a third owner), without the migration's
  transaction, as the parts' migration did.
- **A page listing a collection is drawn again at every change of it**,
  even a publish of an entry its list does not show (past its count, or
  left out by its filter): the key is the collection's, not the list's.
  A list in the header or footer does it to every page.
- **A new prefix moves every entry and leaves no redirect**: the old
  addresses are 404s, where a page's old slug answers 301.
- **The section's page and its entries are kept together by hand**: a
  new prefix does not move the page at the old one, nor a page's new
  address the prefix.
- **No entry's page without a published template**: an entry published
  before its template is a 404 until the template is.
- **The canvas reads every entry of every collection**, whole, at the
  start and when the Collections screen closes, as the screen reads a
  collection's.
- **A whole number written as a float** (`1.0`) in a document reads as
  one in JavaScript and as no integer in Ruby: a level, a count or a
  collection's id written so would draw differently. Both storages
  normalise it before they keep a document or an entry, so only a
  document made by hand could hold one, and the contract's fixtures hold
  none.

## The proof

From `schema/tools/`, with the CMS's gems installed: `npm run compare`
runs the comparator on the page corpus and then on the collection corpus,
which printed `RESULT: PASS (124 files, 0 disagreements, 0 exceptions)`
on 15 October 2026, every expected pointer and keyword reported by both
engines (112 of 112) and the same sets from both on every invalid case;
with the Ruby twin's `dateExists` taken out it exited 1 with eight
failures, and with the TypeScript twin's `uniqueKey` taken out with one.
`npm run corpus:check` and `npm run lint` hold the corpus and the schema.

From `cms/`, `ruby bin/rails test test/models/collection_test.rb
test/models/entry_test.rb test/models/collection_document_test.rb
test/integration/api/collections_test.rb test/integration/api/entries_test.rb`
(after `ruby bin/rails db:test:prepare`): the template made with its
collection, the definition's refusals at their pointers, the prefix and a
page's address kept apart both ways (until the rule went, "A page at the
prefix"), the counter, a save at a revision, a retry and
a conflict, a publish checked again, the redirect, an image an entry
shows kept, a template's address, home and form refused, and the
collection corpus answered by the CMS's own checks. Planted one at a
time, each of these faults failed two or three of them: the prefix's
check against the pages, the page's against the prefixes, the revision
left out of the save, the counter left out of the publish, the entries
left out of an image's uses, the form left in a template.

From `builder/`, `npm run test:rails` and `npm run e2e:browser`: the
battery's 13 cases of the collections on the CMS's adapter and on the
browser's, in Chromium on its IndexedDB; and `adapter.spec.ts`'s upgrade
of a database the build before kept, every page, part, version, image
and setting as it was, the site standing as it stood, the build before's
tab told to reload. Planted, each failed: an upgrade that cleared the
pages, a fingerprint that counted the new stores while empty, an entry's
save that did not look at the revision, a publish that did not move the
counter. `npm test` holds the editor's checks to the collection corpus
(`src/shared/collection.test.ts`) and the adapter's types to
`cms/openapi.yaml` (`src/storage/openapi.test.ts`).

For the third phase, on 16 October 2026: from `cms/`, `ruby bin/rails
test` (530 runs, none failing) holds the entries' pages, their redirects,
the previews and the lists (`test/integration/entry_pages_test.rb`), their
cache (`collection_cache_test.rb`), the two partials
(`test/views/blocks_test.rb`) and the render contract's goldens, among
them `collections.json` and `template.json`. Planted one at a time, each
of these faults failed them: an entry found by its draft's slug, the
redirect taken out, a Field block let onto a page, the draft's values
drawn on the live page, the drafts listed, a page's keys without its
lists, a page row without `listed_collections`, a list's fragment keyed
without its collection or without the entry it leaves out, a field's
without what it draws, an entry keyed by its id alone,
`Collection#advance!` without `revised_at`, a list keeping the entry its
page is drawn with. From `builder/`, `npm test` (1333 tests in 169 files)
holds the two widgets' rules, the canvas, their panels, Insert and Paste,
the start on a template's address and the demo's entry view, each of ten
behaviours planted out failing its test; `npm run test:rails` and
`npm run e2e:browser` (97 passed, 7 skipped) the battery's new case on
both adapters, each failing with its rule taken out; `npm run e2e` (294
passed) `collection-pages.spec.ts`, which failed with the list's page
keyed without its collections, with the redirect taken out, with drafts
on the canvas and with the canvas's note hidden, and the two widgets'
accessibility cases; `npm run e2e:demo` (14 passed) the demo's entry
view; `npm run check:serving` (`RESULT: 99 checks passed`) an entry's
page, its 304, its redirect and a list's page; and `npm run
measure:server` (`RESULT: 38 checks passed`) the fragments an entry's
page and a list's page write, given in the README's measurements.

For the fourth phase, on 16 October 2026, a page at the prefix: each new
check failed first on the code that still kept the two apart. From
`builder/`, the battery's case of a page at a prefix and a prefix at a
page's address, next or live, with two collections still never at one
prefix and a prefix still never `sent`, on both adapters (`npm run
test:rails` and `npm run e2e:browser`), refused with `a page at a
collection's prefix was refused: ... is already the prefix of a
collection`. From `cms/`, `test/integration/entry_pages_test.rb`'s
`GET /news`, the page that lists the entry, beside `GET /news/<slug>`,
the entry, and the model's and the API's tests of the same in
`test/models/collection_test.rb` and
`test/integration/api/collections_test.rb`: with the old rule put back,
5 of their 32 runs failed; with each half of it, 3 and 2; with `sent`
let through as a prefix, 2. The example site's News is held by its own
tests, each fault planted in the seeds failing them (seven in the CMS's,
eight in the browser's), the comparison of the two validators over the
template and the entries, and the agreement of the two renderers on the
news page and on each entry's page, which three faults planted in
React's side or in what it was given failed. The whole ran green that
night: `ruby bin/rails test` (533 runs), `npm test` (1345 tests),
`npm run test:rails` (103), `npm run e2e` (296 passed),
`npm run e2e:browser` (97 passed, 7 skipped), `npm run e2e:demo` (14
passed), `npm run check:serving` (99 checks) and `npm run
measure:server` (38 checks).
