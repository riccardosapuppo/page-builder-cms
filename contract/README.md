# contract/

The render contract between the two renderers of a page: the server's
(Rails, the block partials in `cms/app/views/blocks/`), which writes every
published page, preview and 404, and the editor's (React, stage 2), which
draws the same document on the canvas. What the editor shows must be what a
visitor reads, so both are held to the same output for the same documents.

**This folder holds the server's half**: the fixtures, and the goldens
the server writes for them. The editor's half is
`builder/src/render/render.contract.test.tsx` (below).

## What is here

- [`fixtures/`](fixtures): page documents, as JSON.
  - `traps-text.json`: headings, rich text, buttons, icon boxes, quotes,
    accordions, stats, steps and pricing tables whose text holds markup,
    entities, quotes and line breaks, with `javascript:`, `data:`, `//host`
    and backslash links in every place a link can be (a pricing plan's
    button takes each kind a button block's link does), and unicode
    (combining marks, emoji sequences, right-to-left text, a no-break
    space, repeated spaces); stats, steps and pricing tables whose items
    are no object, or whose list is none; and pricing plans whose features
    are no list or hold what is no text, whose button is no object, whose
    featured is no boolean, and whose badge is on a plan not featured.
  - `traps-media.json`: images from the library, from another site, a site
    path, decorative, deleted, and with `javascript:`, `data:` and `http:`
    sources; a gallery mixing all of them; videos from both providers, an
    unknown provider and an id that is markup; maps in range, zoomed all the
    way out, out of range, and with coordinates written as strings.
  - `traps-structure.json`: every style key on every device, values the
    schema does not list (and `sectionSpace`, the key `spaceAbove` and
    `spaceBelow` replaced), image crops, column-width presets that fit
    their section and presets that do not, blocks hidden per device, one
    to five columns,
    and blocks out of place (a section in a column, a widget where a section
    goes, an unknown type, a string where a block goes).
  - `traps-site.json`: the blocks a header is made of: logos with a
    name, with none, with a name that is a number or empty; menus whose
    labels hold markup or letters of other scripts, of long links, with a
    link the renderers refuse, with no link, with items that are no link,
    with no name; and sections whose columns fit what they hold and stack
    on phones only or never, with what the renderers ignore (a stacking
    for one column, a stacking no device knows, a preset for another count).
  - `traps-form.json`: forms with every kind of field, required and not;
    labels, a button's text and a field's name holding markup, a block id
    that closes its attribute, a label of 230 characters with no space;
    fields the renderers leave out (a password, a hidden value, a file, no
    name, an empty name, a name that is a number, no kind, items that are
    no object); and limits the schema refuses (zero, negative, past the
    kind's most, a string, 100.5), with 100.0 and 1e2, which both read as
    the whole number 100.
  - `site-own.json`: classes of the site's own and anchors on every kind
    of block, written after the theme's classes and as the element's id,
    and the values the renderers refuse: a theme's class in any case, a
    name that is no class name, blanks other than one space, a name twice,
    a class or an anchor that is no string, an anchor in upper case.
  - `free-colors.json`: colours of the site's own (`#rrggbb`) on every
    block that takes a background or a colour, on every device, beside
    slots, and the values the renderers refuse (upper case, three digits, a
    colour's name, markup): a refused one draws nothing.
  - `free-type.json`: type of a block's own on a heading, a text and a
    quote, every key on every device at both ends of its range, beside a
    step and a typeface, some written as integral floats (`700.0`, `1e2`,
    `-0.0`); and the values the renderers refuse: a size past its unit's
    range or written another way (`48PX`, `48.50px`, `.5rem`, `3em`), a
    declaration, a rule, `calc(`, `url(` or markup in a size, a third
    decimal, numbers and sizes of the wrong kind, and free type on a column
    and a button, which take none. A refused value is no attribute, and is
    not in `data-style`.
  - `collections.json`: Collection lists of every layout, order and
    filter, with the collections they draw from: entries ordered by a
    day, a number, a title (a fullwidth letter and an emoji, where code
    points and UTF-16 units disagree) and a field no order follows,
    filtered by a toggle and by a choice; card fields of the wrong type;
    a collection that is not there, and none chosen; entries whose words
    hold markup, whose slug makes an address the URL policy refuses,
    whose values are of other types than their fields, and entries no
    list can draw; props the schema does not list; and a Field block on a
    page that is no template, which draws nothing.
  - `shop.json`, `shop-page.json`, `shop-off.json`,
    `shop-out-of-stock.json`, `shop-no-price.json`,
    `shop-other-collection.json`, `shop-sample.json`: the shop's settings
    beside a fixture's content (`shop`), and what it draws: a product's
    template, in pounds, euros or dollars, its price as money by a Field
    block and its other number as a number; Add to cart with a quantity
    and without, every setting a button takes, words holding markup and
    props the schema does not take; out of stock and with no price, the
    words where the button goes; nothing for the shop off, another
    collection's entry, values made up with no entry and a page; lists of
    the products, their cards' prices as money (nothing, the most a
    number field keeps, and values no price can be), a card's number that
    is not the price, another collection's, and a price card member
    naming a field of another type.
  - `template.json`: a collection's template drawn with an entry: its
    title as a heading of every level and as a paragraph, a field of
    every type drawn as its type draws it, values holding markup and
    refused addresses, a value the entry does not have, values of other
    types than their fields (a day that does not exist, a number with
    three decimals), a key no field has, a level out of range, a field
    with every setting of every widget it may draw as, and a Collection
    list of the entry's own collection beside them, which leaves the
    entry out.
  - `edge.json`: the smallest values, every icon, an empty section, a block
    with no props and no style, spaces at both ends of a text.
  - `empty.json`: a page with no sections.
  - `large-500.json`: a page of exactly 500 blocks, written by
    `node tools/gen-contract-500.ts` from the repository root (seeded, so
    every run writes the same bytes; `--check` compares).
- [`custom-css/`](custom-css): the site's custom CSS, checked the same
  way by the editor (`custom-css.ts`) and the CMS (`CustomCss`):
  `cases.json`, each case's stylesheet and the problem both must find,
  or none, and the stylesheet as the page draws it.
- [`shop/`](shop): the shop's rules, the same on both sides, the editor's
  and the browser's storage's (`builder/src/shared/shop.ts`) and the
  CMS's (`ShopRules`): `cases.json`, the shop's settings and the faults
  both must find in them at their pointers, keywords and words, a price
  in the smallest unit of its currency and an amount in the site's words,
  a cart as it is kept, a change of it, and a cart priced from what its
  products published. Not the CMS's own refusal of a shop turned on over
  a page or a collection that holds `/cart`, which reads the pages and
  which the browser's storage, serving no address, never makes
  (`ShopSetting`, `docs/decisions/shop-on-collections.md`).
- [`cart/`](cart): the cart's pages, which no document holds, drawn by
  the CMS (`app/views/cart/`, `CartHelper`, `CartPage`) at `/cart` and
  `/cart/thanks`, and by the browser demo (`builder/src/demo/cart-view.tsx`
  and `cart-page.ts`) from the browser's storage: `cases.json`, the
  products collection, its products as they went live, and five pages
  (a cart with a line of every kind, for sale with a picture and
  without, a title holding markup, out of stock, with no price and a
  decorative picture, gone, and a picture the library no longer has;
  one with nothing for sale and a refusal said above it; an empty one;
  one refused before it was read; and an order's lines as they were
  sold), and `<case>.html`, `<main>`'s content as the CMS draws it,
  written by `UPDATE_GOLDEN=1 ruby bin/rails test
  test/contract/cart_goldens_test.rb`, which also holds the CMS to it.
  Each side prices the cart by its own twin of the shop's rules; the
  demo's `cart.contract.test.tsx` gives each golden's tree under the
  render contract's normalization, and nothing else.
- [`free-colors/`](free-colors): the stylesheet of a page's free colours
  (`/colors/<digest>.css` on the CMS, a style element on the canvas), for each case
  of `cases.json`: `<case>.css`, written by
  `UPDATE_GOLDEN=1 ruby bin/rails test test/models/free_colors_test.rb`,
  the bytes the editor's `free-colors-css.ts` must give too.
- [`free-type/`](free-type): the stylesheet of a page's free type
  (`/type/<digest>.css` on the CMS, a style element on the canvas), the
  same way: for each case of `cases.json` (the values each key takes on
  each device, the traps among them), `<case>.css`, written by
  `UPDATE_GOLDEN=1 ruby bin/rails test test/models/free_type_test.rb`, the
  bytes the editor's `free-type-css.ts` must give too.
- [`rendered/`](rendered): for each fixture, the HTML the server renders
  for it (`<name>.html`, the page's sections, without the layout), and
  `manifest.json`, with the sha256 of every fixture, every golden and every
  source file of the server's renderer.

Not every fixture is a document the server would store: the schema refuses
most of these traps before a document is saved. They are here because the
renderer is the last line, for a document that reached it some other way,
and because both renderers must fail the same way. `large-500.json` is
valid, and a test says so.

## The rules both renderers follow

- Every block's root element carries `data-block-id` and `data-block-type`;
  a section also `data-columns`, and `data-column-widths` when it names a
  preset with one part per column it holds (`3:2` on two columns; a preset
  for another count is ignored, never stretched), a spacer `data-size`, an icon box
  `data-icon`, a library image `data-media-id`, a video `data-provider`.
- `data-style` repeats the block's stored style, canonically:
  `base.textSize=display;phone.textSize=heading-1`, devices in the order
  base, tablet, phone, keys sorted, only values the schema's enums list, a
  colour of the site's own, and free type as the page writes it
  (`base.fontWeight=800;base.letterSpacing=-0.02`), from the number read.
  Free type is carried by `data-font-size`, `data-font-weight`,
  `data-letter-spacing`, `data-line-height` and `data-font-stretch`, and
  their `tablet-` and `phone-` forms, as free colours are by `data-bg`.
  The classes the style becomes (`size-display phone-size-heading-1`) are
  for the CSS; the comparison reads `data-style`.
- Addresses go through RenderPolicy (`cms/app/models/render_policy.rb`):
  an address it refuses is dropped and the text around it kept. A video or
  map address is built from the provider and id, or the coordinates; no
  stored string is ever used as one.
- A map address writes its numbers (the area's four edges and the marker)
  with six decimals the way Ruby's `format("%.6f")` writes them
  (`RenderPolicy.decimal`), and the editor copies that way, quirk included
  (`decimal` in `builder/src/render/policy.ts`). It is deterministic, but
  not always the exact value correctly rounded: Ruby takes a remainder
  within its arithmetic's error of one half as exactly half way, and
  rounds that to the even digit. So 149.8070625000000007 is 149.807062
  where correct rounding gives 149.807063, and 0.0078125 is 0.007812 where
  JavaScript's `toFixed` writes 0.007813. The difference is one unit of the
  sixth decimal, about 0.1 m on the map, and both renderers write the same
  text, which is what the contract needs. **Change both sides or neither:**
  rounding correctly in Ruby, or using `toFixed` in the editor, would give
  the canvas and the page two addresses for one map, and
  `builder/src/render/policy.test.ts` (fixed values, these two among them),
  `twins.rails.test.ts` there (thousands of numbers through Ruby itself)
  and the random-page agreement check would fail.
- No text a visitor reads names a provider. The video card says "Loads a
  video from the provider when you click", as the approved design does;
  the provider's id stays in the document and in `data-provider`. A test
  reads the visible text of every golden (text, title, alt, aria-label,
  placeholder) for the providers' names and a list of other brands; on
  the goldens as they were before this rule it found YouTube and Vimeo in
  three of them, one in a fixture's own video title.
- The tree is strict: sections hold columns, columns hold widgets; a block
  anywhere else, or of an unknown type, is not rendered.
- A fixture may carry, beside its document, what a page is drawn with:
  `collections`, the collections its Collection lists name, each its id,
  prefix, fields and published entries; `entry`, the entry its Field
  blocks draw (its collection's fields, its title, slug and values, and
  its id and its collection's, by which a list leaves it out); and
  `shop`, the shop's settings (`enabled`, `currency`,
  `productsCollectionId`, `priceField`), by which a price is money and
  Add to cart draws. The server reads them through `ContractContent`
  (`cms/test/support/contract_content.rb`), as `SiteContent` gives them
  on a real page, and the editor through `contractContext`
  (`builder/src/render/contract.ts`), as the canvas gives them. A
  fixture with none draws every list's empty words, no field, every
  price as a number and no Add to cart.
- An amount is written with its currency's sign, a comma between
  thousands and its two decimals (`£1,250.50`): `ShopRules.money_words`
  and `moneyWords` of `builder/src/shared/shop.ts`, read for a price by
  `ShopWords` and `builder/src/render/shop-words.ts`; Add to cart's
  form by `AddToCart` and `builder/src/widgets/addToCart/drawing.ts`.
  The safety check lets Add to cart's form through, sent to the cart's
  own address, `/cart/items`, and nowhere else.
- A day is written from a table of month names, not a locale's
  (`15 October 2026`, the day, the month's name and the year), and a
  number with its thousands grouped and no zero
  ending its decimals (`1,250.5`): `EntryWords` and
  `builder/src/render/entry-words.ts`. Entries are ordered by
  `EntryOrder` and `builder/src/shared/entry-order.ts`: ties by when each
  entry was made, a title by its code points.
- Library images resolve through a stub, never signed ids (which depend on
  the app's secret): every `mediaId` is `/media/<id>.png`, 800 by 600,
  except an id starting with `missing`, which has no image
  (`cms/test/support/contract_media.rb`).

## Commands

From `cms/`:

```
ruby bin/rails test test/contract/goldens_test.rb
UPDATE_GOLDEN=1 ruby bin/rails test test/contract/goldens_test.rb
```

The first renders every fixture and fails on any byte that differs from
its golden, naming the line and column; it also fails when a golden has no
fixture, when there are fewer than 6 fixtures or one of the 23 block types
is missing from them, and when `manifest.json` does not match the files
(a renderer source changed without the goldens being written again). The
second writes the goldens and the manifest. Read the diff before
committing it: a golden that changes is a page that changes.

It can fail: with one heading partial planted to mark its text as safe
instead of escaping it, the run failed on `traps-text.json` and on
`large-500.json`, both of which carry `<script>` in a heading, and on the
stale manifest.

## The editor's half

From `builder/`, `npm run test:contract` (also part of `npm test`):

1. checks the goldens are usable: a golden for every fixture and no
   other, and every sha256 of `manifest.json` (fixtures, goldens and the
   renderer's sources, from the same list as the server's test) equal to
   the file's; otherwise it compares nothing;
2. renders each fixture with the editor's React renderer
   (`builder/src/render/`), with the same media stub;
3. parses both with parse5, inside a `<main>` as on the page, and compares
   the trees node by node, with exactly this normalization:
   - the `"\n"` each partial writes after a block's root element is
     dropped (React writes none, and between blocks it draws nothing);
   - attributes are compared as a set, in any order;
   - a boolean attribute is compared by its presence (`open="open"` and
     `open=""` are both open);

   every element, attribute value, class list and character of text is
   compared as it is;
4. runs the safety check on both sides: no `<script>` or other element that
   loads or runs something, no `on*` attribute or `srcdoc`, no
   `javascript:`, `vbscript:` or `data:` address in any attribute that
   holds one (read as a browser reads it), and frames only from the URL
   policy's origins.

It runs on React's production build. On 2 October 2026, on the machine of
the server's timing below with Node 24.19.0, the test printed a median of
70.8 ms for the 500-block page (30 renders after 5 warm-ups); the same
renders on the development build, measured once in the unit project, had
a median of 1383 ms. Other programs had the CPU 93% busy when sampled
right after: an order of magnitude again. Its 3691 nodes were the same as
the golden's.

The random-page agreement check
(`builder/test/render-agreement.rails.test.tsx`) does the same for random
valid pages, saved through the API and compared with the
preview the CMS serves; there the line breaks of the page's layout and
view around the sections are left out too.
[`builder/test/example-site.rails.test.tsx`](../builder/test/example-site.rails.test.tsx)
holds the example site's three pages ([`example-site/`](../example-site/),
which the seed loads) to the same comparison, in the preview and
published; with React's bold drawn as `<b>`, the two pages that have bold
text fail.

## Timing the server's render

`RAILS_ENV=test ruby bin/rails contract:bench` times the render of
`large-500.json` (30 renders after 5 warm-ups). On 1 October 2026 it gave
medians of 123.7, 124.0 and 131.0 ms in three runs, on an Intel Core
i5-7200U (2 cores, 4 threads) under Windows 11, Ruby 3.4.10 without YJIT,
with the CPU at 3 to 13% busy when sampled before and after but other
programs running: an order of magnitude, not a measurement to quote.
Fragment caching, which stage 4 adds, is what a visitor will mostly meet.
