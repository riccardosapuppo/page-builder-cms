# example-site/

Slack Water, an invented open-water swimming club: the example site, as
page documents, collections, the shop's settings and pictures. It is the
one copy, read as it is by the CMS's seed (`ruby bin/rails db:seed`,
[cms/db/seeds/example_site.rb](../cms/db/seeds/example_site.rb)) and by
the editor's browser demo
([builder/src/storage/example-site.ts](../builder/src/storage/example-site.ts)),
so that both show the same five pages, the same news and the same shop.

- [`site.json`](site.json): the site's name, its images, its collections,
  the shop's settings and its pages, in order.
  - Each image has an `id` (the form of the schema's `mediaId`), its `file`
    under `images/`, and the `alt` text the media library keeps for it.
  - Each collection has an `id`, a whole number from 1, the form of a
    Collection list's `collection`, and its `file` under `collections/`.
  - `shop`, the shop's settings as the editor's API takes them
    (`enabled`, `currency`, `productsCollectionId`, `priceField`): on, in
    pounds, selling the collection whose `id` is 2, Club kit, by its
    field `price`. A seed sets them only while the site's were never
    changed, and names the collection by the id it was made with.
  - Each page has its `slug`, its `file` under `pages/`, and whether it is
    the `home` page (exactly one is).
- [`collections/`](collections/): one collection each, as three members.
  `collection` is its definition, valid against
  [the collection schema](../schema/collection.schema.json): its name, the
  prefix of its entries' addresses, its fields and their order. `entries`
  are its entries, each as the editor saves one (`title`, `slug`,
  `values`), in the order they are made. `template` is its template's
  document, valid against [the page schema](../schema/block-document.schema.json),
  which draws each entry at `/<prefix>/<slug>`.
  - `news.json`, News, at `/news/<slug>`: the Articles preset's fields
    (a summary, an image, a body, a date), ordered by the date, newest
    first, and five entries of the club's autumn, each with one of the
    pictures below: the tide table by the hut door, bright caps for the
    dark mornings, tea in the hut on Sundays, a rockpool morning for
    children, and the winter series's first swim. Its template draws the
    entry's day, its title as the page's heading and its summary in a
    deep-water band beside its picture, its body on paper, then "More from
    the club", a Collection list of the same collection on the pale sea,
    two of its other entries in a grid of two (a list leaves out the entry
    its page draws), and the way to all the news.
  - `shop.json`, Club kit, at `/shop/<slug>`: the Products preset's fields
    (a summary, an image, a body, a price from 0 to 100,000 and the
    in-stock toggle the shop reads), ordered by name, and four products
    of the hut, each with one of the pictures below and its alt words
    from `site.json`: a swim cap (£12, `g-caps`), a tow float (£24,
    `mark-1-shallows`, the orange float), the enamel mug (£9.50, `m-tea`,
    out of stock, to show it) and a pass for five Sundays of the winter
    series (£25, `m-winter`). Its template draws the product's picture
    beside its title as the page's heading, its price, its summary and
    Add to cart in a deep-water band, its body on paper, then "More from
    the club shop", a Collection list of the same collection on the pale
    sea, two of its other products in a grid of two with their prices,
    and the way to all the club kit.
- [`pages/`](pages/): one page document each, valid against
  [the schema](../schema/block-document.schema.json). An image is named by
  its `id` in `site.json`, never by a library's id, and a Collection list
  names its collection by its `id` there, never by a storage's: whoever
  loads the site uploads the images and makes the collections first, and
  puts the ids they were given in their place.
  - `home.json`, at `/`: the course a beginner swims, from the shallows
    out to the buoy line. The trial swim's form works in the first band;
    then the beginners' course, its four marks on one waterline, when the
    club swims (at slack water, with two days of tide drawn), the winter
    series, the pictures, the bay, the questions and a close.
  - `winter-series.json`, at `/winter-series`: the winter series. Its
    title in the first band, beside the jetty in winter; then what to
    bring, beside the tea; when and where, three facts each under a rule;
    a winter Sunday, its three steps numbered (a steps block); entry,
    three figures (stats) above two plans (pricing), one Sunday or the
    whole series, whose buttons go to the trial swim's form (`/#join`);
    and a quote, with the way back to the club.
  - `news.json`, at `/news`, News's own prefix: the page of the section.
    Its title and a lede in the first band; then, under "From the
    slipway", every entry of News, newest first, one under another, each
    with its picture, its day and its summary; then the way to a trial
    swim. The footer's More pages menu links it.
  - `shop.json`, at `/shop`, Club kit's own prefix: the shop. Its title
    and a lede in the first band; then, under "Club kit", every product,
    by name, in a grid of four, each with its picture, its price in
    pounds and its summary; then the way to the cart. The footer's More
    pages menu links it; the header does not, whose fold is measured for
    its own links.
  - `notices.json`: a page that breaks assumptions on purpose: four
    columns, a word too long for any line, emoji, right-to-left text, nested
    lists, a long alt text, a dark band, a heading hidden on phones.
- [`images/`](images/): the fifteen pictures, PNG. Nobody photographed them:
  `node tools/seed-images.ts` (from the repository root) draws each from
  the design's SVG of the same name (`design/img/`) in headless Chromium,
  and `--check` draws them again and compares the bytes. The news and the
  shop use them again; they have none of their own.

Both seeds put the site in the same order: the pictures, then each
collection with its template and its entries, then the shop's settings,
then the pages, then the header and footer. The video and the map keep the
card that loads the third party only when a visitor clicks it: their
documents hold a provider's id and coordinates, never an address.

Nothing here names a real person, company or brand. The video's id is
invented, and the map's point is an arbitrary stretch of coast.

## What holds these files

- [cms/test/integration/seed_test.rb](../cms/test/integration/seed_test.rb):
  the seed on an empty database, then again on its own result, which
  changes nothing; each page stored exactly as its file, with the
  library's ids and the collection's own id; each collection as its file
  has it, each entry published, its template published, `/news`, `/shop`
  and an entry's page served; the shop on, in pounds, selling Club kit by
  the id it was made with, a product's price as money and its Add to
  cart, the mug out of stock, the shop's page listing the four with their
  prices, and the shop an owner turned off left off; a collection at the
  shop's prefix its owner made with no price left unsold, the seed saying
  why; a page or a collection changed since left as it is; and a file the
  seed cannot read (an image or a collection `site.json` does not list,
  shop settings naming no collection of it or holding a member the shop
  does not take, two home pages, a path out of the folder, a collection's
  file of another shape) refused before anything is uploaded or saved.
- [builder/src/storage/example-site.test.ts](../builder/src/storage/example-site.test.ts)
  (`npm test` in `builder/`): the browser demo's seed in the same order,
  its ids swapped the same way, the shop's settings set once the
  collections are in and left as they are when changed, the same
  refusals, a seed cut short finished by the next visit with nothing put
  in twice, and the demo's edition, a digest that changes with any of
  these files, the shop's settings among them.
- `npm run compare:examples` in [schema/tools/](../schema/tools/): both
  validators, the editor's and the server's, call every page and each
  collection's template valid and normalise each the same way, through
  the corpus's own comparison ([schema/README.md](../schema/README.md)),
  and then each collection's definition with each of its entries, through
  the collection corpus's. CI runs it in the schema job.
- [builder/test/example-site.rails.test.tsx](../builder/test/example-site.rails.test.tsx)
  (`npm run test:rails` in `builder/`): the collections made through the
  CMS's API, then each page saved there, its preview and its published
  page compared with React's render of the same document given the same
  entries, and each entry's page with React's render of the template, as
  the render contract compares them ([contract/README.md](../contract/README.md)).
- [builder/e2e/example-site.spec.ts](../builder/e2e/example-site.spec.ts)
  (`npm run e2e` and `npm run check:a11y` in `builder/`): `db:seed` run
  against the browser tests' own CMS, then each page, an entry's page and
  a product's page in Chromium, with its heading, no serious or critical
  axe finding at 1440 and 390 pixels wide, and no sideways scroll at 320;
  and the cart, empty and with two caps and a float put in from their
  pages, and the page a visitor comes back to from the tests' fake
  Stripe, before the order is paid and once it is, held to the same, and
  every control of the cart's band 44 pixels each way for a finger.
  Planted, a text in the `soft` colour on the notices page fails axe's
  colour contrast, and the site's `overflow-wrap` taken away makes the
  notices page 579 pixels wide at 320. axe lists one finding of moderate
  impact, on the notices page alone, `heading-order`: the design gives an
  icon box's title an `h3`, and there a band of icon boxes comes before
  any `h2`.
