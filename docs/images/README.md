# Pictures

The pictures the project's README shows, and the one a shared link to the
browser demo previews with. A script makes each one from the running system; none is drawn or edited by hand, and a change to the editor
or to the published page is followed by `npm run shots`, which makes them
again.

| Picture | Shows |
| --- | --- |
| `editor.png` | The editor, 1440 by 900, with the home page open, its heading selected, the Outline on the left and the heading's settings on the right. |
| `editor-phone.png` | The editor on a 390 by 844 phone, at twice the pixels: the hero's heading tapped, its settings risen from the bar at the foot as a sheet. |
| `assistant.png` | The Assistant, 1440 by 900, after writing a page from the sample written by hand (no key, no model): its four sections on the canvas and listed in its drawer, each a step in History; the new page's heading selected, Write it again among its settings. |
| `header.png` | The site's header open in the editor, 1440 by 900, as a page is opened: its menu selected, the menu's links on the right, the home page dimmed under it. |
| `published-desktop.png` | The home page as the CMS serves it to a 1440 by 900 window. |
| `published-phone.png` | The same page on a 390 by 844 phone, at twice the pixels. |
| `collections.png` | Collections in the editor, 1440 by 900, opened from the mark's menu: the example site's News and its five entries, each published, in the collection's own order, Club kit beside it in the list. |
| `template.png` | The template of News, 1440 by 900, opened from its settings as a person opens it: drawn with the newest entry, the entry's title, a Field block, selected and its settings on the right. |
| `entry-desktop.png` | An entry of News, `/news/tea-in-the-hut`, as the CMS serves it to a 1440 by 900 window. |
| `entry-phone.png` | The same entry on a 390 by 844 phone, at twice the pixels. |
| `shop-page.png` | The example site's shop page, `/shop`, as the CMS serves it to a 1440 by 900 window: its title, and Club kit's four products in a grid, each with its price in pounds. |
| `product-desktop.png` | A product of Club kit, `/shop/swim-cap`, as the CMS serves it to a 1440 by 900 window: its picture, title, price, summary and Add to cart. |
| `product-phone.png` | The same product on a 390 by 844 phone, at twice the pixels. |
| `cart.png` | A visitor's cart, `/cart`, as the CMS serves it to a 1440 by 900 window, after two caps and a float were put in from their pages: each line with its picture, its price for one and what it costs, how many and Remove, and the total beside Checkout. |
| `shop-orders.png` | The Shop screen in the editor, 1440 by 900, opened from the mark's menu on its Orders: what three visitors checked out from the served shop, two paid on the tests' stand-in for Stripe's checkout page (`cms/test/support/fake_stripe.rb`) with the email each gave, one left unpaid and open. |
| `history.png` | The editor's History: this session's changes, a version kept under a name, the version that is live. |
| `form-responses.png` | Form responses: the answers four visitors sent from the served home page, the newest opened whole. |
| `demo.png` | The browser demo after Publish, with its notice and its bottom line. |
| `demo-preview.png` | The browser demo at 1200 by 627, the size a shared link's preview is drawn, the home page's heading selected. Not in the README: the demo's build puts it at its root as `preview.png`, and its page names it in its Open Graph tags (`builder/build/demo.ts`). |
| `publish.gif` | A real publication: the served page, the editor with the heading selected, new words typed and saved, Publish pressed, and the served page with the change. |

## Making them

```
npm run shots
```

takes about a minute and needs what `npm start` needs (Ruby, the CMS's gems,
Chromium from Playwright). It starts a CMS of its own in the e2e environment
on 127.0.0.1:3905 (`SHOTS_CMS_PORT`), with databases and an Active Storage
root of its own, its checkout going to the tests' stand-in for Stripe on a
port the system gives it, so that nothing leaves the machine, runs the
example site's seed, and starts the editor's development server on
127.0.0.1:4905 (`SHOTS_EDITOR_PORT`). The demo is
built into a folder of the run's and served as GitHub Pages serves it, on the
editor's port, once the editor's server has stopped. Chromium runs headless,
in en-US and UTC, with the fonts loaded, motion reduced and animations off.

At the end every server is stopped, its port shown closed, and the run's
folders deleted and shown gone. A run that was killed leaves a folder named
for the two ports, which the next run deletes first. `--only <name>,<name>`
makes some of the pictures, and `--out <folder>` writes them elsewhere.

The pictures are written to a folder of the run's and copied here only when
every one is made and passes its check, so a run that fails leaves the pictures
that were here. A picture here that no name lists is removed.

Made again from the same code, the pictures of the served site come out byte
for byte the same. `history.png`, `form-responses.png`, `collections.png` and
`shop-orders.png` show the times the run's CMS kept, so they differ in those
times, in UTC; `publish.gif` names the CMS's address in the notice that says
the page was published, so it differs when `SHOTS_CMS_PORT` moves the port. To
see whether a change to the editor needs the pictures made again, make them
with `--out` into another folder and compare.

On 16 October 2026, with News added to the example site, a run into another
folder gave those five again byte for byte, and three more that differed
from the committed ones in a few pixels each, none from a change of the code:
`editor.png` in 17 (the edges of the link field's icon), `editor-phone.png`
around Settings (the highlight a tap leaves), `demo-preview.png` in 38 (the
measure of a block's space, drawn where the pointer had passed). The
committed ones were kept, and only the four new pictures were made into this
folder (`--only`); of those, `template.png` and `entry-phone.png` came out
byte for byte the same in two runs.

The same day, with the example site's shop, a run of all twenty into another
folder, on the ports 3925 and 4925, gave the same three again in the same few
pixels each (17, around Settings, 38), and the times of `history.png` and
`form-responses.png`, and `publish.gif` its port; `assistant.png`, `demo.png`,
`header.png`, `template.png` and the pages of the site came out byte for byte
the same. `collections.png` changed with the example site, which now lists
Club kit beside News, and was kept with the five new pictures of the shop:
its page, a product on a desktop and on a phone, a visitor's cart, and the
Shop screen with its orders. The others were kept as they were.

## What holds them to what the script makes

The pictures' names, sizes in pixels, byte limits and what each shows are
listed once, in `tools/lib/shot-images.ts`, which also reads a folder back:
each PNG through its chunks, checksums and image data, the GIF through a
reader of its own (`tools/lib/gif.ts`) that decodes every frame, a picture
with too little in it or too much for the README, a file no name lists, and
a README that shows a picture the script does not make. `npm run test:tools`
runs that check on this folder, and on small folders spoiled one way at a
time to show that each fault is found.

The GIF is frames of the page taken at 0.75 of a 1280 by 800 window, so the
file is 960 by 600, read out of their PNGs by Chromium and encoded by
`gifenc` (MIT, pure JavaScript, a development dependency). A frame that
changes little from the one before is written as what changed. The limit is
2 MB; it takes about 120 KB.
