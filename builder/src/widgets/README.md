# src/widgets/

One folder per widget, named as its `type` in the schema: `heading/`,
`text/`, `image/`, `button/`, `divider/`, `spacer/`, `gallery/`, `video/`,
`map/`, `iconbox/`, `quote/`, `accordion/`. Each holds:

- `definition.ts`: the type, the widget panel's group and label (the
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
- `panel.tsx`: its Content tab in the editor's property panel, whose
  controls make the widget's own commands; and `panel.test.tsx`, which
  drives those controls, checks the page and the command, and finds the
  server's 422 on the field it names. The Style and Advanced tabs are
  the same for every block (`../editor/panels/`), drawn from the style
  settings the type accepts;
- `a11y.ts`: its accessibility test (below).

`panels.ts` lists the panels by type, apart from `registry.ts`: the render
contract and the rule-9 check load the registry and have no use for the
editor's controls.

Each folder's `a11y.ts` is the widget's accessibility test, as data
(`a11y.ts` here has its shape): cases, each a block's props and what a
screen reader must find in it, by role, name and level, or nothing at
all for a hidden one. `a11y-all.ts` lists them in the panel's order.
`../../e2e/widgets.spec.ts` publishes every case on a CMS of its own and
holds the page it serves, and the editor's canvas, to them, with axe
finding nothing serious or critical (`npm run check:a11y`).

`types.ts` has the definition's type and `newWidget(definition, id,
input)`, which makes a new block: `{id, type, props, children: [], style:
{base: {}}}`. `registry.ts` lists the definitions in the panel's order
(Basic, Media, Content, as the design has them), the renderer of each
type, and the Layout group's tiles (a section, with one to four columns).
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
the rule-9 check saves one of each new widget to the CMS and compares the
page it serves with React's.

## Adding a widget

One small commit: the schema's branch, a folder here with its definition,
renderer, icon and panel with its test, a line in `registry.ts` and in
`panels.ts`, the server's partial, and its traps in `contract/fixtures`
with the goldens written again.
