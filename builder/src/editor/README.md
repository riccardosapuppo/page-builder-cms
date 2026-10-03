# src/editor/

The editor's interface, built on the approved design (`../../../design/`,
`index.html` and its screenshots).

- It reads the store (`../store`) and dispatches commands; it never edits
  the document itself.
- It saves and loads only through the storage adapter (`../storage`).
- The canvas uses `../render` and the published page's CSS
  (`../shared/site.css`); its tablet and phone widths are container
  widths, so the page's container queries apply as on a real device.
- One fixed locale, en-US.

`../main.tsx` mounts `App.tsx` on the Rails adapter, the system clock and
random block ids.

## What is here

| File | What it is |
| --- | --- |
| `App.tsx` | The shell: the grid of the design, the site's pages, media library and site style read through the adapter, a page opened (`openDocument` before the store takes it, the page's id in the address as `?page=`), its autosave fed every new document, the server's 422 laid on its blocks (`errorsByBlock`, on the document that save sent), a warning before the tab closes while edits are only here |
| `TopBar.tsx`, `Menu.tsx`, `NewPageDialog.tsx` | The mark's menu, the page switch (the site's pages, a new page), whether the page is live and how many saved changes are not, the device previewed, the save state |
| `LeftTray.tsx`, `Palette.tsx`, `insert.ts`, `pickers.tsx` | The Add and Edit tabs; the widget panel, its tiles in labelled groups with a search; where a new block goes (after the selection, as a paste does); what an image, a gallery or a video needs before it is added |
| `panels/` | The Edit view: the page's panel, and a block's with its Content, Style and Advanced tabs. The Content tab of a widget is its own, in `../widgets/<widget>/panel.tsx` |
| `controls.tsx`, `errors.ts` | The panels' fields, each with its label, hint and errors tied to it; a finding of the editor's checks or of the server's 422 said as a sentence about the field |
| `Canvas.tsx`, `presets.ts` | The page on the bench, the width rule, the marks of the selection and its floating bar, the hover outline, the empty page's invitation and its ready-made sections |
| `Navigator.tsx` | The page as an ARIA tree, in step with the selection both ways |
| `act.ts`, `pending.ts` | The one way every command runs, from a button, a key, the block's menu or a drop: the text still waiting in a panel's field is handed over first, as a command of its own; then the command; then the focus where its result says (the neighbour after a delete, the new block after an insert, a paste or a duplicate, the block touched after an undo), on the canvas or on the navigator's row |
| `drag/` | Drag and drop on the store's drag, behind one module for the drag library (`drag/dnd.ts`, `@dnd-kit` 0.5.0): the selected block (the floating bar's grip, or Space) and each widget panel tile as sources; where a block would land, from the pointer's coordinates or from the keyboard's steps (`place.ts`, `steps.ts`); the marks the canvas draws (`marks.ts`); the live region (`DragLayer.tsx`) |
| `keymap.ts`, `keys.ts`, `ShortcutsDialog.tsx`, `selection.ts` | The keyboard map in one table: the editor's one keydown listener runs it, the drag library's keyboard sensor takes its keys from it, and the "?" window lists it; the arrows' order through the page |
| `BlockMenu.tsx`, `Menu.tsx`, `clipboard.ts` | The block's menu (right click, or the menu key): copy, paste, duplicate, delete; copy and paste through the browser's clipboard events, so a copied block is on the system clipboard as text |
| `context.tsx`, `ui-store.ts`, `session.tsx` | What every part reaches: the editor store, the interface's own store (hover, preview, tabs, library, site style, the server's errors, the drag's mode and what the live region said), the page session |
| `icons.tsx`, `editor.css` | The design's icons and stylesheet; the design's resets of bare elements are kept off the canvas |

## Not here yet

The save state's details, the conflict banner, publishing, preview and
site style come next in this stage. Rich text on the canvas, the undo and
redo buttons and the history (their keys already work, on the store's
history), versions, tablet and phone overrides and the media library are
stage 3. The top bar draws no control for any of them until it works, and
the "?" window lists no key for them.

## Checks

One test file per panel, next to it, drives its controls and checks the
page and the command that changed it, and lays the server's 422 on the
store as the shell does, then finds it on the field it names; the
canvas, the widget panel, the navigator, the top bar, the shell (on an
adapter of the test's own and a fake clock), the command runner, the
keymap and its listener, and the drag layer's preview and live region
have theirs here. jsdom lays nothing out, so the pointer, the keys and
the clipboard are Chromium's, against a CMS of the run's own:
`../../e2e/editor.spec.ts` (the shell), `drag.spec.ts` (every drop by
mouse and by keyboard, refused drops, Esc), `focus.spec.ts` (the focus
after every command), `keyboard.spec.ts` (every key of the map, and the
"?" window listing them) and `menu.spec.ts` (the block's menu). The ones
tagged `@a11y` are what `npm run check:a11y` runs. `npm run shots:editor
<folder>` photographs the editor in the design's states on the example
site (`../../e2e/shots/editor-shots.ts`).
