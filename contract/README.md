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
  - `traps-text.json`: headings, rich text, buttons, icon boxes, quotes and
    accordions whose text holds markup, entities, quotes and line breaks,
    with `javascript:`, `data:`, `//host` and backslash links in every place
    a link can be, and unicode (combining marks, emoji sequences,
    right-to-left text, a no-break space, repeated spaces).
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
  - `edge.json`: the smallest values, every icon, an empty section, a block
    with no props and no style, spaces at both ends of a text.
  - `empty.json`: a page with no sections.
  - `large-500.json`: a page of exactly 500 blocks, written by
    `node tools/gen-contract-500.ts` from the repository root (seeded, so
    every run writes the same bytes; `--check` compares).
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
  base, tablet, phone, keys sorted, only values the schema's enums list.
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
fixture, when there are fewer than 6 fixtures or one of the 17 block types
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
