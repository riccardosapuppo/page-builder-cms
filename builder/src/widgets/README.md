# src/widgets/

One folder per widget, named as its `type` in the schema: `heading/`,
`text/`, `image/`, `button/`, `divider/`, `spacer/`, `gallery/`, `video/`,
`map/`, `iconbox/`, `quote/`, `accordion/`, `form/`. Each holds:

- `definition.ts`: the type, its group and label in the Insert drawer and
  the "+"'s picker (the
  label is `TYPE_NAMES` of `../document/labels.ts`, the history's too),
  the tile's icon, what the panel must have before it can add one
  (`needs`), the props of a new one, the renderer, and its **traps**: the
  ids of the blocks in `contract/fixtures` that hold what this widget must
  survive (markup in its text, refused addresses, values the schema does
  not list);
- `render.tsx`: its React renderer, the twin of the server's partial,
  built on `../render`'s helpers and held to the partial by the render
  contract;
- `icon.ts`: its tile, the approved design's `w-<type>` symbol
  (`design/index.html`), shape for shape;
- `panel.tsx`: its own group in the editor's sidebar, first in the Block
  tab and named after what it holds ("Text", "Button", "Questions"; none
  for a divider, whose one setting is its line's colour), and further
  groups of its own after it when one would hold too much (a form's
  Fields, then its Button and message), whose controls make the widget's
  own commands; and `panel.test.tsx`, which drives
  those controls, checks the page and the command, and finds the
  server's 422 on the field it names. The groups of its style settings
  and Shown on are drawn for every block (`../editor/panels/groups.tsx`)
  from the style settings the type accepts;
- `a11y.ts`: its accessibility test (below).

`panels.ts` lists the panels by type, apart from `registry.ts`: the render
contract and the random-page agreement check load the registry and have
no use for the editor's controls.

Each folder's `a11y.ts` is the widget's accessibility test, as data
(`a11y.ts` here has its shape): cases, each a block's props and what a
screen reader must find in it, by role, name and level, and for a form's
field whether Chromium's accessibility tree says it is required; or
nothing at all for a hidden one. `a11y-all.ts` lists them in the panel's
order. `../../e2e/widgets.spec.ts` publishes every case on a CMS of its
own and holds the page it serves, and the editor's canvas, to them, with
axe finding nothing serious or critical (`npm run check:a11y`). A form's
refused answer, with each message tied to its field, exists only on the
page the server draws again for it, so the server's view test holds it
(`cms/test/views/blocks_test.rb`).

`types.ts` has the definition's type and `newWidget(definition, id,
input)`, which makes a new block: `{id, type, props, children: [], style:
{base: {}}}`. `registry.ts` lists the definitions in the panel's order
(Basic, Media, Content, Forms, as the design has them), the renderer of
each type, and the Layout group's tiles (a section, with one to four
columns).
`icon.tsx` draws a tile (`WidgetIcon`) with the renderer's SVG drawer,
`shapeElements` of `../render/drawings.tsx`.

## New widgets

A new block is valid from the moment it exists. Most widgets start from
props of their own ("Heading", a spacer of size M, a map of a shore).
Three need something first, and their definition says which:

| Widget | `needs` | The input |
| --- | --- | --- |
| Image | `"image"` | one image: `{mediaId, alt}` once its upload has finished, or `{url, alt}`; or decorative |
| Gallery | `"images"` | at least one image, the same way |
| Video | `"video"` | `{provider, videoId}`: an id made up here would point at somebody's video |

## Checks

`registry.test.ts`: one definition for each widget type of the schema;
the panel's groups, order and labels and every tile's icon equal to the
approved design's (read from `design/index.html`), and drawn as that
symbol's markup with no warning from React; every new widget a
valid block, and a page holding one of each a valid page. The contract
test checks each widget's traps exist, in a fixture, with its type, and
the random-page agreement check saves one of each new widget to the CMS
and compares the page it serves with React's.

## Adding a widget

One commit, on both sides. The form is the worked example: it was added
alone, after the twelve others, and its commit holds every place below.

- **The schema** (`schema/block-document.schema.json`): the type in
  `blockType` and `widgetType`, one if/then branch of `block`, and its
  `<type>Block` with its props, `noChildren` and the style it takes. In
  `schema/tools/gen-corpus.ts`, the widget in the base page and its valid
  and invalid cases, and the corpus and its manifest written again
  (`npm run corpus`); `npm run compare` must find no disagreement.
- **The application rules**, when the schema cannot say a rule: the same
  rule in `schema/tools/rules.ts` and `cms/lib/block_document/rules.rb`
  (the form's field names, unique in their form).
- **The types** (`src/shared/document.ts`): the type in `BLOCK_TYPES` and
  `WIDGET_TYPES`, its style keys, its props' interface, its block in
  `WidgetBlock`, and its keys in `PROP_KEYS`; `document.test.ts` holds
  them to the schema.
- **Its words** (`src/document/labels.ts`): its name, its plural, its
  props' names in the history, and the name of an item of its list.
  `src/editor/names.ts` says what the Outline shows after its name, and
  `src/editor/panels/groups.tsx` its groups and what its first says
  closed.
- **This folder**: `<type>/` with its definition, icon, renderer, panel
  and its test, and accessibility test; a line in `registry.ts`,
  `panels.ts` and `a11y-all.ts`; in `types.ts`, what Insert must hand it
  first (`InputOf`) and, for a new group of the design's Insert, the group.
- **The server**: its partial in `cms/app/views/blocks/`, its type in
  `BlocksHelper::WIDGET_TYPES`, its look in
  `cms/app/assets/stylesheets/site.css`, and its view test in
  `cms/test/views/blocks_test.rb`.
- **The render contract**: its traps in `contract/fixtures` (and in the
  definition's `traps`), the goldens and the manifest written again, and
  its type in the block types the contract's test requires.
- **The random pages**: its props in `test/document-arbitraries.ts` and
  `test/render-arbitraries.ts`.
- **The lists that name every widget**: Insert's and the picker's in their
  tests (`src/editor/Palette.test.tsx`, `src/editor/Canvas.test.tsx`,
  `e2e/insert.spec.ts`), and the counts in the READMEs.

The form also needed what no widget had needed before, now there for
the next: a sidebar with more than one group of a widget's own
(`WidgetPanel.more`), and a safety check of the render contract that
lets the form widget's own form through, sent to the page's own address
and nowhere else (`test/render-safety.ts`). The canvas needed nothing:
its fields, like its links, already take neither a click nor the focus.
