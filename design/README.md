# design/

The approved design mock of Page Builder CMS: the editor, a published page
and the token sheet, drawn in static HTML and CSS before any code was
written. It is the reference the Rails templates and the React editor are
built against. Nothing here is the product: there is no build, no server and
no behaviour beyond switching between still states.

**This folder is frozen.** It stays as it was approved on 1 October 2026,
so it can always be compared with what the code draws; it is not edited to
follow the code. The one later addition is `layout/` (below), the
editor's layout approved on 3 October 2026, frozen in the same way. In
particular `design/tokens.json` is the mock's own copy and no longer the
project's tokens: [`../schema/tokens.json`](../schema/tokens.json)
is the canonical file, and it has moved on (the palette slots and their
curated tones, the type scales, the image crops and other additions the
code needed). Nothing in `cms/`, `schema/` or `tools/` reads
`design/tokens.json`; only this folder's own `tools/contrast.mjs` does by
default, and `node design/tools/contrast.mjs schema` runs the same check
on the canonical file.

**Accent:** Tool yellow `#EDC200`, always with graphite edges and graphite
text on it, chosen on 1 October 2026 from three candidates shown in the same
editor (`shots-extra/accent-choice.png`).

## Two references: the identity and the layout

- **The identity** comes from this folder's mock, the one approved on
  1 October 2026, and it is unchanged: the palette, Tool yellow with its
  graphite edges, the three typefaces, the mark, the icons, the controls,
  the example site.
- **The layout** comes from [`layout/`](layout/), approved on 3 October
  2026, which replaced the stage-0 mock's arrangement of the editor (the
  widget panel on the left, the navigator in a fixed column, the Content,
  Style and Advanced tabs). It keeps this identity and rearranges the same
  editor: a top bar with Insert, Outline and History; round "+" buttons
  on the page; the selected block's tools in a clamp in the page's
  margin (the editor redrew it as a toolbar floating by the selection on
  14 October 2026: `layout/NOTES.md`, section 4.2); one sidebar with Page and Block tabs and named groups; the
  selection's path, the devices and the page's width in a bottom line.
  `layout/NOTES.md` is its designer's record: where each part came from,
  the rules the clamp and the "+" follow, the keys, what was left out and
  why. Open `layout/index.html` from disk; the hash picks the state, as
  here, and the shots of every state are in `layout/shots/` (1440 by 900,
  `editor-1280` at 1280 by 800) and `layout/shots-extra/`
  (`insert-drawer-1280` and `outline-col1` at 1280 by 800).

The layout is copied as it was approved, with two changes: its theme,
images and fonts are this folder's (`../theme.css`, `../img/`,
`../fonts/`), not copied again; and its notes call the written request it
was drawn from "the mix's brief", a document that is not in the
repository. The two scripts that shot it, which its notes name, stayed
with the drawings' working folder, outside the repository too.

Where the editor departs from the layout, on purpose, is listed in
[`../builder/src/editor/README.md`](../builder/src/editor/README.md).

## Opening it

Open `index.html` straight from disk (a `file://` address) in any current
browser. Everything it loads sits in this folder, fonts and illustrations
included, and it makes no network request.

The URL hash picks the state. Opened without a hash, or with one that is
not in the table, it shows `#editor`.

| Hash | What it shows |
| --- | --- |
| `#editor` | the editor with the example home page on the canvas, the hero heading selected, its Content tab, the navigator |
| `#style` | the tablet width, a column selected, its Style tab with a spacing override that applies to tablets only |
| `#drag` | a Quote widget dragged from the widget panel into a column, with the drop line and the forbidden areas |
| `#save-states` | the four save states: Saved, Saving…, Not saved (retrying), Changed in another tab |
| `#media` | the media library: an upload in progress, an image selected with its required alt text missing |
| `#publish` | the Publish menu: publish now, schedule with the time zone, the live page's address |
| `#history` | the history panel: this session's changes and the saved versions, with Restore and Save version |
| `#site-style` | the site style panel: palette slots from curated tones, and the type scale |
| `#shortcuts` | the keyboard shortcuts dialog |
| `#empty` | a new page with nothing on it, inviting the first section |
| `#page` | the published page, no editing chrome (shot 1280 wide) |
| `#page-phone` | the published page on a phone (shot 390 wide) |
| `#tokens` | the token sheet: colours, spacing, type, radii, breakpoints, the mark |
| `#about` | the About dialog |
| `#context` | the right-click menu on a block |
| `#advanced` | the Advanced tab of a section |

The screenshots of every state are in `shots/` (the first thirteen, plus
`mark-16px.png`, the mark at favicon size on light and dark) and
`shots-extra/` (the last three, the app menu opened from the keyboard, and
the accent comparison).

## What is in the folder

- `index.html`, `script.js`: every state in one page; the script only reads
  the hash and shows the matching parts.
- `styles.css`: the editor's chrome. `theme.css`: the example site's theme,
  shared by the canvas and the published page.
- `tokens.json`: colours, contrast pairs, spacing, type, radii and
  breakpoints, as approved. The project's canonical file is
  `schema/tokens.json`, which has diverged from this one (see the top of
  this README).
- `mark.svg`: the mark, also the favicon.
- `img/`: the example site's illustrations, drawn for the mock.
- `fonts/`: Instrument Sans for the editor, Archivo and Source Serif 4 for
  the site, as woff2, each under the SIL Open Font License with its licence
  file beside it.
- `NOTES.md`: the designer's record, round by round; where an earlier
  passage and a later one disagree, the later one wins. `CHANGES.md`: the
  list of changes asked for after the three directions were judged.
- `layout/`: the editor's approved layout (above): `index.html`,
  `styles.css`, `script.js`, `NOTES.md`, `shots/` and `shots-extra/`.

## Tools

Run them from the repository root.

| Command | What it does |
| --- | --- |
| `node design/tools/contrast.mjs` | checks the WCAG contrast of every colour pair declared in `tokens.json`; fails below 4.5:1 for text and 3:1 for large text and controls |
| `node design/tools/shots.mjs` | photographs the thirteen main states and the mark sheet into `shots/`; fails on a missing state, a console error or any request outside the folder |
| `node design/extra-shots.mjs` | photographs the three extra states and the app menu into `shots-extra/`; also fails when a state shows other than one keyboard focus ring |
| `node design/accent-choice.mjs` | photographs the editor with each accent candidate and lays them side by side in `shots-extra/accent-choice.png` |

`contrast.mjs` needs Node only. The three screenshot scripts use Playwright
(the mock was shot with version 1.62.1) and run Chromium headless, without
opening a window. The repository root's `package.json` pins that version:
`npm ci` there installs it (its Chromium is downloaded separately, by
`npx playwright install chromium`, where it is not already cached).

The screenshots in the repository are the approved ones. A new run draws the
same states, but not byte for byte: anti-aliasing changes a few pixels in
some of them. `accent-choice.png` is the sheet the accent was chosen on,
taken before the final yellow's graphite lines were added, so a new run of
`accent-choice.mjs` gives a slightly different sheet.
