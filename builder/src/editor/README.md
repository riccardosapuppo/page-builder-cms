# src/editor/

The editor's interface, built on the approved design (`../../../design/`,
`index.html` and its screenshots).

- It reads the store (`../store`) and dispatches commands; it never edits
  the document itself.
- It saves and loads only through the storage adapter (`../storage`).
- The canvas uses `../render` and the published page's CSS
  (`../shared/site.css`); its tablet and phone widths are container
  widths, so the page's container queries apply as on a real device.
- One fixed locale, en-US.

`../main.tsx` mounts `App.tsx` on the Rails adapter, the system clock and
random block ids.

## What is here

| File | What it is |
| --- | --- |
| `App.tsx` | The shell: the grid of the design, the site's pages, media library and site style read through the adapter, a page opened (`openDocument` before the store takes it, the page's id in the address as `?page=`), its autosave fed every new document, the server's 422 laid on its blocks (`errorsByBlock`, on the document that save sent), a warning before the tab closes while edits are only here; publishing (the edits waiting saved first, then published at that revision), the preview opened in a tab once they are sent, the conflict settled the person's way (Reload as a step of the session, which Undo takes back; Keep mine after keeping the server's draft as a version, "Before Keep mine"), the page's versions read for the history, "Save version" and restore (each after the edits waiting are saved; the restored draft takes the canvas only when this tab has nothing the restore did not keep, else the conflict bar asks; undo starts again, and the notice says why), and the site style's changes sent one at a time, a refusal put back |
| `TopBar.tsx`, `Menu.tsx`, `NewPageDialog.tsx` | The mark's menu (Site style, the pages, the shortcuts, About), the page switch (the site's pages, a new page), whether the page is live and how many saved changes are not, Site style, the device previewed, undo and redo (greyed, and saying so, with nothing to do) and History, the save state, Preview and Publish |
| `HistoryPanel.tsx`, `history-words.ts`, `history.css` | The history, in the navigator's place: this session's steps newest first, the undone ones on top, any of them a button that undoes or redoes up to it; the draft and the page's versions, named by why, when and their name, with no author, the live one marked; "Save version" with an optional name (Ctrl+S opens it); Restore |
| `SaveStatus.tsx` | Where the edits are, from the autosave's snapshot: the top bar's word (Saved only when the server has every edit; a countdown to the next try, on the injected clock, never read to a screen reader); the toast of a save whose outcome is unknown, with Retry now; the conflict's banner, an alert, with Reload and Keep mine |
| `Publish.tsx` | Preview, a link to the draft's preview on the CMS's own origin; the split Publish button and its menu (Publish now, the live page), waiting and saying why on an empty page, a conflict or a save not confirmed; nothing for what the storage lacks (no Schedule before stage 4) |
| `SiteStylePanel.tsx` | Site style, the one screen that changes the tokens: each slot's curated tones, their contrast in words, back to a new site's tone, the type scale and its steps |
| `AboutDialog.tsx` | About: the mark, the version (the package's, held to the repository's) and "Developed by Riccardo Sapuppo" |
| `LeftTray.tsx`, `Palette.tsx`, `insert.ts`, `pickers.tsx` | The Add and Edit tabs; the widget panel, its tiles in labelled groups with a search; where a new block goes (after the selection, as a paste does); what an image, a gallery or a video needs before it is added (images from the media library, below) |
| `library/` | The media library (design/shots/media.png), opened by every image tile, Replace image, a gallery's Add images and the picture beside text, and from the mark's menu to look after the library itself. A search, three filters (all, on this page, missing alt text), the count. Uploads (`service.ts`, through the storage adapter only): one at a time, each drawn again first in the browser (`resize.ts`: the EXIF orientation applied, at most 2400 px on the long side, proportions kept, in its own format, the camera's notes left behind; an image that moves goes up as it is), with its progress and a way to stop it; what the browser or the CMS refuses keeps its reason (`files.ts`). No image is placed without alt text or the decorative mark: the button says why it waits and leads to the field. Placing is one command born with the mediaId, the alt text copied in and kept as the library's proposal. Delete, asked twice, after the edits waiting are saved; one the CMS refuses names the pages and kept versions that show the image (`words.ts`). The footer says the CMS makes no smaller copies (`capabilities.imageVariants`) |
| `panels/` | The Edit view: the page's panel, and a block's with its Content, Style and Advanced tabs. The Content tab of a widget is its own, in `../widgets/<widget>/panel.tsx`. The Style tab edits the device the canvas previews (design/shots/style.png): the base on the desktop; with a tablet or a phone previewed, that device's values only, each setting saying "From desktop" or "Tablet only", an override naming the desktop's value (a ring on the ruler) with a Remove that takes the device's key out, the focus back on the setting |
| `device-style.ts` | A block's style per device as the page's container queries apply it: a tablet or a phone shows its own value, else the base, a phone never the tablet's; the devices a block has values of its own on; "back to desktop" as the key taken out, never the desktop's value written in its place |
| `controls.tsx`, `errors.ts` | The panels' fields, each with its label, hint and errors tied to it; a finding of the editor's checks or of the server's 422 said as a sentence about the field |
| `Canvas.tsx`, `presets.ts` | The page on the bench, between the theme's header and footer (locked), drawn smaller when the canvas is narrower than the page (the width rule saying both widths), the editor's own controls and words on it kept at their size; the marks of the selection and its floating bar (at the block's top left corner, at the right one where the left would cover the words above, and, while a text is written, under the block where both would), the canvas's one Tab stop (the selection, or, where the device previewed does not draw it, the nearest block around it that is drawn), the section's tab (grip, name, +), the dimension lines, the hover outline (a button's hugging its pill) and its name, beside the block or, where the canvas has no room there, above its right end, over the frame of a selection just before it, and placed again when the window's size changes the page's scale; the name stands where the block's outline is, so a block taller than the canvas, scrolled past its top on a page drawn smaller, shows it again only when its top is back in view, as a column's and a section's names do (kept so: a name pinned to the canvas's edge would stand apart from the block it names); the empty page's invitation and its ready-made sections; a text block opened where it stands (a click on the text already selected, a double click, Enter, or its panel's button), its bar carrying bold, italic and link and its link's field under it |
| `Navigator.tsx` | The page as an ARIA tree, in step with the selection both ways, the selection's path open; the theme's header and footer as two locked rows around it; a block with a tablet's or a phone's own values flagged with the device's glyph, said as the row's description; one hidden on some device grayed out |
| `act.ts`, `pending.ts` | The one way every command runs, from a button, a key, the block's menu or a drop: the text still waiting in a panel's field or in a text on the canvas is handed over first, as a command of its own, and a text the page refuses keeps the command from running; then the command; then the focus where its result says (the neighbour after a delete, the new block after an insert, a paste or a duplicate, the block touched after an undo), on the canvas or on the navigator's row |
| `drag/` | Drag and drop on the store's drag, behind one module for the drag library (`drag/dnd.ts`, `@dnd-kit` 0.5.0): the selected block (the floating bar's grip, or Space) and each widget panel tile as sources; where a block would land, from the pointer's coordinates or from the keyboard's steps (`place.ts`, `steps.ts`); the marks the canvas draws (`marks.ts`); the live region (`DragLayer.tsx`) |
| `rich/` | Rich text on the canvas: TipTap with exactly the schema's nodes and marks, the link cut to its href and held to the URL policy and the schema (`extensions.ts`, `link-check.ts`); a paste cleaned to what the schema allows (`paste.ts`); what the page takes of a text held while it is written, from the schema's counts and the page's nesting at the block's place: a key, a mark or a link past it not done and said, a paste cut to what fits and said (`limits.ts`); the editor as the canvas makes it (`setup.ts`), loaded on demand with TipTap in a chunk of its own (`TextEditor.tsx`, through `tools.ts`), opened in the same moment once the chunk is here, the focus in it at once, and the keys pressed while it is still on its way kept from the block and typed into it when it opens (`../keys.ts`, `waitForText`), unless another block is chosen first, which gives up the opening and its keys (`tools.ts`, `forgetLeftText`); one text being edited and its two histories (`text-session.ts`: the typing becomes ONE command of the page when the person pauses or leaves the text, before any other command and at a drag's start, and TipTap's history is closed there, so Ctrl+Z in the text is TipTap's and outside it the page's; a text the page refuses all the same is never dropped: the editor stays open saying why, and the commands, drags and the leaving that would lose it wait); its buttons and link field on the block's bar (`FormatBar.tsx`) |
| `keymap.ts`, `keys.ts`, `ShortcutsDialog.tsx`, `selection.ts` | The keyboard map in one table: the editor's one keydown listener runs it, the drag library's keyboard sensor and the text editor take their keys from it, every title and `aria-keyshortcuts` names its keys from it (a test reads the source for a key written anywhere else), and the "?" window lists it; the arrows' order through the page. While the person types (a field, a text on the canvas) the typing keys are the text's: only the entries marked `typing` work there (Save a named version, Preview, Publish now), looked for before the text editor cancels Enter; a chord with Alt counts there by the key it types, never with AltGr |
| `BlockMenu.tsx`, `Menu.tsx`, `clipboard.ts` | The block's menu (right click, or the menu key): copy, paste, duplicate, delete; copy and paste through the browser's clipboard events, so a copied block is on the system clipboard as text |
| `plain-words.ts` | The words the history, the media library and the keymap's notes share, so they read alike: a day against the clock's ("Today", "Yesterday", "Sep 28", "Dec 30, 2025") and a list in a sentence ("A, B and C") |
| `context.tsx`, `ui-store.ts`, `session.tsx` | What every part reaches: the editor store, the interface's own store (hover, preview, tabs, library, site style, the server's errors, the drag's mode and what the live region said), the page session |
| `icons.tsx`, `editor.css` | The design's icons and stylesheet; the design's resets of bare elements are kept off the canvas |

## Not here yet

Scheduling a publish is stage 4. The top bar draws no control for it
until it works, and the "?" window lists no key for it.

## Where it departs from the approved design, on purpose

Each of these is a choice, kept for a reason, and open to the design's
owner to undo:
- **"?" window:** the design's two rows of three groups, and a third the
  design does not draw: a Text group, two columns wide, listing the keys
  inside a text being written (bold, italic, link, Esc to leave) with a
  note on Ctrl+Z there, on Delete and Backspace deleting letters and on
  the keys that work while typing; and an Adding group (Enter on a widget
  panel tile adds it after the selection). The window is the keymap
  written out, so every key that works is in it; laid out so, it keeps
  inside a window 800 pixels tall (690 there). Enter, "Edit the text of a
  block", also goes to the first field of a widget whose words are in its
  panel. Its keys stand 8 pixels from their words, not 12, so "Select the
  parent column or section" keeps to one line as in the design.
- **Style tab:** Background offers the palette's six slots in the design's
  order, and Slate, which the design does not draw, last; Text color,
  which the design does not draw either, comes after Alignment. A
  column's text sizes are the design's three, Small, Body and Large (a
  step it already holds is listed too, so it shows); a heading, a text or
  a quote offers the type scale's seven. A setting the block leaves unset
  shows the value in use checked, as the design draws None and Body: a
  section's or a column's None, a button's Accent, the level's size for a
  heading, a quote's Heading 3, a column's Body, Top and Left, and for a
  widget its column's size and alignment; not a colour, which the band
  around the block decides. A column's two alignments are the design's one
  Alignment field; when the two come from different places (one the
  tablet's own, say), each says where beside its name.
- **Style tab on a tablet or a phone:** where the desktop sets nothing,
  the override says "the theme’s default", and the ruler stands on the
  theme's step where the theme has one on every width (a column's None
  inside, its L between widgets). A phone override names the tablet's own
  value when it has one ("tablets have their own, L"). On the desktop, a
  setting a device overrides says so under it ("Tablets have their own:
  L."). The Advanced tab says, under its switches, why a block hidden on
  the device previewed is gone from the canvas. A section's space above
  and below has nine steps, which the design does not draw: the two
  section steps print their names on two lines ("Sec" over "S"), so the
  nine stand apart in the tray's width.
- **Drag caption:** it names the section as well as the column ("to
  Column 2 in See the bay"), where the design says "to Column 2". The
  caption is the live region a screen reader hears, and a page has a
  Column 2 in most sections.
- **Top bar:** a bar a few pixels short of room for every word draws the
  save state closer to its neighbours (2 pixels on its right instead of
  8, none on its left instead of 6) before History and Preview give up
  their words; the save state takes the room of "Saving…" when it says
  "Saved", so a save moves nothing.
- **Site style:** a "Saved for every page" line under the panel's title,
  where the style's own save shows (the top bar's word is the page's);
  a chevron on Primary and Accent, which open to their tones; contrast
  ratios cut to one decimal, not rounded ("8.8 to 1" for 8.86), so a
  ratio never reads above a threshold it misses.
- **Rich text:** the design draws no text being written. While a text is
  open, the block's own bar (grip, name, duplicate, delete) also carries
  bold, italic and link, between thin rules, a button that is on drawn
  graphite with the bar's yellow; the link's field opens under the block
  in the panel's field style. The bar keeps the design's rule, the right
  corner where the left one would cover the block above. While a text is
  written, the bar never covers the block above: where both top corners
  would (a heading as wide as its column, or one wider than what is left
  of a narrow column beside the bar), it stands under the block, its link
  field under it, in the bottom corner that covers less, even over the
  next block (a button, a divider), as the link field does; there the
  canvas scrolls just enough to show it, as long as the caret stays in
  view. Not writing,
  where both top corners would cover the block above, the bar stays in
  the one that covers less, as the design draws a selected block's bar
  at the top. The text widget's Content tab has no text
  field: its words are written on the page, and the tab opens the editor
  there and says how.
- **The empty page's panel** has no "Show in the site menu" toggle: the
  site's menu is the theme's (`cms/config/site.yml`), which nothing in
  the editor changes yet.
- **History:** no version says who made it ("Saved", not "Saved by you"):
  the CMS has no people, and a version's words come from why it was made,
  when, and its name. A restore says what it copied back ("From “First
  draft”, Sep 27, 9:15 PM"), and the draft a restore replaced is listed
  as "Before restoring". With no step yet, "This session" says so in a
  line. "Save version" opens a name field under it, which the design
  does not draw. Keep mine keeps the page it saves over as a version
  named "Before Keep mine", so that choice, like Reload, can be undone
  from History, as the design's save states say.
- **Media library:** replacing an image, its button says "Use image", as
  the design does; adding one (a tile, a gallery's Add images, the empty
  page's pictures), it says what placing does ("Add image", "Add images",
  "Add section"), which the design does not draw. The drop tile names the
  formats the CMS takes, JPEG, PNG, WebP and GIF, where the design lists
  SVG, which the CMS refuses; and it says the size an image is sent at.
  The footer's line goes on to say that the CMS makes no smaller copies,
  so each image is resized here first. Opened from the mark's menu, to
  look after the library, a hint under the alt text says where the text
  goes; with nothing chosen, the details say so and offer
  an image from another site by its address; a refused upload stays in
  the grid with its reason; the chosen image's details end with Delete
  from library. The mark's menu has a Media library item.

## Checks

One test file per panel, next to it, drives its controls and checks the
page and the command that changed it, and lays the server's 422 on the
store as the shell does, then finds it on the field it names; the
canvas, the widget panel, the navigator, the top bar, the history panel
(in strict mode where an effect matters), the style per device
(`device-style.test.ts`: "back to desktop" on random styles of every
block, with the desktop's value written in its place planted to see the
check fail), the shell (on an adapter of the
test's own and a fake clock; `App.versions.test.tsx` on one that keeps
versions by the CMS's rules: a restore with an edit waiting, an edit
typed while it travels), the command runner, the
keymap and its listener, and the drag layer's preview and live region
have theirs here, and so does the text editor in `rich/` (its nodes and
marks against the schema, the link's check, the paste, its two histories,
random texts and random editing, on the real editor in jsdom). The media
library's are in `library/`: a file's rules, the uploads against a
storage of the test's own, and the dialog (alt text before an image is
placed, one command, an upload kept off the page, a refused delete, Esc
in the delete question taking back only the question). jsdom lays nothing out, so the pointer, the keys and
the clipboard are Chromium's, against a CMS of the run's own:
`../../e2e/editor.spec.ts` (the shell; sections anchored with the
editor's own ids, which hold an underscore no anchor can; the theme's
header and footer, locked; and in a 1280 by 800 window the pages drawn
smaller to fit, the editor's own controls and words on them kept at
their size and in their place, a hovered block's name kept inside the
canvas, drawn over the frame of a selection just before it and placed
again when the window's size changes under the pointer, a stacked
column's tab and the page's title kept whole),
`drag.spec.ts` (every drop by mouse and by keyboard, Space with the
button held, refused drops, Esc, a drag on a page drawn smaller, its
words at their size),
`focus.spec.ts` (the focus after every command), `keyboard.spec.ts`
(every key of the map, and the "?" window listing them; in a text being
written, Delete, Backspace and Ctrl+D changing letters and never the
block, and a version kept, a publish and a preview from inside the text,
each with what was just typed), `devices.spec.ts` (a tablet's and a
phone's own space set in the Style tab, the canvas at 768 and 390 and the
page the CMS serves in windows of those widths showing the same; Remove
leaving the draft with no tablet part, the focus on the ruler, undo and
redo; a section's nine spacing steps printed apart on its rulers; a
block hidden on phones gone from the phone's canvas and page and still
on the tablet's), `rich-text.spec.ts`
(a text opened where it was clicked and laid out as the page lays it out;
typing and a drag of the same block at once, the text a step before the
move; undo and redo inside the text and outside it to the CMS's very
draft; bold, italic and a link from the bar, a refused address and its
reason; a word processor's paste and a web page copied in the browser,
as the CMS saves them; the editor's code fetched only once a text is
selected; axe with the link's field open), `menu.spec.ts`
(the block's menu), `marks.spec.ts` (the canvas's marks leaving the
page's layout alone, a button's hugging its pill wherever its own or
its column's alignment moves it, the section's tab,
the dimension lines), `save.spec.ts` (a slowed network, a save the
network drops and its same saveId, an answer lost, a second writer
through the API, words not yet handed over when the tab closes, a 422
whose fix was typed meanwhile, a page left while the next one loads),
`two-tabs.spec.ts` (the same page in two browser contexts: the 409 and
its bar, Reload and Keep mine each to its end and each undone, a save
the network drops sent again with its saveId into the conflict, closing
that tab asking first, a restore in one tab told to the other),
`history.spec.ts` (undo and redo from the top bar, a step chosen in the
history, Save version, Restore and its undoing, the live version, axe on
the panel), `media.spec.ts` (an image of 3000 pixels uploaded at 2400
with its progress, given its alt text, placed as one step, published and
served with it; a photo marked to be turned uploaded turned and with no
EXIF left; an SVG and an image too large once made ready refused, each
saying why; a delete the CMS refuses naming the page; axe on the open
library), `publish.spec.ts`
(the preview, a publish, the live page the CMS serves), `site-style.spec.ts`
(the canvas and the published page following a change), `identity.spec.ts`
(the mark read back at 16 px), `a11y.spec.ts` (axe in twenty-seven states, at 1440 by 900 and at 1280 by 800,
among them a text being written and its link's field, a tablet's
override, the history and its name field, the media library; and on the
published page), `widgets.spec.ts` (each widget's accessibility
test) and `keyboard-path.spec.ts` (the whole path with no pointer:
insert, move, a heading's text and level, a word made bold in a text on
the canvas, a column's tablet space, an image uploaded through the
system's file chooser and placed with its alt text, undo and redo, a
named version, publish, the live page read at a desktop's and a
tablet's width). The
ones tagged `@a11y` are what `npm run check:a11y` runs. `npm run
shots:editor -- <folder>` photographs the editor in the design's states
on the example site (`../../e2e/shots/editor-shots.ts`).
