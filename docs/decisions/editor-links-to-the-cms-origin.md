# The editor opens the preview and the live page on the CMS's own origin

Decided on 3 October 2026, with the editor's Preview and Publish.

## The question

The CMS gives every page two addresses a person opens in a browser: the
draft as it would look published (`links.preview`, `/preview/12`) and the
live page (`links.live`, `/winter-series`, or `/` for the home page). Both
are paths on the CMS's origin. The editor runs on another origin (Vite on
127.0.0.1:4900, Rails on 127.0.0.1:3900), and its development server passes
only `/api` and `/rails/active_storage` to the CMS
([editor-api-through-the-dev-proxy.md](editor-api-through-the-dev-proxy.md)).
Opened on the editor's origin, `/winter-series` is the editor's 404.

## The decision

The editor puts those paths on the CMS's origin, which it reads from its
build settings ([builder/src/storage/config.ts](../../builder/src/storage/config.ts)):

1. `VITE_CMS_ORIGIN`, when it is set: the origin alone, whatever path it
   carries; a value that is not an http or https address stops the editor
   with a sentence naming the setting.
2. Else the origin of an absolute `VITE_API_BASE`: an API on another server
   is that server's.
3. Else `http://127.0.0.1:3900`, where `npm start` runs the CMS.

The development server (`npm run dev`, which `npm start` runs) sets
`VITE_CMS_ORIGIN` from the `CMS_URL` its proxy points at, unless one of the
first two is given ([builder/vite.config.ts](../../builder/vite.config.ts)):
the tests' editor, whose proxy points at a CMS on 3901, links to 3901.

The other ways, and why not:
- **Passing the pages through the proxy too** (`/preview`, every slug):
  the published pages' addresses are any slug, so the proxy would have to
  take every path that is not the editor's, which is the fallback rule 27
  forbids (a missing editor file would come back as the CMS's page).
- **Reading the origin from the API's answers**: the API writes paths,
  on purpose, so its answers stay right behind any proxy that keeps the
  `Host` (the editor's proxy is one); an absolute address in them would be
  the editor's host when asked through the proxy, the wrong one.

## What it costs

- **A build is tied to one CMS address.** The setting is read when the
  editor is built, like `VITE_API_BASE`: a built editor served for a CMS
  elsewhere must be built with that CMS's origin.
- **The preview and the live page open in a new tab, on another origin.**
  They are the CMS's pages, served as visitors get them (the preview never
  stored, never indexed), not a frame inside the editor.

## The proof

`npm test` from `builder/` runs `src/storage/config.test.ts`: the default,
`VITE_CMS_ORIGIN` with a path, an absolute API base, and a value that is
not an http address, refused with its name.
