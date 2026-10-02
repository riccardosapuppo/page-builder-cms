# src/store/

The editor's state: a vanilla zustand store (`zustand/vanilla`) that holds
the document and runs the reducer of `../document`, plus what is not the
document: the selection, the device being edited (desktop, tablet,
phone), the command history for undo and redo.

- The store applies commands; it never changes the document any other way,
  so every change is a command with its inverse.
- React reads it through `useStore` selectors; anything else (the autosave
  in `../storage`) subscribes to it through the store's own `subscribe`
  and `getState`, and never reaches into its internals.
- Time is injected (a `now` function), never read from `Date.now()` here.

Imports `../document` and `../shared`. Nothing here imports from
`../render`, `../widgets`, `../editor` or `../storage`.
