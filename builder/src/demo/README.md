# src/demo/

The browser demo: the editor with no CMS behind it, its pages kept in the
browser ([`../storage/browser.ts`](../storage/README.md)). A build for the
browser's storage (`npm run build:demo`, or `VITE_STORAGE=browser`) loads
`main.tsx` here in place of `../main.tsx`
(`../../build/storage-entry.ts`), so nothing here is in the CMS's build,
and nothing of the CMS adapter is in the demo's.

| File | What it is |
| --- | --- |
| `main.tsx` | The entry point: the browser's adapter, which puts the example site into an empty browser before the editor lists the pages, or this build's edition of it in place of an older one nobody changed (`../storage/example-site.ts`); the editor with no CMS origin, the page as published opening from the demo, and the demo's line at its foot; or, for `?preview=<id>`, `?published=<id>` and `?entry=<id>`, the page view. |
| `views.ts` | The demo's own addresses: a page's draft as it would be published (a template's with the entry it is drawn with, `?preview=<id>&entry=<entry id>`, or `entry=sample` for made-up values), the page as published in this browser, and an entry of a collection as published here (`?entry=<entry id>`). Anything else is the editor. |
| `PageView.tsx` | A page where the full system's CMS would serve it: the same renderer as the canvas, inside the header and footer as the CMS draws them (their drafts in a preview, what each published here, or its starter, around a page as published; a part's own preview is the home page's), the site style as this browser keeps it, the library's images, and the collections and entries this browser keeps (a Collection list draws the published entries, each card leading to the entry's own view), under one line saying what the full system does. An entry's view is its collection's published template drawn with what the entry published, under its title; one not published here, or whose template is not, says so instead. A template's preview is its draft drawn with an entry's draft, as on the canvas. A form is not sent (a line under it says what Rails does with its answers); a link to another page of the site, or to an entry (`/<prefix>/<slug>`), opens it as the demo draws it. |
| `DemoLine.tsx` | The demo's line, word for word as the project gives it, under the editor's bottom line and under each page the demo draws, with "Developed by Riccardo Sapuppo" at its end, as About says it, a link to the author's site, beside the author's face (`riccardo-sapuppo.webp`, head and shoulders from the author's photograph on transparency, 96 pixels square, drawn at 20 in a white disc with a ring of the mark's yellow apart from it); its key, a cross, shuts the line down to that credit, one row, and a chevron opens it again, the browser keeping the choice (localStorage, `page-builder-cms:demo-line`; a browser that keeps nothing starts each visit open); under the editor, when a newer edition of the example site is out and this browser kept the pages its visitor changed, the offer to start over with it, asked twice, shown with the line open or shut. |
| `demo.css` | The demo's lines, in the editor's identity, and the editor's frame given a fifth row for its line. |

The editor itself is unchanged by the demo but for what any storage
without a CMS needs, which [`../editor/`](../editor/README.md) does by the
storage's capabilities and a null CMS origin: addresses read as the path
the site would give, sentences say "saved in this browser", Publish opens
the page as published instead of linking a live one, and no control is
drawn for what this storage cannot do (scheduling, form responses). The
header and footer open and publish as on the CMS, and the Page tab of
each says a publish reaches the pages published in this browser.

The tests: `views.test.ts` and `PageView.test.ts`; the demo's story in Chromium on its Pages
build, `../../e2e/demo/demo.spec.ts` (`npm run e2e:demo`); how its shell
is served, `../../e2e/serving/check-serving.ts` (`npm run check:serving`).
