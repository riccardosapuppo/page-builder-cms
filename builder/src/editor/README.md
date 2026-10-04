# src/editor/

The editor's interface: the identity of the approved design
(`../../../design/`, `index.html` and its screenshots), laid out as the
approved layout (`../../../design/layout/`, approved on 3 October 2026):
the top bar, the drawers floating over the canvas, one sidebar on the
right, the bottom line.

- It reads the store (`../store`) and dispatches commands; it never edits
  the document itself.
- It saves and loads only through the storage adapter (`../storage`).
- The canvas uses `../render` and the published page's CSS
  (`../shared/site.css`); its tablet and phone widths are container
  widths, so the page's container queries apply as on a real device.
- One fixed locale, en-US.

`../main.tsx` mounts `App.tsx` on the Rails adapter, the system clock and
random block ids, with the sidebar's open groups as this browser kept
them (`open-groups.ts`).

## What is here

| File | What it is |
| --- | --- |
| `App.tsx` | The shell: the layout's grid (the top bar; the drawer open, over the canvas's left; the canvas; the sidebar; the bottom line, in the order the Tab key goes), the site's pages, media library and site style read through the adapter, a page opened (`openDocument` before the store takes it, the page's id in the address as `?page=`), its autosave fed every new document, the server's 422 laid on its blocks (`errorsByBlock`, on the document that save sent), a warning before the tab closes while edits are only here; publishing (the edits waiting saved first, then published at that revision), the preview opened in a tab once they are sent, the conflict settled the person's way (Reload as a step of the session, which Undo takes back; Keep mine after keeping the server's draft as a version, "Before Keep mine"), the page's versions read for the history, "Save version" and restore (each after the edits waiting are saved; the restored draft takes the canvas only when this tab has nothing the restore did not keep, else the conflict bar asks; undo starts again, and the notice says why), and the site style's changes sent one at a time, a refusal put back |
| `TopBar.tsx`, `PageSwitch.tsx`, `Menu.tsx`, `NewPageDialog.tsx` | The top bar: the mark's menu (Site style, the pages, the media library, the shortcuts, About); Insert, Outline and History, each opening and closing its drawer; undo and redo (greyed, and saying so, with nothing to do); in the middle, the page's title, which opens the site's pages (a small window with a search, each page's address and whether it is live, New page), and under it whether the page is live and how many saved changes are not; the save state, Preview, Publish and the sidebar's key. Short of room, the title is cut last: the save state draws closer first, then the drawers' and Preview's words give way to their icons |
| `Drawer.tsx` | The drawers: one open at a time, floating over the canvas's left at every width, so the page keeps its width; each takes the focus when it opens (what it marks, else its first key) and gives it back, on Esc or its close button, to where it was before it opened |
| `Sidebar.tsx` | The one sidebar: the Page tab (the page's own settings, and Site style one click below it, with its way back) and the Block tab (the selection's panel), following the selection and chosen by hand in between, the choice holding for that selection only; hidden from its own button (over the site style too) or the top bar's key, the canvas taking its room |
| `open-groups.ts` | Which of the sidebar's groups the person keeps open, per block type, kept in the browser's local storage: read when the editor starts, written when it changes, every read and write tried, and only its own shape taken back |
| `StatusBar.tsx` | The bottom line: the selection's path from the page, each step a button; a hint when nothing is selected or a column or section is; while a block moves, the live region's sentence in its place, the line graphite; Block edges; the devices, a radio group (Desktop, Tablet 768, Phone 390); the page's width as the canvas lays it out, its layout, and the scale it is drawn at |
| `HistoryPanel.tsx`, `history-words.ts`, `history.css` | The History drawer: this session's steps newest first, the undone ones on top, any of them a button that undoes or redoes up to it; the draft and the page's versions, named by why, when and their name, with no author, the live one marked; "Save version" with an optional name (Ctrl+S opens it); Restore |
| `SaveStatus.tsx` | Where the edits are, from the autosave's snapshot: the top bar's word (Saved only when the server has every edit; a countdown to the next try, on the injected clock, never read to a screen reader); the toast of a save whose outcome is unknown, with Retry now; the conflict's banner, an alert, with Reload and Keep mine |
| `Publish.tsx` | Preview, a link to the draft's preview on the CMS's own origin; the split Publish button and its menu (Publish now, the live page), waiting and saying why on an empty page, a conflict or a save not confirmed; nothing for what the storage lacks (no Schedule before stage 4) |
| `SiteStylePanel.tsx` | Site style, the one screen that changes the tokens: each slot's curated tones, their contrast in words, back to a new site's tone, the type scale and its steps |
| `AboutDialog.tsx` | About: the mark, the version (the package's, held to the repository's) and "Developed by Riccardo Sapuppo" |
| `Palette.tsx`, `preset-pictures.tsx`, `insert.ts`, `pickers.tsx` | The Insert drawer: a search; Blocks (a new section by its number of columns, then the widgets as named keys in their labelled groups) and Sections (the ready-made sections); a sentence saying where a click puts a block; where a new block goes (after the selection, as a paste does); what an image, a gallery, a video or the picture beside text needs before it is added (images from the media library, below) |
| `library/` | The media library (design/shots/media.png), opened by every image tile, Replace image, a gallery's Add images and the picture beside text, and from the mark's menu to look after the library itself. A search, three filters (all, on this page, missing alt text), the count. Uploads (`service.ts`, through the storage adapter only): one at a time, each drawn again first in the browser (`resize.ts`: the EXIF orientation applied, at most 2400 px on the long side, proportions kept, in its own format, the camera's notes left behind; an image that moves goes up as it is), with its progress and a way to stop it; what the browser or the CMS refuses keeps its reason (`files.ts`). No image is placed without alt text or the decorative mark: the button says why it waits and leads to the field. Placing is one command born with the mediaId, the alt text copied in and kept as the library's proposal. Delete, asked twice, after the edits waiting are saved; one the CMS refuses names the pages and kept versions that show the image (`words.ts`). The footer says the CMS makes no smaller copies (`capabilities.imageVariants`) |
| `panels/` | The sidebar's panels, each in collapsible groups named after what they hold (`groups.tsx`; design/layout/, the editor, style, section and page-tab states): the page's Title and address and Search results; a block's in its type's order, a widget's own group first (its folder's, `../widgets/<widget>/panel.tsx`: Text, Button, Questions...), then its style settings by what they set (Size and color, Colors, Line color, Spacing, Background, Alignment...), then Shown on, and for a section Columns and Name and link. Every style key a type accepts is in exactly one group. A closed group says its value in words, the theme's in use where the block sets none ("Display, theme color", "Every device"); a group whose settings have a tablet's or a phone's own value says which device differs, open or closed; a value the server refused opens the group that holds it, until it is closed by hand. The first group opens at first, every group of the page; then the person's choice, per block type. The style settings (`StyleFields.tsx`) edit the device the canvas previews: the base on the desktop; with a tablet or a phone previewed, that device's values only, each setting saying "From desktop" or "Tablet only", an override naming the desktop's value (a ring on the ruler) with a Remove that takes the device's key out, the focus back on the setting |
| `device-style.ts` | A block's style per device as the page's container queries apply it: a tablet or a phone shows its own value, else the base, a phone never the tablet's; the devices a block has values of its own on; "back to desktop" as the key taken out, never the desktop's value written in its place |
| `controls.tsx`, `errors.ts` | The panels' fields, each with its label, hint and errors tied to it; a finding of the editor's checks or of the server's 422 said as a sentence about the field |
| `Canvas.tsx`, `presets.ts` | The page on the bench, flush with its frame (19 on each side, the scrollbar's gutter kept), between the theme's header and footer (locked), drawn smaller when the canvas has less room than the page (the bottom line saying its width and the scale), the editor's own controls and words on it kept at their size; Block edges; a provider's player kept with no address, so it never loads on the canvas, not even when a drag's preview puts its block back into the page; the marks of the selection and its clamp (`Clamp.tsx`), the canvas's one Tab stop (the selection, or, where the device previewed does not draw it, the nearest block around it that is drawn), the round "+" that add on the page (on the selected widget's bottom edge; on the seam below the section that holds the selection, and on any seam under the pointer with a hairline and a tip naming the place; large in every empty column) and the yellow line a "+" opens, a gap of the column's own or a line across a seam; while Insert is open, its yellow line where a click in it lands, its words at the line's right end under the drawer; the dimension lines (the gap's in the block's left quarter, clear of the "+"), the hover outline (a button's hugging its pill) and its name, beside the block or, where the canvas has no room there, above its right end, over the frame of a selection just before it, and placed again when the window's size changes the page's scale; the name stands where the block's outline is, so a block taller than the canvas, scrolled past its top on a page drawn smaller, shows it again only when its top is back in view, as a column's and a section's names do (kept so: a name pinned to the canvas's edge would stand apart from the block it names); the empty page's invitation and its ready-made sections; a text block opened where it stands (a click on the text already selected, a double click, Enter, or its panel's button), its clamp carrying bold, italic and link and its link's field under it |
| `Clamp.tsx`, `clamp-place.ts` | The selected block's clamp (design/layout/NOTES.md, section 4.2): a vertical graphite bar in the page's margin, from the top the yellow head (the block's type; the block menu), the grip (a drag, or Space), the moves (up and down; left and right for a column; one command each, the focus kept on the key, at an end saying why not), More (the right click's items). Every block gets it, a section inside its own margin; beside a short block it runs on below it, and a block brought into view by the keyboard brings its whole clamp; beside a block taller than the canvas it keeps to the canvas's top. Where it stands (`clamp-place.ts`, plain geometry): the full clamp, tied to the frame, in a margin of 48 or more; the narrow one, centred, in a gutter of 28 to 47; out to the page's nearer margin under 28; on the block's right side where an open drawer covers its left; drawn back to its size on a page drawn smaller. One Tab stop after the block's own: the arrows go along it, Esc back. While a text is written the moves give their place to bold, italic and link; the grip and More stay |
| `InsertPicker.tsx`, `insert-place.ts`, `canvas-ui.ts`, `canvas.css` | The picker a "+" opens beside its yellow line, a non-modal dialog offering only what fits there: the widgets in a column (one needing an image or a video asks for it first, as Insert does), 1 to 4 columns or a ready-made section at a seam; its search takes the focus, the arrows go along its rows and between them, Enter adds by one command at the place, the new block focused; Esc, or a press elsewhere, closes it, Esc giving the focus back to the "+", or to what opened it (the block, for the "+" key; the clamp's key, for its menu's Insert before and after). The places (`insert-place.ts`), and the canvas's own state beside the interface's store (`canvas-ui.ts`: the picker's place, the seam under the pointer, which of the clamp's menus is open). The clamp's, the "+"'s, the lines' and the picker's styles (`canvas.css`) |
| `Navigator.tsx` | The Outline drawer. Blocks: the page as an ARIA tree, in step with the selection both ways, the row of the selection taking the focus when the drawer opens, the selection's path open; the theme's header and footer as two locked rows around it; a block with a tablet's or a phone's own values flagged with the device's glyph, said as the row's description; one hidden on some device grayed out. Headings: the page's headings in order, by level, each one a button that selects it |
| `act.ts`, `pending.ts` | The one way every command runs, from a button, a key, the block's menu or a drop: the text still waiting in a panel's field or in a text on the canvas is handed over first, as a command of its own, and a text the page refuses keeps the command from running; then the command; then the focus where its result says (the neighbour after a delete, the new block after an insert, a paste or a duplicate, the block touched after an undo), on the canvas or on the outline's row |
| `drag/` | Drag and drop on the store's drag, behind one module for the drag library (`drag/dnd.ts`, `@dnd-kit` 0.5.0): the selected block (the clamp's grip, or Space) and each key of the Insert drawer as sources; where a block would land, from the pointer's coordinates or from the keyboard's steps (`place.ts`, `steps.ts`); the marks the canvas draws (`marks.ts`); the sentence the bottom line's live region says (`DragLayer.tsx`, `../StatusBar.tsx`) |
| `rich/` | Rich text on the canvas: TipTap with exactly the schema's nodes and marks, the link cut to its href and held to the URL policy and the schema (`extensions.ts`, `link-check.ts`); a paste cleaned to what the schema allows (`paste.ts`); what the page takes of a text held while it is written, from the schema's counts and the page's nesting at the block's place: a key, a mark or a link past it not done and said, a paste cut to what fits and said (`limits.ts`); the editor as the canvas makes it (`setup.ts`), loaded on demand with TipTap in a chunk of its own (`TextEditor.tsx`, through `tools.ts`), opened in the same moment once the chunk is here, the focus in it at once, and the keys pressed while it is still on its way kept from the block and typed into it when it opens (`../keys.ts`, `waitForText`), unless another block is chosen first, which gives up the opening and its keys (`tools.ts`, `forgetLeftText`); one text being edited and its two histories (`text-session.ts`: the typing becomes ONE command of the page when the person pauses or leaves the text, before any other command and at a drag's start, and TipTap's history is closed there, so Ctrl+Z in the text is TipTap's and outside it the page's; a text the page refuses all the same is never dropped: the editor stays open saying why, and the commands, drags and the leaving that would lose it wait); its link's field under the block (`FormatBar.tsx`), its bold, italic and link in the clamp (`../Clamp.tsx`) |
| `keymap.ts`, `keys.ts`, `ShortcutsDialog.tsx`, `selection.ts` | The keyboard map in one table: the editor's one keydown listener runs it, the drag library's keyboard sensor and the text editor take their keys from it, every title and `aria-keyshortcuts` names its keys from it (a test reads the source for a key written anywhere else), and the "?" window lists it, in the layout's three columns; the arrows' order through the page. The layout's "+" opens the picker after the selection, whichever key types it (Shift and "=", its own key, the number pad's); Tab from the selected block goes to its clamp. The layout's chords are Alt and Shift with a letter or a digit (Preview, Insert, the Outline, the three devices), never Ctrl and Alt, which many keyboards type as AltGr; off a text they go by the key's place. While the person types (a field, a text on the canvas) the typing keys are the text's: only the entries marked `typing` work there (Save a named version, Preview, Publish now), looked for before the text editor cancels Enter; a chord with Alt counts there by the key it types, never with AltGr |
| `BlockMenu.tsx`, `Menu.tsx`, `clipboard.ts` | The block's menus (design/layout/shots-extra/more.png, block-menu.png): More, from the clamp or a right click (copy, paste after, duplicate, insert before and after, select the column or section around it, delete), and the block menu, from the clamp's head or the menu key (the moves first, each saying why it cannot be made at an end, then all of More's); beside the clamp, upward from its foot where the window has no room below; the focus back on the clamp's key, the block or the outline's row; copy and paste through the browser's clipboard events, so a copied block is on the system clipboard as text |
| `plain-words.ts` | The words the history, the media library and the keymap's notes share, so they read alike: a day against the clock's ("Today", "Yesterday", "Sep 28", "Dec 30, 2025") and a list in a sentence ("A, B and C") |
| `context.tsx`, `ui-store.ts`, `session.tsx` | What every part reaches: the editor store, the interface's own store (hover, preview, the drawer open, the sidebar shown and what it shows, its tab chosen by hand and the groups open, Block edges, the page's width as laid out, library, site style, the server's errors, the drag's mode and what the live region said), the page session |
| `icons.tsx`, `editor.css` | The design's icons (and the layout's few of its own, Block edges, bold and italic) and stylesheet, laid out as the layout's; the design's resets of bare elements are kept off the canvas |

## Not here yet

Scheduling a publish is stage 4. The top bar draws no control for it
until it works, and the "?" window lists no key for it.

## Where it departs from the approved design, on purpose

Each of these is a choice, kept for a reason, and open to the design's
owner to undo:
- **"?" window:** the layout's three columns and its groups, with what
  the layout does not draw: under Text, while you write, a note on Ctrl+Z
  there, on Delete and Backspace deleting letters and on the keys that
  work while typing; under Adding and looking, Enter on a block of Insert
  adding it after the selection, and a line on the page's "+". The
  window is the
  keymap written out, so every key that works is in it. Enter, "Edit the
  text of a block", also goes to the first field of a widget whose words
  are in its panel. Its keys stand 8 pixels from their words, not 12, so
  "Select the parent column or section" keeps to one line as in the
  design.
- **Drawers:** all three float over the canvas's left, so the page never
  shrinks when one opens; the layout's notes have the Outline and History
  push the page aside. A floating drawer covers the left of a first
  column's blocks while it is open.
- **The sidebar's groups:** the layout draws the groups' words for its
  example page; here they are made from the block (a closed Size and
  color says "Display, theme color" where the block sets no colour, a
  closed Colors "Buoy, theme text"). Open, a group whose settings have a
  device's own value says "Tablet differs" (or "Phone differs", "Tablet
  and phone differ"); closed, the device's glyph alone stands beside the
  value, its words in the description and the pointer's tip, so the value
  keeps its room. A closed group holding a value the server refused says
  "Refused", which the layout does not draw. Inside a group each setting
  keeps its own label and its scope ("Theme default", Reset, "From
  desktop"), so a single setting repeats the group's name (Background,
  Columns): the scope and Reset are the override controls, and the label
  names the control for a screen reader. Every block's panel ends with
  the layout's line on closed groups and Site style. A column's groups are
  Spacing, Background, Text size and color, Alignment and Shown on; its
  old "This column holds n widgets" line is gone, the canvas and the
  Outline say it. A heading has no "Link to this block": sections alone
  have an anchor, in Name and link.
- **Style settings:** Background offers the palette's six slots in the design's
  order, and Slate, which the design does not draw, last; Text color
  comes with the text size, in Text size and color or Size and color. A
  column's text sizes are the design's three, Small, Body and Large (a
  step it already holds is listed too, so it shows), where the layout
  draws the seven; a heading, a text or
  a quote offers the type scale's seven. A setting the block leaves unset
  shows the value in use checked, as the design draws None and Body: a
  section's or a column's None, a button's Accent, the level's size for a
  heading, a quote's Heading 3, a column's Body, Top and Left, and for a
  widget its column's size and alignment; not a colour, which the band
  around the block decides. A column's two alignments are the design's one
  Alignment field; when the two come from different places (one the
  tablet's own, say), each says where beside its name.
- **Style settings on a tablet or a phone:** where the desktop sets nothing,
  the override says "the theme’s default", and the ruler stands on the
  theme's step where the theme has one on every width (a column's None
  inside, its L between widgets). A phone override names the tablet's own
  value when it has one ("tablets have their own, L"). On the desktop, a
  setting a device overrides says so under it ("Tablets have their own:
  L."). The Shown on group says, under its switches, why a block hidden on
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
  8, none on its left instead of 6) before Insert, Outline, History and
  Preview give up their words; the save state takes the room of
  "Saving…" when it says "Saved", so a save moves nothing. The pages'
  window has no "Manage all pages": there is no such screen yet.
- **Site style:** a "Saved for every page" line under the panel's title,
  where the style's own save shows (the top bar's word is the page's);
  a chevron on Primary and Accent, which open to their tones; contrast
  ratios cut to one decimal, not rounded ("8.8 to 1" for 8.86), so a
  ratio never reads above a threshold it misses.
- **The clamp:** while a text is written, the layout draws its clamp as
  the head, bold, italic and link; here the grip and More stay too, so the
  block can still be dragged, duplicated or deleted without leaving the
  text first (the text is handed over as the drag or the command starts),
  as it could from the floating bar. The head's block menu opens beside
  the clamp from its head, and upward from the clamp's foot only where the
  window has no room below it. A column takes no Insert before or after:
  a block goes inside it, from its "+" or the "+" key, which opens at its
  end. A clamp in a gutter under 28 goes out to the page's margin, which
  the layout describes and does not draw. Beside a block taller than the
  canvas whose top has scrolled away, the clamp keeps to the canvas's top
  while the block is there, which the layout lists as not drawn.
- **The "+":** a page has seams above its first section and below its
  last as well as between two; each answers the pointer within 12 pixels
  of it. A seam's "+" names the place it adds at ("Add a section after
  Hero"); under the pointer, between two sections, it names both. The
  picker for a column says where the block lands in words beside the
  line ("after Heading", "at the top of Column 1", "in Column 2"). The
  bottom line's hint while the pointer is over a seam, with nothing
  selected, is the layout's sentence.
- **Rich text:** the design draws no text being written. While a text is
  open, the block's clamp carries bold, italic and link (above); the
  link's field opens under the block in the panel's field style. The
  bottom line says "Writing. Esc to finish". The text widget's Text group has no text
  field: its words are written on the page, and the group opens the editor
  there and says how; while the text is written, it lists the keys that
  work in it, from the keymap, Leave the text among them.
- **The Page tab** has no "Show in the site menu" toggle, which the layout
  draws as "Comes later": the site's menu is the theme's
  (`cms/config/site.yml`), which nothing in the editor changes yet. The
  home page's address stays a field, as the editor has it, where the
  layout draws it locked; its hint says visitors find it at the root.
  The panel's line under the title says where the page lives ("The home
  page, the first one visitors see", "/winter-series, not published
  yet").
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
store as the shell does, then finds it on the field it names, the group
that holds it opened (`panels/groups.test.tsx` holds the groups
themselves: every style key a type accepts in exactly one group, each
type's groups and order, their words closed, the device that differs,
the choice kept per type, a refusal opening its group; with a group
taken out of a type and the opening for a refusal removed, planted to
see them fail; `open-groups.test.ts` a storage that throws, refuses a
write or holds anything else); the
canvas, the Insert drawer, the Outline, the top bar, the drawers, the
sidebar, the bottom line, the history panel
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
`../../e2e/editor.spec.ts` (the shell in the layout's frame: Insert
saying where a block goes, the devices and the page's width in the
bottom line, the Outline and the bottom line's steps selecting with the
canvas, the drawers floating one at a time with the page keeping its
width; sections anchored with the editor's own ids, which hold an
underscore no anchor can; the theme's header and footer, locked; the
page 1088 wide at 1440 and in its desktop layout at 1280, measured in a
browser that draws its scrollbar; in a 1280 by 800 window the pages
whole, a short block's clamp running on beside a stacked column, drawn
whole over it, and the page's title kept whole; and in a
1024 by 768 window the pages drawn smaller to fit, the editor's own
controls and words on them (the clamp, the "+") kept at their size and in their place, a
hovered block's name kept inside the canvas, drawn over the frame of a
selection just before it and placed again when the window's size changes
under the pointer),
`drag.spec.ts` (every drop by mouse and by keyboard, Space with the
button held, refused drops, Esc, a drag on a page drawn smaller, its
words at their size, a block moved past a video without the provider's
player loading),
`focus.spec.ts` (the focus after every command, a move from the clamp's
key and an add from a "+" among them), `clamp.spec.ts` (the clamp in
every preview and window over no block and no words, its moves and head
in view; on the block's right side under Insert; its head's menu and
More, its moves one step each), `insert.spec.ts` (the "+" on a block's
edge, its line and its picker by the mouse and the keys, an empty
column's large "+" with a video asking first, the seams under the
pointer, the page's top and foot among them, the "+" key after each kind
of selection, Insert's yellow line, Insert before and after),
`keyboard.spec.ts`
(every key of the map, and the "?" window listing them; in a text being
written, Delete, Backspace and Ctrl+D changing letters and never the
block, and a version kept, a publish and a preview from inside the text,
each with what was just typed), `sidebar.spec.ts` (closed groups saying
their values; the groups open kept in the browser per block type, across
a reload and not in another profile; a value the CMS refuses opening the
group that holds it; the Page tab's description saved), `devices.spec.ts` (a tablet's and a
phone's own space set in the column's Spacing group, the canvas at 768 and 390 and the
page the CMS serves in windows of those widths showing the same; Remove
leaving the draft with no tablet part, the focus on the ruler, undo and
redo; a section's nine spacing steps printed apart on its rulers; a
block hidden on phones gone from the phone's canvas and page and still
on the tablet's), `rich-text.spec.ts`
(a text opened where it was clicked and laid out as the page lays it out;
typing and a drag of the same block at once, the text a step before the
move; undo and redo inside the text and outside it to the CMS's very
draft; bold, italic and a link from the clamp, a refused address and its
reason; a word processor's paste and a web page copied in the browser,
as the CMS saves them; the editor's code fetched only once a text is
selected; axe with the link's field open), `menu.spec.ts`
(the block's menu), `marks.spec.ts` (the canvas's marks leaving the
page's layout alone, a button's hugging its pill wherever its own or
its column's alignment moves it, the seam's "+" below the selection's
section and its picker, a section's clamp and its grip, the dimension
lines; the clamp full, narrow or out in the page's margin by its gutter,
over no block and no words, with that check planted to see it fail; a
written text's clamp with bold, italic and link; a text opened at the
canvas's bottom edge staying under the pointer, and a tall text's clamp
at the canvas's top), `save.spec.ts` (a slowed network, a save the
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
(the mark read back at 16 px), `a11y.spec.ts` (axe in thirty-five states, at 1440 by 900 and at 1280 by 800,
among them each drawer and the Outline's headings, Block edges and the
Page tab, the sidebar hidden, the clamp's block menu, the block picker and
the section picker, a text being written and its link's field,
a tablet's override, the history and its name field, the media library;
and on the published page), `widgets.spec.ts` (each widget's accessibility
test) and `keyboard-path.spec.ts` (the whole path with no pointer:
insert from Insert by its chord, move, a heading's text and level in the
sidebar, a word made bold in a text on the canvas, the devices in the
bottom line, a column's tablet space, the Outline by its chord, an image
uploaded through the system's file chooser and placed with its alt text,
undo and redo, a named version, publish, the live page read at a
desktop's and a tablet's width). The
ones tagged `@a11y` are what `npm run check:a11y` runs. `npm run
shots:editor -- <folder>` photographs the editor in the approved
layout's states on the example site (`../../e2e/shots/editor-shots.ts`).
