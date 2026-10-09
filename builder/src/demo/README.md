# src/demo/

The browser demo: the editor with no CMS behind it, its pages kept in the
browser ([`../storage/browser.ts`](../storage/README.md)). A build for the
browser's storage (`npm run build:demo`, or `VITE_STORAGE=browser`) loads
`main.tsx` here in place of `../main.tsx`
(`../../build/storage-entry.ts`), so nothing here is in the CMS's build,
and nothing of the CMS adapter is in the demo's.

| File | What it is |
| --- | --- |
| `main.tsx` | The entry point: the browser's adapter, which puts the example site into an empty browser before the editor lists the pages (`../storage/example-site.ts`); the editor with no CMS origin, the page as published opening from the demo, and the demo's line at its foot; or, for `?preview=<id>` and `?published=<id>`, the page view. |
| `views.ts` | The demo's own addresses: a page's draft as it would be published, and the page as published in this browser. Anything else is the editor. |
| `PageView.tsx` | A page where the full system's CMS would serve it: the same renderer as the canvas, the header and footer and the site style as this browser keeps them (a change of them shows on every page published here, with nothing published again), and the library's images, under one line saying what the full system does. A form is not sent (a line under it says what Rails does with its answers); a link to another page of the site opens it as the demo draws it. |
| `DemoLine.tsx` | The line at the bottom, word for word, with the link to the source. |
| `demo.css` | The demo's lines, in the editor's identity, and the editor's frame given a fifth row for its line. |

The editor itself is unchanged by the demo but for what any storage
without a CMS needs, which [`../editor/`](../editor/README.md) does by the
storage's capabilities and a null CMS origin: addresses read as the path
the site would give, sentences say "saved in this browser", Publish opens
the page as published instead of linking a live one, and no control is
drawn for what this storage cannot do (scheduling, form responses). The
header and footer's panel is there, as this storage keeps them, and its
line says the pages a change reaches are those published in this browser.

The tests: `views.test.ts`; the demo's story in Chromium on its Pages
build, `../../e2e/demo/demo.spec.ts` (`npm run e2e:demo`); how its shell
is served, `../../e2e/serving/check-serving.ts` (`npm run check:serving`).
