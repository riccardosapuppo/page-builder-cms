# src/render/

The document drawn with React: the editor's twin of the server's renderer
(the block partials in `../../../cms/app/views/blocks/` and their helpers),
held to it by the render contract (`../../../contract/README.md`). One
renderer, used three ways: the canvas (with the editor's decoration), the
preview, and the tests that compare it with the server.

It may import `../shared/`, `../document/json.ts` and `../widgets/`; the
widgets import its helpers. Nothing here talks to a server.

| File | What it is | The server's twin |
| --- | --- | --- |
| `blocks.tsx` | `PageSections`, the walk of the tree (page > section > column > widget, anything else left out), the section and the column, each block a memoised `BlockView` | `render_document`, `render_blocks`, `_section`, `_column` |
| `page.tsx` | `PageRoot`, the page root (`.site` > `.sw` > the sections, with the theme's header and footer when given), its width and the site style's data attributes | the layout's `.site`, `site_style_data` |
| `theme.tsx` | `SiteHeader` and `SiteFooter`, the theme's parts around every page | the layout's `<header>` and `<footer>`, `site_link` |
| `block-root.tsx` | `BlockRoot`, every block's root element: classes, `data-block-id`, `data-block-type`, `data-style`, the type's data; and the defensive reading of props | `block_root`, `block_props`, `prop_text` |
| `style.ts` | A style as classes (`pad-l`, `tablet-pad-l`, `hide-phone`) and as `data-style` | `BlockStyle` |
| `policy.ts` | The URL policy: links, images, players, maps, anchors | `RenderPolicy` |
| `rich-text.tsx` | Rich text, through TipTap's static renderer | `RichTextHelper` |
| `media.tsx` | Images of image blocks and gallery items, and the contract's media stub | `block_img`, `ContractMedia` |
| `drawings.tsx` | The icon box's icons (`virtual:site-icons`, read from `schema/icons.svg` by `../../build/site-icons.ts`), the theme's drawings, text with line breaks | `site_icon`, `theme_svg`, `text_with_breaks` |
| `context.ts` | What a renderer receives: the media resolver, the decoration hook | |

## Using it

```tsx
<PageRoot document={page} ctx={{ media }} siteStyle={style} width={PREVIEW_WIDTHS.tablet} landmark={false} />
```

- **`ctx.media`** answers a `mediaId` with `{ src, width, height }` or
  `null`. It is injected because the answer depends on where the editor
  runs; the page's own answer is Active Storage's proxy route with a signed
  id, which only the CMS can make. The media library's `url` (the redirect
  route) serves the same bytes (shown by the random-page agreement
  check), so the canvas can use it: the image is the same, its address is
  not.
- **`ctx.useDecoration(block)`**, the canvas's only way in: a hook called
  once in each block's render, returning attributes and handlers for the
  block's root, a `ref`, and what to draw inside it after the block's
  content (the floating bar, an empty column's drop zone). The page's own
  attributes win over any of the same name, and nothing replaces a
  block's content. Without it, the render is the page's.
- **`width`** sets the page root's width: the editor's previews,
  `PREVIEW_WIDTHS` of `../shared/preview-widths.ts` (from
  `schema/tokens.json`), lay it out as a tablet at 768 and as a phone at
  390, in any window, because the page's stylesheets
  (`../shared/site.css`) set their container queries on `.site`. The
  canvas passes `landmark={false}`, so the sections sit in a plain block
  instead of a second `<main>` in the editor's page.
- The site's header and footer (`theme.tsx`) are the server's
  (`cms/config/site.yml`), which `GET /api/site` gives: given them,
  `PageRoot` draws the header above the sections and the footer below, as
  the layout does; the canvas draws them locked (`inert`, and
  `data-theme-part` on each). `../../test/theme.rails.test.tsx` holds
  their markup to the CMS's own.

## What it promises

- **The same markup as the server**, for any document, valid or not: the
  same elements, classes, attributes and text, from the same reading of
  every key (a level out of range is a level 2, an unknown icon draws no
  icon, a string where a number goes is no number).
- **Addresses as the server writes them.** A map's numbers in particular:
  Ruby's `format("%.6f")` takes a value within its arithmetic's error of
  half way as exactly half way and rounds it to the even digit, where the
  exact value would round the other way (149.8070625000000007, from
  `large-500.json`, is 149.807062 in Ruby, 149.807063 exactly and by
  `toFixed`). `decimal` in `policy.ts` makes the same double operations
  to find those values.
- **Rich text through a mapping built once**: TipTap's JSON renderer with
  a node and mark mapping made when the module loads (its ProseMirror path
  builds a schema on every call). Before it sees a document, the document
  is cut to what the server's helper draws: unknown nodes leave with
  their content, unknown marks and refused links leave and their text
  stays, a line break carries no marks, a link keeps its href alone. Marks
  nest in the order they are stored, the first innermost.
- **A change redraws only its path**: pages are never changed in place
  (`../document`), every block is memoised on its object, and a text block
  keeps its rendered text for as long as its document object is the same.

## The checks

| Check | Command | What it holds |
| --- | --- | --- |
| The render contract, `render.contract.test.tsx` | `npm run test:contract` (and `npm test`) | Every fixture of `contract/fixtures` against the server's golden, after the goldens are shown current against the manifest; the safety check on both sides; the 500-block page and its time. React's production build. |
| Its plants, `contract-plants.test.tsx`, `../../test/*.test.ts` | `npm test` | A stale, missing or orphan golden; eleven differences planted in a golden; a policy that lets every link through; twenty pieces of markup a page must not carry. |
| The canvas, `canvas.test.tsx` | `npm test` | React DOM builds the tree the contract compared; the decoration reaches the root only; a change redraws its path and no more. |
| The random-page agreement check, `../../test/render-agreement.rails.test.tsx` and its plants | `npm run test:rails` | Random valid pages saved through the API and compared with the preview the CMS serves, then a published page. `AGREEMENT_RUNS` (60) and `AGREEMENT_SEED` (20261002) set the run. |
| The twins, `twins.rails.test.ts` | `npm run test:rails` | `policy.ts` and `rich-text.tsx` against the CMS's own `RenderPolicy` and `RichTextHelper`, in Ruby, on values the schema refuses too. |
| Layout, `../../test/canvas-parity.rails.test.tsx` | `npm run test:rails` | In headless Chromium, the page roots at 1280, 900, 768 and 390 (the two previews) against the CMS's preview at those window widths: every element's box and computed style. |

The comparison and its normalization are in
`../../test/html-compare.ts`; the safety check in
`../../test/render-safety.ts`; the goldens' freshness in
`../../test/contract-files.ts`.
