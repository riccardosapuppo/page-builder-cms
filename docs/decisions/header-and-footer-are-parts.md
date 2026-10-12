# The header and footer are parts of the site: documents of blocks, edited and published as pages are

Decided on 12 October 2026, when the header and footer, until then four
values in a panel of fields, became something to build as a page is
built. It replaces [the decision of 9 October](header-and-footer-kept-as-the-site-style.md),
which kept them as one row for the site, live with nothing to publish.

## The question

With the panel of 9 October the site's name, its menu, the header's
button and the footer's two lines could be changed, but not the header
itself: its layout was the theme's, one bar of name, links and button,
and the footer one paragraph. A site that wants a second row of links, a
logo on its own, the button on the left, a footer of three columns, could
not have them.

The editor already builds anything of that kind for a page: sections,
columns, blocks, dragged where they go, with a draft that saves itself,
versions, a preview, a publish and a schedule. The header and footer are
drawn around every page, so they cannot simply join a page's document;
the question was whether they could be documents of their own, made the
same way.

## The decision

- **Two parts, kept as pages of their own kind**: `pages.kind` is `page`,
  `header` or `footer`, with at most one of each part (a unique index),
  no address and never the home page (a check on the table, and the
  model's validations). A part has a draft, saved at a revision as a
  page's is, versions, a publish, a schedule and History: everything a
  page has, by the same API and the same code. `GET /api/pages` lists
  them apart, as `parts`, and makes them the first time it is asked, each
  with its starter as its draft and nothing published
  ([cms/app/models/page.rb](../../cms/app/models/page.rb), `Page.part!`).
- **The same document as a page**, held to the same schema and the same
  application rules, and to one rule of its own: no form, since a form's
  answers are kept with the version of the page they were sent from
  ([cms/app/models/site_parts.rb](../../cms/app/models/site_parts.rb),
  `SiteParts.check`, and its twin in the editor,
  [builder/src/shared/validate.ts](../../builder/src/shared/validate.ts),
  `validatePart`), at each save and again wherever a page's rules
  check a stored document: a publish, a schedule, a version, a restore.
  The editor offers no form while a part is open.
- **The blocks a header is made of** joined the widgets: Logo, the
  theme's mark with the site's name beside it as one link home, and
  Menu, a row of links that folds into Menu, a pill opening them as a
  sheet, where its block is narrower than its words need
  ([header-folds-by-measured-letters.md](header-folds-by-measured-letters.md)).
  A section learnt two things for them: columns as wide as what they hold
  (`fit:1`, `1:fit`, `fit:1:fit`), and where its columns stack (`stack`:
  on phones only, or never).
- **Starters**: [cms/config/parts/header.json](../../cms/config/parts/header.json)
  and [footer.json](../../cms/config/parts/footer.json), the design's own
  header and footer made of those blocks. Every page draws a part's
  starter until the part publishes, and a new part's first draft is its
  starter. The CMS checks both as it starts, against the rules a part's
  draft is held to, and stops naming each value that breaks them; the
  editor's build makes the same check for the browser's storage.
- **Live when published**: the public layout draws each part's published
  version, or its starter, around every page; the preview draws the
  parts' drafts. A publish of a part is a new page for every visitor at
  the next request: the parts' published versions are in a page's ETag
  and in the key of its whole HTML, and the part's blocks are fragments
  of Solid Cache as a page's are, so only those that changed are drawn
  again.
- **Edited where they are seen**: a click on the header or the footer
  around a page on the canvas opens it, and so do the Page tab and the
  page switch. The part opened is drawn in its own element, header or
  footer, with the page it was opened from around it, dimmed and locked:
  a click on that page goes back to it.
- **The row of 9 October goes**: a migration makes the parts from it,
  the starters with its words, published, since its values were live,
  and drops the table; a site that never changed them has no row, and
  draws the starters, which hold the defaults it stood in for.

## What it costs

- **A change of the header is not live until it is published**, where on
  9 October it was live when saved. It is what a page does, and the price
  of a preview, a schedule and a way back.
- **The browser demo carries nothing over from 9 October**: the
  migration is the CMS's. A browser that ran a build of that day keeps
  its header and footer in a record nothing reads now, and the parts
  start there from their starters.
- **A page's versions still do not hold the header**: a version restored
  and published is served with today's header and footer.
- **No form in a header or footer**, and a pasted one is refused by the
  CMS at its block, in the part's words.
- **A part published empty means no header**, or no footer, on every
  page: the layout leaves out a part with no section.
- **More to cache**: every page's HTML is keyed on the parts' published
  versions, and each part's blocks are fragments of their own, so the
  first visit after a part's publish draws its changed blocks once.
- **Menu folds on its own block's width**, which the server cannot
  measure: it adds up the widths of the links' letters
  ([header-folds-by-measured-letters.md](header-folds-by-measured-letters.md)),
  and a menu in a column narrower than counted folds a step early.

## The proof

From `cms/`, `ruby bin/rails test test/models/site_parts_test.rb
test/integration/api/pages_test.rb test/integration/api/parts_test.rb
test/integration/public_pages_test.rb test/integration/page_cache_test.rb
test/db/parts_from_the_site_row_test.rb` (after `ruby bin/rails
db:test:prepare`): a part made once with its starter, listed apart, no
address and no home, each refused at its member; a part read, saved,
kept, restored, published and scheduled by a page's routes; a form in a
part refused at its block, and a form left in a stored one refused again
by a publish, a schedule, a version and a restore; the starters drawn
until a part publishes, its version after; a publish of a part a new
page for every browser at its next visit, drawn around blocks read from
the cache; and the row of 9 October made into published parts with its
words.

From `builder/`, `npm run e2e -- site-parts`: in Chromium against a CMS of
its own, a button dragged from Insert into the header's column, saved as
its draft, and published: a visitor's kept page is answered 304 until the
publish and shows the new header at the next visit, the CMS drawing again
the page and the header's blocks that changed. Also the header on a
phone, one row; a footer of words that cannot break inside the window;
menus in other scripts in their row; a form pasted into the footer
refused.

From `builder/`, `npm run test:rails -- rails.rails` and `npm run
e2e:browser -- battery`: the storage battery's cases of the parts on both
adapters, the CMS's and the browser's; and `npm run e2e:browser --
adapter`: a form a broken build left in the footer's draft or version,
refused by the browser's publish, version and restore.
