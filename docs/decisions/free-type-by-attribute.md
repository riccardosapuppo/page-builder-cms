# A block's own type is drawn by data attribute, and a vw is the page's width

Decided on 15 October 2026, with free type, at the owner's request: a
heading, a text or a quote may set its own size, in px, rem or vw, its
weight, letter spacing, line height and letter width, where until then
its type came from presets only (a step of the type scale, a typeface,
the site's letter width).

## The question

A page's look was tokens: names the schema lists, each a class of
`tokens.css`. Type of a block's own is free values: a size from 8 to 320
pixels, any of thousands. Three things hold how it can reach a page:

- **The published pages run no script and take no inline style.** Their
  Content-Security-Policy says `style-src 'self'`, with no
  `'unsafe-inline'`, so a `style` attribute is not applied.
- **The canvas draws the page without an iframe**, 768 or 390 wide for a
  tablet or a phone inside a window that is wider, its container queries
  on the page root (`.site`). A size in vw there would be a hundredth of
  the editor's window, not of the page the canvas shows.
- **The two renderers must write the same bytes** for the same document
  (the render contract), and the two validators give one verdict (the
  corpus).

There were three ways to draw a free value:

- **An inline style** (`style="font-size: 6vw"`): the pages' policy blocks
  it, and opening the policy to inline styles opens it to whatever a
  document holds.
- **A class per value**, written into `tokens.css`: nine weights would do,
  but a size has tens of thousands of values, a number of spacing,
  height and width thousands more.
- **A data attribute and a stylesheet written for the values the page
  uses**, as the free colours of 14 October are drawn.

## The decision

- **Five style keys, each over its own property only**, per device as
  every style key is: `fontSize`, `fontWeight`, `letterSpacing`,
  `lineHeight`, `letterWidth`. A key left unset is the preset's: a block
  with a size of its own keeps its step's line height and its face's
  weight.
- **Strict values, held by both validators.** A size is one string, a
  number with two decimals at most and a unit of three, written one way
  (`48px`, `2.5rem`, `6vw`); a weight one of nine numbers; the other
  three numbers. The schema holds their shapes and the numbers' ranges.
  What it cannot hold, the application rules do, in TypeScript and in
  Ruby: how far a size goes in its unit (`sizeRange`: 8 to 320 px, 0.5 to
  20 rem, 0.5 to 25 vw), and two decimals at most (`decimals`), which only
  a fractional `multipleOf` would say, and the two engines read one
  differently.
- **Drawn by data attribute and a written stylesheet.** The block's root
  carries each value (`data-font-size="6vw"`,
  `data-tablet-font-weight="700"`), and a stylesheet sets the property for
  it, per device inside the page's own container queries. Every rule is
  written from the number read and a unit of a closed list, never from a
  document's text, so no CSS of a document's making reaches the page. The
  CMS keeps each sheet once under its digest and links `/type/<digest>.css`
  (the free colours' table holds it; each address serves only its own
  kind); the canvas puts the same bytes in a style element. The policy
  does not change.
- **A vw is the page's width.** The stylesheet writes a vw as `cqw`, a
  hundredth of the width of the nearest size container, which for a
  heading, a text or a quote is the page root: `site.css` makes `.site`
  the container every query of the page asks, and the only other one, a
  menu block, holds no block. On the published page that is the page's
  width; on the canvas, the page's 768 or 390 as the device shows it.
  The editor offers and stores "vw", the word a person knows.
- **A block's own value wins, a device's over the desktop's.** A
  desktop's rule weighs two (`.w[data-font-weight="800"]`), as much as the
  face classes of `tokens.css`, and comes after it; a device's weighs
  three. So a value of the block's own holds over its step and its face on
  every device, whatever typeface a tablet gives it, and a tablet's own
  over the desktop's.
- **The panel offers what the face draws.** Archivo, the headings' face,
  draws every weight from 100 to 900 and widths from 62% to 125%; Source
  Serif 4, the body's, from 200 and one width, so in it the letter width
  is a line saying so, not a control that would do nothing. The faces'
  axes are read from the font files by a test.

## What it costs

- **One more stylesheet** for a page that sets free type, cached for good.
- **A vw is not quite the browser's.** On a window that draws a
  scrollbar, the page is narrower than the window, and 6 "vw" is 6% of
  the page. That is what the canvas shows; the browser's own vw would be a
  few pixels larger.
- **A rem is the root's size**: 16 pixels on the canvas, and the
  visitor's own on the page where their browser sets another, as text
  sized in rem should.
- **A site's own CSS can move a vw.** A rule that makes a section or a
  column a size container makes a vw that container's hundredth.
- **A sticky header counts type of a block's own** at its size and line
  height, a rem at 16 pixels and a vw at the widest page of the device,
  1920 for a desktop: in a wider window a heading sized in vw can grow
  past the rows counted for it.
- **Values outside the tokens.** A page can be less of a piece than the
  scale keeps it; the preset stays what a block starts with, and Back to
  the preset is one click.
- **A quote's caption keeps its own letters.** A quote's letter spacing,
  made at the quote's size, reached its caption; `site.css` now gives the
  caption `letter-spacing: normal`, which also ends the headings' face's
  tracking there.

## The proof

From `schema/tools`, `cms` and `builder`:

```
npm run corpus && npm run compare
UPDATE_GOLDEN=1 ruby bin/rails test test/models/free_type_test.rb
ruby bin/rails test test/models/free_type_test.rb test/integration/free_type_test.rb test/contract/goldens_test.rb
npx vitest run --project unit --project contract src/shared/free-type src/render src/editor/panels
E2E_CMS_PORT=3921 npx vitest run --project rails test/canvas-parity.rails.test.tsx src/render/twins.rails.test.ts
E2E_CMS_PORT=3921 E2E_BUILDER_PORT=4921 npx playwright test -c e2e/playwright.config.ts e2e/type.spec.ts
```

- **The corpus** has free type with every key on every device at both
  ends of each range, written as integral floats too, and 42 traps: a
  hundredth past each end, a third decimal, a size written another way or
  in a unit the schema does not list, a size holding a declaration, a
  rule, `calc(`, `url(` or a newline, and free type on a button and a
  column. Both validators give each the same verdict, at the same pointer
  and keyword.
- **The stylesheet's shared cases** (`contract/free-type/`) are the same
  bytes from both writers, traps among them; the render contract's
  `free-type.json` the same attributes and `data-style`. The twins test
  runs both sides' sticky header rows on thousands of generated headers
  with sizes and line heights of their own.
- **The canvas parity test** lays a page with sizes in vw out on the canvas
  and on the CMS at 1280, 900, 768 and 390, every element's box and type
  the same. With a vw planted as written (vw, not cqw), the canvas's four
  pages, drawn side by side in a window 1400 wide, took their sizes from
  the window, and the test found them apart from the CMS's.
- **The weights** are held by planting too: with the desktop's rule
  weighing one, a heading set in the headings' face by name drew the
  face's 700 over its own 800, and the browser test failed.
- **The browser tests** set each value in the Type group, see it on the
  canvas and on the published page, measure 6 vw on the canvas's tablet
  (46.08 pixels, 6% of 768), and the tablet's own 5 vw there and in a 768
  window alike, hold a tablet's and a phone's own values to their widths,
  and mark a refused size on its field; axe finds nothing serious with the
  group open.
