A page builder and CMS: Rails 8 stores, versions, caches and publishes the pages; a React and TypeScript editor builds them.

**Work in progress.** The project is being built in stages, and this README
describes only what is in the repository today. It will grow with the code.

A personal project of the author's, not work for a client.

## What is here now

- [`design/`](design/): the approved design mock, in static HTML, of the
  editor and of a published page, with the design tokens, the mark, the
  fonts and their licences, and screenshots of every state. Its own README
  says how to open it.
- [`schema/tokens.json`](schema/tokens.json): the design tokens (colours and
  their contrast pairs, spacing, type, radii, breakpoints), taken from the
  mock, with the palette slots of the site style and their curated tones.
  It is the copy the code reads.
- [`schema/`](schema/): the one schema of the page document, the corpus
  both validators are held to, and the tools that compare them.
- [`cms/`](cms/): the Rails 8.1 application. It stores pages, their draft
  and versions, publishes them, keeps the media library and the site
  style, and answers the editor through a JSON API described in
  [`cms/openapi.yaml`](cms/openapi.yaml). Published pages are not served
  yet. Its README has the commands to install, run and test it.
- `package.json`: the repository's own Node tools; for now
  `npm run lint:openapi`, which lints the API description.

## The plan, stage by stage

0. **Design.** A static mock of the editor and of a published page, approved
   before any code was written. Done: it is `design/`.
1. **Domain and API.** The Rails side: the page document and its shared
   schema, one draft and its versions, publishing and previews, server-side
   rendering of every widget, the media library, and the API description.
   In progress.
2. **The editor.** A React and TypeScript app with a widget panel, a canvas
   and a navigator: drag and drop, properties, automatic saving.
3. **Editing in depth.** Rich text, undo and redo, versions and restore,
   tablet and phone overrides, full keyboard use, image uploads.
4. **Publishing and performance.** HTTP and fragment caching, scheduled
   publishing and background jobs, with measurements.
5. **Forms**, submitted to Rails from published pages.
6. **A browser-only demo** of the editor, then the full documentation.

## License

MIT, see [LICENSE](LICENSE). The fonts in `design/fonts/` are under the SIL
Open Font License, with each licence file next to its font.
