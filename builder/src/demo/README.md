# src/demo/

The browser demo: the editor with no CMS behind it, its pages kept in the
browser ([`../storage/browser.ts`](../storage/README.md)). A build for the
browser's storage (`npm run build:demo`, or `VITE_STORAGE=browser`) loads
`main.tsx` here in place of `../main.tsx`
(`../../build/storage-entry.ts`), so nothing here is in the CMS's build,
and nothing of the CMS adapter is in the demo's.

| File | What it is |
| --- | --- |
| `main.tsx` | The entry point: the browser's adapter, which puts the example site into an empty browser before the editor lists the pages, or this build's edition of it in place of an older one nobody changed (`../storage/example-site.ts`); the editor with no CMS origin, the page as published opening from the demo, and the demo's line at its foot; or, for `?preview=<id>` and `?published=<id>`, the page view. |
| `views.ts` | The demo's own addresses: a page's draft as it would be published, and the page as published in this browser. Anything else is the editor. |
| `PageView.tsx` | A page where the full system's CMS would serve it: the same renderer as the canvas, inside the header and footer as the CMS draws them (their drafts in a preview, what each published here, or its starter, around a page as published; a part's own preview is the home page's), the site style as this browser keeps it, and the library's images, under one line saying what the full system does. A form is not sent (a line under it says what Rails does with its answers); a link to another page of the site opens it as the demo draws it. |
| `DemoLine.tsx` | The demo's line, word for word as the project gives it, under the editor's bottom line and under each page the demo draws, with "Developed by Riccardo Sapuppo" at its end, as About says it, beside the author's photograph (`riccardo-sapuppo.webp`, 48 pixels square, drawn at 16); under the editor, when a newer edition of the example site is out and this browser kept the pages its visitor changed, the offer to start over with it, asked twice. |
| `demo.css` | The demo's lines, in the editor's identity, and the editor's frame given a fifth row for its line. |

The editor itself is unchanged by the demo but for what any storage
without a CMS needs, which [`../editor/`](../editor/README.md) does by the
storage's capabilities and a null CMS origin: addresses read as the path
the site would give, sentences say "saved in this browser", Publish opens
the page as published instead of linking a live one, and no control is
drawn for what this storage cannot do (scheduling, form responses). The
header and footer open and publish as on the CMS, and the Page tab of
each says a publish reaches the pages published in this browser.

The tests: `views.test.ts`; the demo's story in Chromium on its Pages
build, `../../e2e/demo/demo.spec.ts` (`npm run e2e:demo`); how its shell
is served, `../../e2e/serving/check-serving.ts` (`npm run check:serving`).
