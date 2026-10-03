# src/store/

The editor's state: a vanilla zustand store (`zustand/vanilla`),
`createEditorStore({ document, now, historyLimit })` in `editor-store.ts`,
that holds the page and runs the reducer of `../document`, plus what is not
the page: the selection, the device being edited (`base`, `tablet`,
`phone`), the focus the last command left, the drag in progress, the last
refusal, and the history.

**Why a reducer inside zustand, rather than one of the two alone.** The
rules of the page (what a command does, its inverse, what it may not
break) are pure functions in `../document`, tested without React or a DOM;
zustand adds what a reducer alone lacks for the interface: React reads it
through selectors that re-render only what changed, and the autosave
(`../storage`) uses the store's own `subscribe` and `getState`, without
React and without reaching into its internals.

- **The page changes only by commands**, through `dispatch(command)`: every
  change has its inverse and lands in the history. A refused command
  changes nothing and leaves its reason in `error`.
- **Undo and redo**: `past` holds the applied commands, the most recent
  last; `undo()` applies the inverse of the last one and moves it to
  `future`; `redo()` applies the very same command again (the same ids,
  the same media), so the page is the one it was. A new command clears
  `future`. `past` keeps the most recent `historyLimit` commands (200 by
  default). Each entry has the time it was applied, from `now`, the only
  clock here; the history panel (`../editor/HistoryPanel.tsx`) shows
  them, newest first, and goes back or forward to any of them by undoing
  or redoing every step up to it.
- **Focus and selection** follow each command: `focus` is the reducer's
  (the new block, a deleted block's neighbour, the block an undo touched),
  and the selection moves to it.
- **Drag and drop**: `startDrag`, `dragOver`, `drop`, `cancelDrag` keep the
  session of `../document/drag.ts` beside the page, never in it: the
  canvas draws `drag.preview` while it lasts, `document` is untouched until
  the drop, the drop is one command in the history, and a cancel leaves
  nothing. A drop planned on a page that has changed since is applied to
  the page as it is, and refused if it no longer fits.
- `load(document)` puts in a page read from storage (through
  `../document/upgrade.ts`, `openDocument`) and starts the history again.

Imports `../document` and `../shared`. Nothing here imports from
`../render`, `../widgets`, `../editor` or `../storage`.
