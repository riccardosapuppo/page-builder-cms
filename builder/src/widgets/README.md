# src/widgets/

One folder per widget, named as its `type` in the schema: `heading/`,
`text/`, `image/`, `button/`, `divider/`, `spacer/`, `gallery/`, `video/`,
`map/`, `iconbox/`, `quote/`, `accordion/`. Each holds:

- its definition: type, label, group in the widget panel, icon, the props
  of a new one (a valid document by `../shared/validate.ts`);
- its properties panel (Content, Style, Advanced), which changes the
  document only by commands of `../document`;
- its React renderer, held to the server's partial by the render contract;
- its icon;
- its accessibility test.

`registry.ts` lists them, and the order of the widget panel. Adding a
widget is one small commit: the schema branch, this folder, the server's
partial, its contract traps.

Sections and columns are structure, not widgets: they render in
`../render` and are edited from the canvas and the navigator.
