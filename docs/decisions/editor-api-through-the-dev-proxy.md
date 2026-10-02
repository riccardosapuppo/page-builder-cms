# The editor reaches the CMS's API through its development server's proxy

Decided on 2 October 2026, at the start of stage 2.

## The question

The editor and the CMS are two servers: Vite serves the editor on
127.0.0.1:4900, Rails the CMS on 127.0.0.1:3900. To a browser those are two
origins. The CMS's API takes writes only from its own origin: a write whose
`Origin` names another one, or that the browser marks `Sec-Fetch-Site:
cross-site` or `same-site`, gets 403, and it grants no CORS preflight
([cms/README.md](../../cms/README.md), "Writes from other sites"). That rule
is what keeps a page from another site, open on the same machine, from
publishing a draft through an API with no authentication. So the editor
cannot simply call `http://127.0.0.1:3900/api` from `http://127.0.0.1:4900`.

## The decision

The editor calls its own origin. `VITE_API_BASE` defaults to `/api`, and the
development server passes `/api` and `/rails/active_storage` to `CMS_URL`
(`http://127.0.0.1:3900` by default) **keeping the `Host` the browser
asked for** (`changeOrigin: false`, [builder/vite.config.ts](../../builder/vite.config.ts)).
The CMS then sees a request addressed to the editor's host, carrying the
editor's `Origin`: one origin, so its rule lets the write in, and no CORS is
needed. The addresses the CMS builds from the request, the upload address
of a direct upload and the redirect of a library image, are on the editor's
host too, so the bytes also go through the proxy.

The other ways, and why not:
- **CORS on the CMS**: an allow-list of origins, preflights, and the origin
  rule taught the same list, on every endpoint and on Active Storage's disk
  service. More surface on a server with no authentication, for a setup
  that runs on one machine.
- **Rails serving the built editor**: one origin without a proxy, but every
  change to the editor would need a build before it is seen, and the
  editor's development server, with its hot reload, would not be the one
  people use.

## What it costs

1. **The proxy exists only in development.** It is a feature of `vite`
   (`npm run dev`) and of nothing else. `vite build` writes static files with
   no proxy, and `vite preview` is given none here. Whoever serves a built
   editor next to the CMS must put both behind one origin (a reverse proxy
   that sends `/api` and `/rails/active_storage` to Rails and keeps the
   `Host`), or build it with an absolute `VITE_API_BASE`.
2. **An absolute `VITE_API_BASE` needs CORS on that server.** Built with
   `VITE_API_BASE=https://cms.example/api`, the editor sends its requests
   there directly: every write becomes cross-origin, with a preflight, and
   the upload's `PUT` goes to the address that server gives, on its own
   host. That server must answer the editor's origin by CORS on both, and,
   if it is this CMS, its origin rule must learn that origin. This CMS does
   neither today: pointed at it that way, the browser would send the
   preflight of the editor's first write, get no CORS answer and never send
   the write; with CORS added and the rule unchanged, the write would get
   403. This is the price of the same builder being able to talk to another
   API: the contract is `cms/openapi.yaml`, and the transport is the other
   server's to open.
3. **The CMS sees the editor's host.** Its `config.hosts` must allow the
   name the browser uses for the editor (127.0.0.1 and localhost are
   allowed); and the addresses it writes into answers belong to whichever
   origin asked, which is right for one origin and would be wrong behind a
   proxy that changed the `Host`.
4. **Two servers to run** in development. The tests start their own
   ([builder/e2e/harness](../../builder/e2e/harness/servers.ts)); one
   command for both, `npm start`, is the plan's next step and not written
   yet.

The browser-only demo of stage 6 has no CMS at all: its storage adapter
keeps everything in the browser, and none of this applies to it.

## The proof

[builder/e2e/probe.spec.ts](../../builder/e2e/probe.spec.ts), run with
`npm run e2e` from `builder/`, starts a CMS of its own in the e2e
environment, with forgery protection on, and the editor's development
server with its proxy pointed at it. Chromium, headless, on the editor's
origin, creates a page, saves its draft, uploads a PNG with
`@rails/activestorage`'s `DirectUpload` to the API's
`/media/direct_uploads`, adds it to the media library and reads it back.
Every write goes to the editor's origin with the editor's `Origin` and
`Sec-Fetch-Site: same-origin`; the draft is in the CMS when asked directly;
the bytes come back with the same SHA-256; and Active Storage's own upload
endpoint refuses the same request with 422. On 2 October 2026 it passed;
with the proxy planted to rewrite the `Host` (`changeOrigin: true`), the
first write got 403 and it failed.

On the CMS's side, `cms/test/integration/api/other_sites_test.rb` holds the
same rule without a browser: a save and an upload with `Host` and `Origin`
both the editor's pass, and with the CMS's own `Host` the save gets 403.
