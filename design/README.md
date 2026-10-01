# design/

The approved design mock of Page Builder CMS: the editor, a published page
and the token sheet, drawn in static HTML and CSS before any code was
written. It is the reference the Rails templates and the React editor are
built against. Nothing here is the product: there is no build, no server and
no behaviour beyond switching between still states.

**Accent:** Tool yellow `#EDC200`, always with graphite edges and graphite
text on it, chosen on 1 October 2026 from three candidates shown in the same
editor (`shots-extra/accent-choice.png`).

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
  breakpoints. The project's canonical copy is `schema/tokens.json`.
- `mark.svg`: the mark, also the favicon.
- `img/`: the example site's illustrations, drawn for the mock.
- `fonts/`: Instrument Sans for the editor, Archivo and Source Serif 4 for
  the site, as woff2, each under the SIL Open Font License with its licence
  file beside it.
- `NOTES.md`: the designer's record, round by round; where an earlier
  passage and a later one disagree, the later one wins. `CHANGES.md`: the
  list of changes asked for after the three directions were judged.

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
