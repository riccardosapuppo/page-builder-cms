# Decisions

Each note says what was decided, what it costs, and the command that shows
it holds.

- [The editor reaches the CMS's API through its development server's proxy](editor-api-through-the-dev-proxy.md)
  (2 October 2026): one origin in development, no CORS; what a build
  without the proxy, or an API on another origin, then needs.
- [The editor opens the preview and the live page on the CMS's own origin](editor-links-to-the-cms-origin.md)
  (3 October 2026): `VITE_CMS_ORIGIN`, else an absolute API base's origin,
  else `npm start`'s CMS; the development server takes it from `CMS_URL`.
- [Published pages are cached by key, and nothing is deleted to refresh them](published-pages-cached-by-key.md)
  (4 October 2026): an ETag and Solid Cache keys made of the version, the
  site style, the release and each block's subtree; every visit
  revalidates, so a publish shows at the next request.
