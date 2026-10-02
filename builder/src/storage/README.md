# src/storage/

The only folder of the editor that talks to a server. Oxlint makes
`fetch`, `XMLHttpRequest`, `EventSource` (also as properties of `window`,
`globalThis` and `self`) and any import of `@rails/activestorage` errors
everywhere else in `src/` (`../../.oxlintrc.json`, shown firing by
`../../build/lint-fence.test.ts`).

- `config.ts`: where the API is, `VITE_API_BASE`, `/api` by default.
- `adapter.ts`: the storage adapter's interface, whole from stage 2:
  pages (list, create, draft, save with its revision, versions, restore,
  publish, schedule), media (list, upload, alt text, delete), the site
  style, form answers, and `capabilities`, which says what this adapter
  can do, so the editor shows no control for what it cannot (scheduling
  until stage 4, answers until stage 5).
- `rails.ts`: the adapter for the CMS's API (`../../../cms/openapi.yaml`),
  each call with its method written out. Uploads go through
  `@rails/activestorage` to `POST /api/media/direct_uploads`.
- `contract.ts`: the battery of behaviour every adapter must pass, written
  against the interface; it runs against a real CMS in `*.rails.test.ts`
  files, which `npm run test:rails` runs with a CMS of their own
  (`../../e2e/harness/`). `browser.ts`, the IndexedDB adapter of the
  demo, arrives in stage 6 and runs the same battery.
- The autosave: debounce on an injected clock, one save in flight, three
  outcomes (saved; conflict, with reload or overwrite; unknown, retried
  with the same `saveId`).

The response types are written by looking at what the server really
sends, and the CMS's request tests hold its answers to `openapi.yaml`.
