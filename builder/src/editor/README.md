# src/editor/

The editor's interface, built on the approved design (`../../../design/`,
`index.html` and its screenshots): the top bar (device widths, undo, redo,
history, save state, preview, Publish), the widget panel on the left, the
canvas in the middle, the panel of the selected block (Content, Style,
Advanced), the navigator, the site style, the media library, the context
menu, the shortcuts dialog generated from the one keymap, the About.

- It reads the store (`../store`) and dispatches commands; it never edits
  the document itself.
- It saves and loads only through the storage adapter (`../storage`).
- The canvas uses `../render` and the published page's CSS
  (`../shared/site.css`); its tablet and phone widths are container
  widths, so the page's container queries apply as on a real device.
- One fixed locale, en-US. Focus is placed after every command.

`../main.tsx` mounts it.
