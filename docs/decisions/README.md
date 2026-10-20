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
- [A block's own type is drawn by data attribute, and a vw is the page's width](free-type-by-attribute.md)
  (15 October 2026): five style keys over the preset, held by the schema
  and two application rules; a stylesheet written from the numbers read,
  at `/type/<digest>.css` and on the canvas alike; a vw written as a
  hundredth of the page root's width, so the canvas's tablet draws it as
  a tablet does.
- [Collections are typed entries: a definition held to a schema, values held to it by rules written twice, a template kept as a part](collections-are-typed-entries.md)
  (15 October 2026): a collection's fields of nine types in a schema of
  their own, an entry's values given to their fields' definitions by twin
  rules held to a corpus; a draft saved at a revision and what is live,
  no versions; the template a page of kind `template`; a counter of what
  visitors could see; both storages, one battery. Since 16 October a page
  may live at a collection's prefix, the section's page at `/news` above
  its entries at `/news/<slug>`.
- [The shop sells a collection's entries through Stripe's Checkout in its test mode alone: settings and orders on both storages, a cart in a cookie of its own addresses, a module that can be off](shop-on-collections.md)
  (15 October 2026): the shop's settings held to rules written twice and
  cases both read; a product a published entry, its price counted in the
  smallest unit by its hundredths; a cart of ids and quantities in an
  encrypted cookie on `/cart` alone, its writes guarded as a visitor's
  form is; Stripe's key from the environment, test mode only, never
  answered or logged; orders kept as Stripe says they are, asked again
  on demand, no webhook; the browser's demo orders marked as its own.
  Since 16 October, the editor's Shop screen, a Products preset, Add to
  cart in the products' template, and prices drawn as money, a page that
  draws them keyed on the shop's settings; the cart and the page back
  from Stripe drawn in the site's frame, the demo's own cart drawn as the
  CMS's, held to it by goldens, and its checkout making the demo's
  orders; and the example site's club kit, sold at `/shop` in pounds.
  After a review, a site upgraded with a page or a collection at `/cart`
  keeps it: the cart's routes match only while the shop is open, what
  holds `cart` keeps it, and the shop is not turned on over it.

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
- [The header and footer are parts of the site: documents of blocks, edited and published as pages are](header-and-footer-are-parts.md)
  (12 October 2026): sections, columns and blocks, dragged where they go,
  with a draft, versions, a preview and a publish; starters every page
  draws until a part publishes; no form and no section anchor in a part.
  It replaced [the header and footer kept as the site style is](header-and-footer-kept-as-the-site-style.md)
  (9 October 2026), four values live with nothing to publish.

**Serving pages**
- [Published pages are cached by key, and nothing is deleted to refresh them](published-pages-cached-by-key.md)
  (4 October 2026): an ETag and Solid Cache keys made of the version, the
  site style, the header's and footer's published versions, the release
  and each block's subtree; every visit revalidates, so a publish shows at
  the next request. A page that draws a collection is keyed on it, and
  one that draws the shop on its settings.
- [A menu folds into Menu where the widths of its letters say](header-folds-by-measured-letters.md)
  (9 October 2026, revised on 12 October): a menu block folds on its own
  width, at a step the server adds up from letter widths measured once; a
  file to measure again when the menu's styles change.
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

**The Assistant**
- [A visitor's model key stays in the tab's memory, and the page can send it only to its provider](assistant-key-in-memory.md)
  (14 October 2026): the browser calls Anthropic or OpenAI straight, the
  key held in a closure and forgotten when asked, when idle and when the
  page is left; the build's Content-Security-Policy connects to the two
  providers and nothing else; what the model writes is read without trust,
  an illustration's SVG cleaned and drawn to a picture, never put on a page.

**The demo**
- [The browser demo is a build of its own, and draws what the CMS would serve](demo-without-the-cms.md)
  (8 October 2026): the storage chosen by the entry point when the editor
  is built; the preview and the page as published drawn by the demo; a
  form not sent; deployed only while the repository is public.
