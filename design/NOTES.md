# Direction A: Light workshop

Working name in the mock: **Page Builder CMS**. Proposed name at the end.

> **Final mock.** Sections 1 to 10 are the direction as judged, with its
> accent passages brought in line with the final choice. Section 11, "Final
> round", records the 21 required changes; section 12, "The accent", is the
> one account of the accent; section 13, "Verification round 1", records the
> 18 fixes after the first verification; section 14, "Last round", records
> the 7 fixes after the second. Where an earlier passage and a later one
> disagree, the later one wins. In short: the accent is **Tool yellow
> `#EDC200`** (see "Approved" below; Brass and the golds of section 12 are
> superseded), focus is graphite everywhere, spacing steps are named None to
> XXL, the hero is two columns on desktop with its text on the page's
> reading edge, and the site theme lives in `theme.css`.

## Approved (1 October 2026)

The owner approved this mock as the reference for stage 1, with one change:
the accent.

- **Accent: Tool yellow `#EDC200`,** chosen from three candidates shown in
  the same editor (`shots-extra/accent-choice.png`, made by
  `accent-choice.mjs`): Brass `#806E00`, Tool yellow, and Ink teal `#0B5D6B`.
  - **Why not Brass:** the gold rule of section 12 left only a dark gold,
    and on white it read as khaki.
  - **Why not Ink teal:** it sits too close to the site's greens.
- **How a light accent is used:**
  - **Never alone on white,** where it is only 1.7 to 1. The selection line,
    the brackets, the drop line and the drop target are yellow with graphite
    keylines.
  - **Thin lines are graphite:** dimension lines, dashed drop zones,
    navigator brackets and insertion lines (`--mark-line`).
  - **Text and icons on yellow are graphite,** 9.7 to 1 (`--on-mark`).
  - **Labels on the canvas** are yellow chips with graphite text and a
    graphite edge.
- **The variables:** `--mark` is the colour; `--on-mark`, `--mark-key`,
  `--mark-ink` and `--mark-line` are what sits on it, around it, as text in
  it, and as thin lines. For a dark accent they would be white, white, the
  accent and the accent.
- **What was removed:** the gold study page (`accent-study.html` and its
  screenshot, which the older sections below still mention), and its Olive
  and Bronze variables and pairs. `tokens.json` declares Tool yellow's pairs.
- **The last fixes before approval:**
  - the edit-title icon is centred;
  - keyboard focus shows on Load map and on the video card;
  - the schedule date is a real Sunday;
  - video and map sit on one line, through a `data-valign` rule in the theme;
  - history rows match what the screens show.

## 1. Plan (written before building)

### Idea in one line

The editor is a well-made bench tool: metal-gray, exact, quiet. The page on
the bench is the only white, colorful thing in the window. The tool marks
out the work the way a machinist marks out metal: with a scribed line in one
working color, corner brackets and dimension lines that read in tokens,
never in pixels. (The judged version scribed in blue, the refined one in
brass, section 12; the approved one in Tool yellow, see "Approved".)

### Palette: editor chrome (6 core + accent + signals)

| Name | Hex | Role |
| --- | --- | --- |
| Graphite | `#1B1F24` | text, icons, pressed switches, every focus ring, the mark |
| Steel | `#56606B` | secondary text, hints |
| Rule | `#7E8690` | control borders (3:1 on every chrome surface) |
| Alloy | `#DCE0E5` | the bench: window background around trays and page |
| Key | `#E9ECEF` | tiles and pressable surfaces (added during the build) |
| Plate | `#F4F5F7` | trays: top bar, side panels, dialogs |
| Brass (the accent) | `#806E00` | the work in hand (selection, hover, dimension lines, insertion, the empty page's drop zone) and the primary action. Never focus, never a chosen option. Full list in section 12 |
| Signals | `#B3261E` error, `#8A5800` retrying, `#1E7B4A` live | status only |

White (`#FFFFFF`) is not a chrome color: it is reserved for content, meaning
the page and the fields you type into. The accent has no tint: a selected
row is Key with brass brackets, so nothing in the chrome drifts toward a
pale yellow or cream.

### Palette: default site theme "Slack Water" (6 editable slots)

A northern bay at dawn is gray-green, not holiday blue. The six default
slots hold no gold and no blue, so the brass marking line never blends into
the page. (A club can still pick the Harbour blue or the Lemon tone in Site
style; section 12 covers that.)

| Slot | Name | Hex |
| --- | --- | --- |
| Text | Ink | `#14302A` |
| Background | Paper | `#FFFFFF` |
| Primary | Sea | `#1E5B4C` |
| Accent | Buoy | `#F2A541` |
| Soft | Shallows | `#E6EFEA` |
| Muted | Slate | `#4E625B` |

Illustrations add one tint, Dawn `#F2D3C6`, for the sky. They are images, so
they keep their colors when the palette changes; everything else restyles.

### Type

- **Chrome: Instrument Sans** (variable, wght 400–700, wdth 75–100), SIL OFL
  1.1. Named for instruments and drawn with that precision; its narrower
  widths let dense labels stay short without shrinking. One family only.
  13 px UI text, 12 px hints, 14/16 px titles, tabular figures for times,
  hex values and sizes (no monospace).
- **Site: Archivo** (variable, wdth 62–125), SIL OFL 1.1, for headings and
  buttons, set **expanded (wdth 125)**: wide, low, calm letterforms, the flat
  line of water at slack tide. **Source Serif 4** (variable, opsz), SIL OFL
  1.1, for body text and the quote: a reading face with optical sizes, so the
  club's words feel written by people, not by the tool.
- Site type scale: ratio 1.333 from an 18 px body on desktop, 1.25 from 17
  on tablet, 1.2 from 16 on phones, applied by container query. Between a
  page 800 and 1280 wide every step grows together from its tablet size to
  its desktop size (section 13, item 6).

### Layout concept (1440 × 900)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [mark▾] Home  Published…  Site style  [Desktop|Tablet|Phone]  ↶ ↷ History ✓ Saved Preview [Publish│▾] │
├──┬──────────────┬──┬──────────────────────────────────────────┬──┬────────────┬──┤
│  │ Add │ Edit   │  │ ├──── Desktop, 832 wide ────┼──────┼──┤ │  │ Navigator ⌃│  │
│  │──────────────│  │       Tablet layout    Desktop layout     │  │ ▾ Hero     │  │
│  │ Heading      │  │   ┌────────────────────────────────────┐  │  │   ▾ Column │  │
│  │ Content Style│  │   │ Slack Water           nav     Join │  │  │  ⌜Heading ⌟│  │
│  │ Advanced     │  │   │ ┌[⠿ Heading ⧉ 🗑]──────────────┐   │  │  │     Text   │  │
│  │              │  │   │ ⌜ Swim at                    ⌝   │  │  │     Button │  │
│  │ Text  [____] │  │   │ ⌞ slack water                ⌟   │  │  │ ▸ What we do│ │
│  │ Level H1..H4 │  │   │   ├─ L ─┤  (dimension)           │  │  │ ▸ Gallery  │  │
│  │ Link  [____] │  │   │ Dawn swims, beginners' ...       │  │  │ ▸ ...      │  │
│  │              │  │   └──────── white page ──────────────┘  │  │            │  │
│  └──────────────┘  │              Alloy bench                 │  └────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
   left tray 288        canvas (page at the canvas width)          right tray 264
```

- Trays sit on the Alloy bench with an 8 px gap: separation by tone and
  space, not by lines. Rules only where a control needs a boundary (3:1).
- Left tray switches between **Add** (tiles) and **Edit** (properties of the
  selection), with Site style as a third view. Justification: the people
  using this are not designers and do one thing at a time; a switching tray
  keeps the canvas as wide as possible, so the desktop page on the canvas is
  the real desktop layout. Tiles are one click away (Add) or one key (Esc).
- Right tray: the Navigator, collapsible; History takes its place when open.
- Content is left-aligned everywhere, in the chrome and on the site.

### Signature element: the marking-out overlay

Selection is drawn like marking out on a workbench:
- a 2 px accent line around the block, with a white keyline, plus four bold
  **corner brackets** set just outside it;
- the floating toolbar is a solid accent tab fixed to the top-left bracket
  (drag handle, name, duplicate, delete);
- **dimension lines** with end ticks that measure spacing **in tokens**
  ("L"), on the canvas, next to the block. In tablet mode an override is
  written on the dimension line itself;
- the drop indicator in a drag is the same dimension line, laid across the
  column;
- the mark is two of those corner brackets.

Everything else in the chrome is quiet so this reads first.

### Principles

1. The page is the only white, colorful thing in the window.
2. The accent means "this is the work in hand": selected, being inserted,
   or about to ship (Publish, Use image). Tool switches are graphite, like
   pressed keys. Focus is graphite too, everywhere.
3. Measure in tokens. The canvas, the Style tab and the site style panel
   all speak "L", "Heading 2", "Sea"; block settings never use pixels.
4. Tone and space separate things; lines only mark boundaries you act on.
5. Tactile controls: keycaps with a heavier bottom edge, rulers with ticks,
   trays with a lip. No decoration beyond that.

## 2. Plan review against the brief and the defaults list

What I checked, what read as generic, and what I changed:

- **Accent.** The first instinct was a generic editor blue (#0D99FF-like),
  the default of every design tool. The judged version deepened it to a
  Marking blue; the owner's change list then called that the stock
  design-tool blue, and the next attempt, a survey magenta, turned out to
  sit in another page builder's brand family. The final accent, Brass, is chosen by
  rule rather than by taste: section 12 has the one account, with the two
  alternatives.
- **Chrome neutral.** The first draft had white panels. White panels plus a
  white page flatten the hierarchy; switched to Plate and Alloy, cool gray
  with no warmth, so nothing reads as cream or beige and the page is the
  brightest object.
- **Lines.** A light chrome drifts easily into hairline dividers, which is
  one of the defaults and also fails the 3:1 border rule. Replaced dividers
  with trays and spacing.
- **Cards.** The icon boxes were first drawn as three identical rounded cards
  with a shadow: the SaaS kit. They are now open compositions: a drawn icon,
  an expanded heading and serif text, no box.
- **Labels.** Panel groups ("Basic", "Media") in sentence case semibold, no
  tracked caps. Hex values and times in the sans with tabular figures, not in
  monospace. No arrows appended to buttons, no middle dots in meta lines
  ("Sep 28, 7:02 AM").
- **Save state copy.** The brief names one state "Not saved — retrying"; as
  product copy that is the spaced em-dash pattern, so the UI says "Not saved,
  retrying in 8 s".
- **Headline.** No accented word. The hero heading uses width, not color,
  as its device.
- **Serif.** The site uses a serif for body text. It is not the "serif
  display on cream" tell: the display is an expanded grotesque, the ground is
  white and gray-green. The serif is there so the club's voice is visibly not
  the tool's voice.

## 3. What was built

`index.html`, `styles.css` (chrome), `theme.css` (site theme), `script.js`
(sets `<html data-state>` from the hash, toggles what each state shows,
scrolls the canvas, moves focus into the app menu when it opens; nothing else
that matters), `tokens.json`, `mark.svg`, `img/` (11 SVG illustrations drawn
for this mock), `fonts/` (3 families, woff2, with licenses),
`accent-study.html` (section 12) and `extra-shots.mjs` (photographs the extra
states and the study into `shots-extra/`).

States: the 13 from the brief, plus three extra hash states that are reachable
in the mock and photographed in `shots-extra/`:

- `#about`: the About dialog, also reachable from the mark menu (top left).
  It reads "Page Builder CMS 0.1.0 — Developed by Riccardo Sapuppo". The same
  line closes the token sheet.
- `#context`: the right-click menu on a block (Copy, Paste, Duplicate,
  Delete, each with its shortcut). Right-clicking any block on the canvas
  also opens it at the pointer.
- `#advanced`: the Advanced tab of a section (section label, anchor id,
  hide on tablet, hide on phone).
- `shots-extra/app-menu.png`: the mark menu open (Site style, All pages,
  Keyboard shortcuts, About Page Builder CMS), opened from the keyboard.

Keyboard focus is drawn in every editor state, exactly once: the heading
text field (`editor`), the Space inside ruler (`style`), the dragged tile
(`drag`), Reload on the conflict banner (`save-states`), the alt text field
(`media`), the Date field (`publish`), the History button (`history`), the
Harbour tone (`site-style`), the shortcut search (`shortcuts`), the
"2 columns" button (`empty`), and in the extras Close, Copy, Section label
and the first app-menu item. `extra-shots.mjs` fails if an extra shows any
other number of rings.

### The left panel decision

The left tray switches between **Add** (tiles) and **Edit** (the selection's
properties), with a segmented switch at its top so both are one click away;
selecting a block switches to Edit, Esc goes back. Site style is a third view
of the same tray. Reason: the audience edits one thing at a time, and one
tray keeps the canvas at 832 px, wide enough that the "desktop" canvas really
renders the desktop layout (the container query switches to tablet below
800). Showing tiles and properties side by side would push the canvas into
the tablet layout on a 1440 screen, so the editor would lie about what
visitors see.

## 4. Signature element: the marking-out overlay

Everything the editor draws on the page is drawn like marking out on a
workbench, in one accent, brass:

- **Selection**: a 2 px brass line with a white keyline, four bold corner
  brackets outside it (also keylined), and the toolbar as a solid brass tab
  fixed to the corner (drag handle, name, duplicate, delete). The tab moves
  to the right corner when the left one would cover the block above.
- **Dimension lines** with end ticks that measure spacing in tokens, not
  pixels: "L" under the hero heading, "L" with a tablet glyph for the
  tablet-only Space inside override (`style`).
- **Insertion**: the drop indicator is the same dimension line laid across
  the column, inside a dashed slot, with the widget's name on it; the
  navigator shows the same line in the tree.
- **The mark** is two of those brackets around a block, in Graphite, drawn
  on a 16 px grid so it stays crisp at favicon size; the accent is only the
  dot in the middle.

The chrome around it is deliberately quiet: tone-separated gray trays,
graphite for every tool switch and every focus ring, no decorative lines.
The width rule above the canvas is the chrome's own line work, in graphite.

## 5. Fonts and licenses

| Family | Surface and role | Files | License |
| --- | --- | --- | --- |
| Instrument Sans (variable, wght 400–700, wdth 75–100) | Chrome, everything | `fonts/instrument-sans-variable.woff2` | SIL OFL 1.1, `fonts/LICENSE-InstrumentSans.txt` |
| Archivo (variable, wght 100–900, wdth 62–125) | Site headings, buttons, labels; set at width 125 | `fonts/archivo-variable.woff2` | SIL OFL 1.1, `fonts/LICENSE-Archivo.txt` |
| Source Serif 4 (variable, optical sizes, roman and italic) | Site body text, quote | `fonts/source-serif-4-variable.woff2`, `fonts/source-serif-4-variable-italic.woff2` | SIL OFL 1.1, `fonts/LICENSE-SourceSerif4.txt` |

All from `npm pack @fontsource-variable/<family>`, latin subset only. The
chrome uses one family. Where the chrome previews the site's type (the "Aa"
samples in Site style and in the Style tab), those samples are set in the
site's own fonts, because they are content previews, not chrome.

## 6. Defaults I did reach for, and why

- **Hairlines.** The accordion rows, the type-scale table in the token sheet
  and the accent study's ratio tables use 1 px rules. All are lists of rows
  you scan or open, so the rule is the boundary; all pass 3:1. Nowhere else.
- **Serif.** Body text only, on white and sea-glass, never as display type.
- **Left alignment everywhere**, including the empty-state invitation, to
  keep one reading edge. The hero's text shares it: its first column has
  Space inside None on desktop and phone (section 14, item 6), so it starts
  where the logo and every section below start.
- **A gold accent.** Not a default anywhere in software, which is part of
  the point; section 12 shows that gold is the only family the rule leaves.

## 7. Known weak spots

- The canvas at 1440 is 832 px wide, so the three icon boxes on the desktop
  canvas wrap to two or three lines. It is the true desktop layout at that
  width, but it looks tighter than the published page at 1280.
- The drag state is static: the ghost tile and cursor are placed by CSS, and
  the live-region caption is a visible mock of what a screen reader hears.
- Illustrations are flat and simple on purpose (they must read as
  placeholders the club would replace), but at gallery size a couple are
  close to abstract (rock pools).
- The type-scale choice (Gentle, Balanced, Strong) explains only the active
  step in words; a designer would still want the ratio numbers, maybe on
  hover.
- The Site style panel is full on a 900 px tall screen: a second open slot
  would make it scroll.
- The quote section has a second column with the tea illustration. It is an
  addition to the brief's copy (no new words, one image the club would
  plausibly have), made because a lone quote left two thirds of the band
  empty on desktop.
- Right-click is the only live interaction beyond hash links; everything
  else is a still.
- Section 14 lists the weak spots that are left after the last round.

## 8. What I would do next

1. Test the tray switching (Add and Edit) with five non-designers: do they
   find the tiles again after selecting something?
2. Draw the Style tab for every widget type, with the dimension lines on the
   canvas for each spacing control.
3. A second default theme (warm, for a studio or a coach) to prove the six
   slots and the type scale are enough, and to check Brass against a warm
   site (a site with a gold Primary would need the accent's keyline to do
   more work).
4. Motion: one 120 ms settle when a block drops, and the brackets closing in
   on selection; nothing else, and nothing with reduced motion.
5. Keyboard move mode in full: the brackets turn into a "lifted" state and
   the dimension line follows the arrow keys.

## 9. Name

Keep "Page Builder CMS" in the mock. Proposed name: **Setsquare**. A set
square is the drafting tool you use to get things square and true; the
product's whole idea is that people who are not designers still get pages
that come out square, measured in steps, never by eye. It is short, easy to
say, and it matches the mark (a square with two corners marked) and the
brass of measuring tools. It needs a trademark check before use.

## 10. Review log

The first run built all 13 states, the extras, fonts, tokens and these notes,
then stopped. The resumed run (Oct 1) kept that work, since it was complete
and both tools passed, and spent its time on screenshot review.

**Round 1** (all 14 PNGs plus the 3 extras, and 2x crops of the top bar,
selection toolbar, navigator, drag drop line, breakpoints and quote band):

- The hero and "first light" illustrations had a flat gray top band that
  read as an image still loading. Redrawn as a sea-mist sky with a
  first-light band and cloud streaks (two new illustration colors, Sky and
  First light, added to `tokens.json` and the token sheet).
- The top bar showed "Home /", the home page's path, which read as a broken
  breadcrumb. Replaced with a status chip (green dot), the counterpart of
  "Not published yet" on the new page, which has a hollow dot.
- The published quote band was a short quote with two thirds of the band
  empty. The section now has two columns: the quote, centered vertically,
  and the tea illustration. It stacks on tablet and phone.
- The save-state specimen frames had a tall empty white area under a thin
  image. (Later replaced: section 11, item 8, and section 13, item 8.)
- The breakpoints diagram was three gray boxes with markers. Redrawn in the
  signature language: dimension lines for the three layouts, a ruler, the
  two breakpoints as lines, and pins for the 390 and 768 previews and the
  1120 content limit.
- Site style: slot rows and scale rows tightened so the panel fits at 900 px.

**Round 2** (all PNGs again after the fixes):

- The new breakpoint lines ran down into the pin row; shortened to stop at
  the ruler.
- The media dialog had a dead band between the grid and its footer; dialog
  height reduced.
- The tea illustration showed a pink wedge between the sea and the rock on
  the left (visible at phone width). Sea band extended, three glints added.
- The About item was only reachable through a menu nobody had photographed;
  added `shots-extra/app-menu.png`.

**Round 3** (all PNGs): no new defects found in the 13 states; both tools
exit 0.

## 11. Final round (the 21 changes of CHANGES.md)

One line per item: what was done and where it shows. Facts that a later
round changed are given as they are now, with the change named ("round 1"
is section 13, "the last round" is section 14).

1. **Accent.** Marking blue is gone. The accent is now Brass `#806E00`
   (section 12; it replaced the magenta of this round in round 1).
   Not default blue, acid green, vermilion or terracotta; clearly apart from
   Sea, Buoy and the error red; ≥ 3:1 on paper, trays, keys and bench; white
   text on it 5.06:1. It shows on Publish, selection, the drop line and
   insertion; `tokens.json`, token sheet "Chrome colors",
   `shots/mark-16px.png`.
2. **Width rule.** A dimension line above the canvas reads "Desktop, 832
   wide" or "Tablet, 768 wide", with notches at 560 and 800 from
   `tokens.json`, named "Tablet layout" and "Desktop layout" (round 1);
   sticky, so it stays when nothing is selected. Every canvas state.
   Selections still show steps only.
3. **Plain spacing names.** "Space inside" and "Space between widgets";
   steps None, XS, S, M, L, XL, XXL (0 to 48) on the ruler with the base
   value as a hollow ring (`style`), "L" and "L + tablet glyph" on the
   canvas dimension lines (`editor`, `style`), "Set Space inside to L on
   tablet, Column 1 in Hero" (`history`), the token sheet "Spacing", and
   `tokens.json` `space.site`. The theme CSS uses the same names
   (`--space-m`…).
4. **Device switch** reads Desktop, Tablet, Phone in words with a small
   glyph each; top bar of every editor state.
5. **Scope labels.** The overridden control says "Tablet only" with the
   tablet glyph; every other control now says where its value comes from,
   "From desktop", and what a change does now, "A change here applies to
   tablets only" (round 1; `style`).
6. **`style`.** The canvas opens at the top at 768: the site header has
   folded into Join + a **Menu** button, and the hero, two columns on
   desktop, is stacked. Column 1 of the hero is selected; its tablet-only
   Space inside, L on all four sides (desktop and phone use M), is a real
   rule in `<style id="page-css">` inside
   `@container site (560px <= width < 800px)`, so canvas and page agree. The
   "Editing for tablet" banner, the override box with Remove and the
   dimension line are kept.
7. **`page-phone`.** Header shows the brand, Join and a closed Menu button
   (`aria-expanded="false"`, `aria-controls` the link list).
8. **`save-states`.** One name per state in the top-bar crop, the caption
   and the banner ("Saved", "Saving…", "Not saved, retrying", "Changed in
   another tab"). The fourth state is shown in place: the real top bar says
   "Changed in another tab" with Publish off, and the amber banner sits
   right under it with "Saving is paused until you choose". Consequence
   lines on each card ("Publish is paused until you choose", "Closing the
   tab warns that 6 changes would be lost", "Either choice can be undone
   from History"). A "How it moves between states" diagram replaces the
   thumbnails. The Connection lost toast sits over nothing. Warning tint is
   amber `#FBDA8E`, well away from `#F4F1EA`. (Cards redrawn in the last
   round, item 8.)
9. **`media`.** Header "10 images, 2 without alt text, 1 uploading" (count
   fixed in round 1), a "Missing alt text 2" filter, "No alt text"
   flags on buoy-line and winter-jetty, and Use image is off with the
   reason beside it.
10. **`site-style`.** Curated tones only, no Hex field. Primary is edited:
    "Harbour / Edited, was Sea", Reset to Sea, and two checks: "Button text
    on it: 8.9 to 1" and "Links on the background: 8.9 to 1". The top bar
    says "Saving…". The canvas stays at the top, so the hero heading shows
    in Harbour. No icon-box text is cut at the window edge.
11. **Type scale.** Seven distinct steps at about a third each on desktop
    (14, 18, 24, 32, 42, 56, 76), a quarter on tablet, a fifth on phones;
    Heading 3 is 32, Large text 24. The quote uses the Heading 3 step. The
    desktop rule for narrow pages was replaced in round 1 (item 6):
    every step, not only Display, grows between 800 and 1280.
12. **`empty`.** Undo and Redo are off; Publish is off with its reason as a
    line in the invitation ("Publish turns on once the page has a
    section…", linked by `aria-describedby`, plus a tooltip). With nothing
    selected the Edit tray shows the page: Title, Address, Description in
    search results, Show in the site menu (off by default, with a hint that
    says what turning it on does).
13. **`drag`.** The column opens a 40 px slot between Text and Map with the
    drop line in its middle; the ghost tile rides above the line inside the
    slot, clear of the map; forbidden areas are hatched in Steel at half
    strength over a Key wash, and the "Widgets go inside a column" note is
    in the clear.
14. **`publish`.** One focus ring (the Date field); "Visitors see your 6
    changes right away"; the live address "slackwater.example" under View
    live page; the time zone line with Change on the right (reworded in
    round 1). The top-bar chip of every Home state agrees: "Published, 6
    changes not live", with a half-filled Live dot.
15. **`shortcuts`.** One focus ring, the search field. (Focus is set per
    state by `data-focus`.)
16. **`history`.** "Current draft: 6 changes not published yet" heads
    Versions; rows use the step names.
17. **`editor`.** The Button hover tag sits to the right of the button, far
    from the paragraph; section rows show "2 columns" etc.; the navigator
    footer reads "7 sections, 21 widgets", the real count of the page
    (4 + 3 + 2 + 4 + 2 + 3 + 3).
18. **Quote icon** redrawn as two opening marks in outline, on the same
    20-unit grid and 1.5 px stroke as every other icon, so it reads as
    quotation marks and not as "99" at 20 and 24 px. The published quote
    opens with a solid “.
19. **Map.** The dark bar is gone (and the ramp was redrawn again in
    round 1, item 18).
20. **`theme.css`** holds the site theme and its fonts and nothing else; it
    loads before the chrome's `styles.css`. Canvas and published page use it
    alike; the page's own rules live in `#page-css`.
21. **States row** on the token sheet: focus on the chrome, focus on the
    canvas (both graphite since round 1), selection, Selected (added
    in round 1), device override, error.

The rounds of fixes inside this round (display wrapping, notch numbers,
tooltip under Publish, drag note, tray overflow, map ramp at the top edge,
dimension labels on the selection edge, override box, token sheet States,
save-state chips, the extras; then the outlined Quote icon, the transition
diagram on one subgrid, the Published chip, the site-menu switch; then the
time zone line and the desktop hero) are recorded in the files they touched;
where a later round changed them again, section 13 or 14 says so.

## 12. The accent: Brass, and the two other golds (superseded)

> Superseded on 1 October 2026: the owner chose Tool yellow `#EDC200` (see
> "Approved" at the top). This section is the designer's earlier reasoning,
> kept as history. Its rule of keeping every hue away from the example
> site's colours was stricter than needed: the site palette belongs to each
> site owner, and graphite keylines keep the selection readable on any of
> them.

**In the mock: Brass `#806E00`, with white as its text partner, and no
tint.** The two alternatives, Olive `#707000` and Bronze `#604A00`, are on
`accent-study.html`, photographed in `shots-extra/accent-study.png`, where
each one's contrast, hue and nearest neighbors are computed on the page.

**Switching.** One line in `styles.css` changes everything the editor draws:
`--mark: var(--accent-brass);` becomes `var(--accent-olive)` or
`var(--accent-bronze)`. Every chrome rule reads `--mark` (the toolbar shadow
too, through `color-mix`), and so do the mark in the top bar, the About
dialog and the token sheet, which are inline SVG drawn from one `#mark`
symbol whose dot is `fill: var(--mark)`, and the token sheet's accent chip.
Three places repeat the hex as text and change with it: the dot's fill in
`mark.svg` (the favicon file, which cannot read page CSS), the `brass`
value in `tokens.json` (the pairs of all three candidates are already
declared, so contrast.mjs checks them today), and the name and hex printed
on the token sheet.

### How it was chosen

- **What came before.** The judged version marked selection in Marking blue
  `#2447E0`; on gray trays it read as the stock design-tool blue. The next
  attempt, Survey magenta `#BC1A93`, sat in another page builder's brand
  family. A familiar way of working can be shared on purpose; another
  product's color should not be.
  Both are gone from the chrome. The blue, pink and magenta still visible in
  the mock belong to the site, which the club chooses: the Harbour tone
  (the canvas heading in `site-style`), the Cap pink tone, and the pink dawn
  skies of the illustrations.
- **The rule.** All of these, at once:
  - not a color other page and site builders wear: pink and magenta,
    purple and violet, the default blues, black as a brand, a shop
    builder's greens; and not on
    the defaults list (acid green, vermilion, terracotta);
  - at least 15 degrees of OKLCH hue from Sea, Buoy, the error red, the
    Retrying amber, the Live green and every brand color above, so it is
    never the same hue as one of them set apart only by lightness;
  - at least 0.06 apart in OKLab from every color in the product and its
    default site: chrome, signals, the six slots, the curated tones and the
    illustration colors;
  - at least 3:1 on Paper, Plate, Key and the Alloy bench; white text on it
    at least 4.5:1.
- **The sweep.** I went round the hue wheel in OKLCH, in 4-degree steps, and
  at each hue searched lightness and chroma for the color that holds the
  contrasts and is farthest from everything above. The hue test leaves two
  gaps: 86 to 111 degrees, between the Retrying amber (71) and a shop builder's
  light green (126), and 191 to 218, between the sea greens and the
  blues. The distance test closes the second one: at every hue from 180 to
  236 the best color stays 0.042 to 0.059 from the illustrations' Sea deep,
  a rock gray or a site builder's blue. So **one family is left: gold**, hue 86 to
  111. Inside it the distance test also limits lightness: from 86 to about
  93 only dark colors keep 0.06 from Retrying and Kelp. Every other hue
  lands on a brand, the site, a signal or the defaults list. (An earlier
  version of this section named a blue-green "island"; the sweep does not
  support it, and the alternative drawn from it, Verdigris, is gone.)
- **Why Brass.** It sits in the middle of the family. Its nearest color in
  the product is the Retrying amber (0.061), which never appears without its
  warning triangle and words; its nearest brand color is a shop-builder green
  (0.092); Sea is far away (0.160, hue 98 against 174). It suits the
  direction: a light workshop, where brass is the working metal of
  measuring tools, the edge of a rule, the stock of an engineer's square.
  On the cool gray bench it is the one warm, chromatic thing, so the work
  in hand reads first, and on a sea-green page it never melts in.
- **What it marks.** Everything that is the work in hand: the selection
  line, brackets and toolbar tab; the hover outline and its label; the
  dimension lines and their labels; insertion (the drop slot, drop line and
  label, the navigator's insert line); the brackets and icon of the
  selected navigator row; the icon of the block being edited, beside its
  name in the Edit tray; the dashed zone where the first section goes on an
  empty page; the token sheet's spacing bars and override chip, which draw
  those same marks; and the primary action, Publish and Use image. Never
  focus (a graphite ring everywhere), never a chosen option (a graphite
  check and inset ring).
- **White keyline.** The line, brackets, hover outline and toolbar tab all
  carry a 1 px white keyline, so a mark reads on Ink, Sea or an image
  (pairs "white on site-ink" and "white on site-sea"). The keyline also
  covers the case of a club that picks the Lemon tone, which shares
  Brass's hue but is far lighter (0.34 apart).
- **The mark.** Direction A's own drawing: two corner brackets in Graphite
  on the 16 px grid, with the same 1 px white keyline so they read on a
  dark tab; the accent is only the 2 px dot in the middle. No filled block
  (`shots/mark-16px.png`).
- **Publish** uses Brass, which the rule allows because gold is in none of
  the brand families.

### The three candidates

| | Hex | Hue | White on it | Paper | Plate | Key | Alloy | Shallows | Nearest in the product | Nearest brand color |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Brass** (in the mock) | `#806E00` | 98 | 5.06 | 5.06 | 4.64 | 4.27 | 3.82 | 4.31 | Retrying amber, 0.061 | a shop-builder green, 0.092 |
| Olive | `#707000` | 110 | 5.24 | 5.24 | 4.80 | 4.42 | 3.95 | 4.47 | Retrying amber, 0.077 | a shop-builder green, 0.084 |
| Bronze | `#604A00` | 89 | 8.48 | 8.48 | 7.77 | 7.15 | 6.39 | 7.23 | Kelp, 0.067 | a shop-builder green, 0.118 |

- **Olive** `#707000`, Brass pushed toward green, to the family's green
  edge (15 degrees from a shop builder's light green is the limit). The farthest
  of the three from every other color. But beside Brass the difference is
  small, and its green cast leans toward the site's Kelp tone and the Live
  dot instead of away from them.
- **Bronze** `#604A00`, Brass darkened, at the family's warm, dark edge,
  with the most contrast of the three. But it is nearly as dark as
  Graphite, so on the page a selection and a focus ring differ by hue
  alone, and Publish reads as one more dark key rather than the one
  colored action.
- The three differ less than three hues from around the wheel would. That
  is the rule at work: it decides the family, and the owner decides the
  shade.
- **Rejected on the way:** pink and magenta (a page builder's family,
  and the second attempt), violet and indigo (another page builder's), every
  blue (the big site builders and the judged Marking blue), green and
  teal-green (a shop builder, the Live signal, the sea), orange, rust,
  terracotta and vermilion (Buoy and the defaults list), crimson and red
  (the error red, that page builder's darkest brand red, direction C's
  raspberry), black (a site builder's brand). From the first study:
  Verdigris `#007B84` (0.048 from a site builder's blue, 0.049 from Sea
  deep, 0.064 from a shop builder's green) and
  Ochre `#96690A` (0.052 from the Retrying amber, and Buoy's hue family,
  78 against 69).

## 13. Verification round 1

One line per issue of the first verification: what was done, and where it
shows. Where section 14 (the last round) changed a fact again, the line
says so.

1. **Accent.** Survey magenta is gone; the accent is Brass `#806E00`
   (section 12), outside every page-builder brand family and the site
   palette, ≥ 3:1 on paper, trays, keys and bench, white text 5.06:1, white
   keyline on every mark. The mark is A's two graphite brackets with a white
   keyline and a brass dot, no filled block; Publish is brass. Every editor
   state, `shots/mark-16px.png`, token sheet "Chrome colors", `tokens.json`.
2. **Accent study.** Three candidates as variables in `styles.css`
   (`--accent-brass` and two alternatives; `--mark` switches them; the
   alternatives were replaced in section 14, item 1, by Olive and Bronze,
   and the switch now reaches the mark too). `accent-study.html` shows the
   editor corner (top bar with Publish, width rule, selected heading with brackets and
   toolbar tab, a hover outline, a selected image) three times, with names,
   hex values and ratios computed on the page with contrast.mjs's formula.
   Photographed headless by `extra-shots.mjs` to
   `shots-extra/accent-study.png`; explained in section 12.
3. **NOTES.** One account of the accent in section 12; sections 1, 2, 4, 6
   and 11 now agree with it instead of rejecting or adopting magenta (and,
   since section 14, item 2, with each other on the one gold family).
4. **Scope labels (`style`).** Each inherited control says "From desktop"
   at the right of its label and, under it, "A change here applies to
   tablets only" with the tablet glyph, matching the banner. The overridden
   control keeps "Tablet only".
5. **Selected vs focus.** A chosen option is now marked inside itself: an
   inset graphite ring with a white keyline and a check badge (Background
   swatches in `style`, Primary tones in `site-style`, the media tile in
   `media`). Focus is always the outer graphite ring, on the canvas too
   (with a white keyline in the gap), so "2 columns" in `empty` reads as
   focused, not chosen. `site-style` shows both on Harbour at once. Token
   sheet States row: new "Selected" specimen.
6. **Display one step above Heading 1.** In `theme.css`, from a page 800 to
   1280 wide every step grows in a straight line from its tablet size to its
   desktop size, all together; so Display is one step above Heading 1 at
   every width from 560 (54 and 43 on the 832 canvas, 52 and 42 at 800, 76
   and 56 from 1280). Site style shows one size per step and says in words
   "Sizes in a wide window; a narrower one shrinks them all together" (no
   "56–76"); token sheet Display "76 / 1.0" with the rule in its note;
   `tokens.json` `type.site.desktop-fluid`.
7. **Spacing note and width rule.** Token sheet: "block settings never use
   pixels". The width rule's notches are named "Tablet layout" and "Desktop
   layout" under them, in graphite; the token sheet's breakpoint lines are
   graphite too (they were magenta).
8. **`save-states`.** Cards are two by two so each crop holds the real right
   end of the top bar: save state, Preview, and the split Publish (enabled
   for Saved and Saving, disabled for Not saved and Changed in another tab).
   One count on the whole screen: 6 (chip, intro, tooltips, toast,
   consequence line).
9. **Drag and history agree.** Caption "Quote will be added to Column 2,
   after Text" (`drag`); History "Added Quote to Column 2" (`history`).
10. **Media count.** "10 images, 2 without alt text, 1 uploading": the
    uploading tile is not counted as an image until it is done (`media`).
11. **One shortcut notation.** Keycaps wherever there is room: Publish menu
    (Ctrl Shift Enter as three keys), context menu, app menu (?), History
    hint (Ctrl Z), shortcuts dialog. Plain-text tooltips use "Ctrl+Shift+Enter"
    form: Undo, Redo, Preview, Publish, Duplicate, Delete, Save version.
12. **Alignment labels (`style`).** "Alignment" heads two labelled groups,
    "Vertical alignment" and "Horizontal alignment", as in direction A as
    judged.
13. **Space inside on all sides.** `theme.css` `.col { padding: var(--col-pad) }`;
    the override box says "on all four sides" (`style`). (This round gave
    the hero's Column 1 M on desktop and phone; section 14, item 6, set it
    to None there, keeping L on tablet only.)
14. **Palette names only (`site-style`).** Slots show the slot and the tone
    name; the hex is in the tooltip only, like the tones.
15. **Publish copy.** Schedule… says "Choose when visitors see your 6
    changes."; the time zone line reads "In your site's time (UTC+1)" with
    Change (`publish`).
16. **History.** One date format in Versions, "Today, 10:20 AM" and "Sep
    28, 7:02 AM" (the draft card says "Today, 10:46 AM"; Published is
    "Published by you"); section 14, item 3, brought the This session rows
    into the same format. The Current draft card is marked out with two
    graphite corner brackets, the mark's own drawing, instead of the side
    stripe.
17. **One focus ring.** When the app menu opens, focus moves to its first
    item and the stale ring goes (`script.js`); `app-menu.png` is opened from
    the keyboard. Every editor state and extra now shows exactly one ring
    (list in section 3); `extra-shots.mjs` checks it.
18. **Map.** The slipway is a wide grooved concrete ramp square to the
    shore, from the end of the footpath across the sand into the water, its
    lower half fading under the water with a waterline and ripples; the pin
    sits on its head (`drag`, `page`, `page-phone`, media thumbnail).

The weak spots left after this round are listed, updated, at the end of
section 14.

## 14. Last round

One line per issue of the second verification: what was done, and where it
shows.

1. **Three candidates that all meet the rule.** Verdigris and Ochre are
   gone. A sweep of the hue wheel (section 12) leaves one family, gold, so
   the alternatives are the two other golds that pass: **Olive `#707000`**
   (hue 110, nearest product color the Retrying amber at 0.077) and
   **Bronze `#604A00`** (hue 89, nearest Kelp at 0.067), beside **Brass
   `#806E00`** (hue 98, Retrying at 0.061). `styles.css` `--accent-olive`
   and `--accent-bronze`; `tokens.json` `accent-alt-olive` and
   `accent-alt-bronze` with their pairs. The switch now reaches the mark:
   the top bar, About and token sheet draw it as inline SVG from one
   `#mark` symbol whose dot reads `--mark`, and the token sheet chip reads
   `--mark` too; only `mark.svg` (the favicon file), `tokens.json` and the
   token sheet's printed name and hex repeat the color as text (section
   12, "Switching"). `accent-study.html` adds a hue band that shows the one
   window the rule leaves, with the three ticks inside it, and computes
   each candidate's hue and nearest colors on the page;
   `shots-extra/accent-study.png`.
2. **NOTES agree with themselves.** Section 6 and section 12 now say the
   same thing, one family (the "two islands" passage is replaced by the
   sweep's result, with the numbers that close the blue-green gap). The
   claim that nothing in the mock is blue, pink or magenta is replaced by
   what is true: none of it is in the chrome; Harbour, Cap pink and the
   dawn skies belong to the site. Section 1's role line for the accent now
   matches section 12's full list (hover label, dimension lines, the
   edit-title icon and the empty page's drop zone included), and so does
   the comment above `--mark` in `styles.css`. The old "last round" is
   renamed "Verification round 1" (section 13) and its references follow.
3. **One time format in History.** The This session rows put the time
   under the action, written like the Versions rows: "Added Quote to
   Column 2 / Today, 10:46 AM", the same words as the Current draft card
   (`history`).
4. **No brand names on the pages.** The token sheet note under Chrome
   colors and the accent study intro now say "a shop-builder green"; no
   page, stylesheet, script or `tokens.json` names a real company
   (`tokens`, `shots-extra/accent-study.png`). The names were later taken
   out of these notes too (see "Weak spots left").
5. **One persistence claim.** The save-states intro says the changes "are
   kept in this tab until the server confirms them, so a failed save loses
   nothing", and the Connection lost toast says "Your 6 changes are kept in
   this tab"; so "Closing the tab warns that 6 changes would be lost" now
   follows from them (`save-states`).
6. **The hero on the reading edge.** `#page-css` no longer gives the hero's
   Column 1 Space inside M: it is None on desktop and phone (the theme's
   default) and L on tablet only, the override the `style` state shows. On
   `page` the logo, heading, text and button all start at x = 80 and the
   image ends at 1200 with the gallery; on `page-phone` logo, heading,
   button and image all span 24 to 366; on the editor canvas they start at
   380. In `style` the ruler's hollow ring moved to None, and the override
   box and the slider's text say "Desktop and phone use None". The column
   outline now sits at 6 px, exactly under a selected widget's line and
   keyline, so a heading that touches its column's edge never draws two
   lines side by side (`editor`, `publish`, `context`).
7. **One drop rule.** The empty page no longer promises a widget dropped on
   the page: its last line reads "Widgets go inside a column, so the
   section comes first; then drag them in from Add, on the left", with the
   same no-entry glyph and the same words as the drag state's "Widgets go
   inside a column" note (`empty`, `drag`). The intro above it is shortened
   so it no longer repeats the point.

### Weak spots left

- The three candidates differ less than three hues from around the wheel
  would; Olive beside Brass is a small step. That is what the rule allows,
  and the study says so.
- Brass is related to the Retrying amber (0.061, the least margin of the
  three): the save-state screen shows both close together. The amber always
  comes with the warning triangle and words.
- Other products are not named anywhere in this folder, these notes
  included (the owner's rule of 1 October 2026): the brand families are
  described by their colors only.
- The `style` state still shows the hero text inset 24 px on tablet: that
  is the tablet-only override the state exists to demonstrate.
- Between 800 and 1280 the whole type scale is slightly smaller than the
  token sheet's desktop column (body 17.1 on the 832 canvas). The sheet
  says so, but the numbers in Site style are the wide-window sizes.
- The width rule's "832" is written for the 1440 window the mock is shot
  at; the product would measure it.
- The Phone device button is still not wired to a state; the phone layout
  is shown by `page-phone`.
- In the transition diagram the middle column is as wide as "Changed in
  another tab", so "Saving…" sits centred in a wider chip than it needs.
- The chip counts 6 changes in every Home state, including `site-style`
  while a palette edit is saving; whether site style changes count as page
  changes is a product decision the mock does not make.
