# Decisions

Each note says what was decided, what it costs, and the command that shows
it holds.

**The page and its schema**
- [The page document has one schema, and two validators are held to it](one-schema-two-validators.md)
  (1 October 2026): one JSON Schema read by ajv and json_schemer, the rules
  it cannot say written in TypeScript and in Ruby, and a corpus that holds
  the two to one verdict.
- [A page is sections of one to four columns holding widgets, and nothing else](strict-hierarchy.md)
  (1 October 2026): the hierarchy is in the schema, so the editor, the
  server and the drag rules read one rule; some layouts cannot be made.
- [A page is drawn twice, by the server and by the editor, and both are held to the same output](pages-drawn-twice-one-contract.md)
  (1 October 2026): fixtures, goldens written by Rails and a manifest of
  hashes; every widget is written twice.

**Saving and editing**
- [A page has one draft, saved at a revision, and a version is made on purpose](one-draft-saved-at-a-revision.md)
  (1 October 2026): a save is one conditional statement, a retry is not a
  conflict, and two tabs do not merge.
- [Every edit is a command with an exact inverse](every-edit-is-a-command.md)
  (2 October 2026): undo and redo from steps that carry both sides of their
  change, tried on random sessions and on planted faults.
- [The editor reaches storage through one interface, and one battery holds every adapter to it](storage-behind-an-adapter.md)
  (2 October 2026): the CMS's adapter and the browser's run the same cases,
  and what an adapter lacks is not drawn.
- [The header and footer are kept as the site style is: one row for the site, live on every page with nothing to publish](header-and-footer-kept-as-the-site-style.md)
  (9 October 2026): changed in the editor and live at every page's next
  visit, with a revision and a Save the style has not; no preview, no
  version and no undo once saved, and `config/site.yml` only the defaults.

**Serving pages**
- [Published pages are cached by key, and nothing is deleted to refresh them](published-pages-cached-by-key.md)
  (4 October 2026): an ETag and Solid Cache keys made of the version, the
  site style, the header and footer, the release and each block's subtree;
  every visit revalidates, so a publish shows at the next request.
- [A menu too long for the bar folds into Menu where the widths of its letters say](header-folds-by-measured-letters.md)
  (9 October 2026): lengths for what a phone shows, a header that wraps
  rather than breaks, and a fold the server adds up from letter widths
  measured once; a file to measure again when the header's styles change.
- [A visitor's form is counted under the socket's own address](form-count-by-socket-peer.md)
  (5 October 2026): the rate limit cannot be steered by a header, and behind
  a proxy the whole site shares one count.

**Running it**
- [Pages, cache and jobs live in SQLite files, with no Redis, no Docker and no service](sqlite-and-the-solid-trio.md)
  (1 October 2026): Rails 8's own parts, one process, one host.
- [The API has no authentication, so the servers listen on 127.0.0.1 and refuse to listen anywhere else](no-authentication-one-address.md)
  (1 October 2026): a tool for one person on one machine.
- [The editor reaches the CMS's API through its development server's proxy](editor-api-through-the-dev-proxy.md)
  (2 October 2026): one origin in development, no CORS; what a build
  without the proxy, or an API on another origin, then needs.
- [The editor opens the preview and the live page on the CMS's own origin](editor-links-to-the-cms-origin.md)
  (3 October 2026): `VITE_CMS_ORIGIN`, else an absolute API base's origin,
  else `npm start`'s CMS; the development server takes it from `CMS_URL`.

**The demo**
- [The browser demo is a build of its own, and draws what the CMS would serve](demo-without-the-cms.md)
  (8 October 2026): the storage chosen by the entry point when the editor
  is built; the preview and the page as published drawn by the demo; a
  form not sent; deployed only while the repository is public.
