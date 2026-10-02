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
| `context.tsx`, `ui-store.ts`, `session.tsx` | What every part reaches: the editor store, the interface's own store (hover, preview, tabs, library, site style, the server's errors), the page session |
| `icons.tsx`, `editor.css` | The design's icons and stylesheet; the design's resets of bare elements are kept off the canvas |

## Not here yet

Drag and drop, the keyboard map and focus after every command, the save
state's details, the conflict banner, publishing, preview and site style
come next in this stage. Rich text on the canvas, undo and redo, the
history, versions, tablet and phone overrides and the media library are
stage 3. The top bar draws no control for any of them until it works.

## Checks

One test file per panel, next to it, drives its controls and checks the
page and the command that changed it, and lays the server's 422 on the
store as the shell does, then finds it on the field it names; the
canvas, the widget panel, the navigator, the top bar and the shell (on an
adapter of the test's own and a fake clock) have theirs here.
`../../e2e/editor.spec.ts` shows the same in Chromium against a CMS of the
run's own. `npm run shots:editor <folder>` photographs the editor in the
design's states on the example site (`../../e2e/shots/editor-shots.ts`).
