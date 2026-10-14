# src/editor/

The editor's interface: the identity of the approved design
(`../../../design/`, `index.html` and its screenshots), laid out as the
approved layout (`../../../design/layout/`, approved on 3 October 2026):
the top bar, the drawers (Insert floating over the canvas, the Outline and
History pushing the page aside), one sidebar on the right, the bottom line.

- It reads the store (`../store`) and dispatches commands; it never edits
  the document itself.
- It saves and loads only through the storage adapter (`../storage`).
- The canvas uses `../render` and the published page's CSS
  (`../shared/site.css`); its tablet and phone widths are container
  widths, so the page's container queries apply as on a real device.
- One fixed locale, en-US.

`../main.tsx` mounts `App.tsx` on the Rails adapter, the system clock and
random block ids, with the sidebar's open groups as this browser kept
them (`open-groups.ts`), and the CMS's origin, where its pages open. The
browser demo (`../demo/main.tsx`) mounts it on the browser's storage with
no CMS origin (null): addresses then read as the path the site would
give, the sentences say a page is saved in this browser (`keptWords`,
`session.tsx`), and, since that storage keeps a publish but serves no
page (`capabilities.livePages`), Publish opens the page as published,
which the demo draws (`publishedView`), and the Publish menu links it in
place of the live page.

## What is here

| File | What it is |
| --- | --- |
| `App.tsx` | The shell: the layout's grid (the top bar; the drawer open, Insert over the canvas's left, the Outline or History in a column of its own that the canvas gives up; the canvas; the sidebar; the bottom line, in the order the Tab key goes), the site's pages, media library and site style read through the adapter, a page opened (`openDocument` before the store takes it, the page's id in the address as `?page=`), its autosave fed every new document, the server's 422 laid on its blocks (`errorsByBlock`, on the document that save sent), a warning before the tab closes while edits are only here; publishing (the edits waiting saved first, then published at that revision), the preview opened in a tab once they are sent, the conflict settled the person's way (Reload as a step of the session, which Undo takes back; Keep mine after keeping the server's draft as a version, "Before Keep mine"), the page's versions read for the history, "Save version" and restore (each after the edits waiting are saved; the restored draft takes the canvas only when this tab has nothing the restore did not keep, else the conflict bar asks; undo starts again, and the notice says why), and the site style's changes sent one at a time, a refusal put back |
| `TopBar.tsx`, `PageSwitch.tsx`, `Menu.tsx`, `NewPageDialog.tsx` | The top bar: the mark's menu (Site style, the pages, the media library, the form responses when the storage keeps them, the shortcuts, About); Insert, Outline and History, each opening and closing its drawer; undo and redo (greyed, and saying so, with nothing to do); in the middle, the page's title, which opens the site's pages (a small window with a search, each page's address and whether it is live, New page), beside it where the page is (home page, its address, or every page for the header and footer), and under it whether the page is live and how many saved changes are not; the save state, Preview, Publish and the sidebar's key. Short of room, the title is cut last: the save state draws closer first, then the drawers' and Preview's words give way to their icons |
| `Welcome.tsx`, `welcome-key.ts` | The first-run note: the first time a browser opens the editor, under the page's title, what is open (the draft of the home page, of a page at its address, or of the header or footer, on every page) and where its changes go (saved as they are made, and on the site at the CMS's address once published; in the browser demo, nowhere but this browser). Got it closes it for good in that browser (`localStorage`, `page-builder-cms:welcome`); it takes no focus, and waits while the list of pages, which opens where it is, is open. The tests' browsers start as one that has seen it (`test/setup-dom.ts`, `e2e/harness/welcome.ts`); `Welcome.test.tsx` and `e2e/welcome.spec.ts` open it |
| `Drawer.tsx` | The drawers: one open at a time. Insert floats over the canvas's left at every width, so the page keeps its width; the Outline and History push the page aside, as the layout draws them (1440: the page 807 wide, still the desktop layout; 1280: the desktop page of 800 drawn at 81%, by the same fit as any narrow canvas), so what is chosen in them is never under them. Each takes the focus when it opens (what it marks, else its first key) and gives it back, on Esc or its close button, to where it was before it opened, or, when another block was chosen meanwhile, to that block (the canvas selects what takes its focus, which would otherwise undo the choice). A block that takes the focus wholly under Insert makes Insert give way: it closes, saying so |
| `Sidebar.tsx` | The one sidebar: the Page tab (the page's own settings, the ways to the site's header and footer, each saying where it stands, and Site style one click below it, with its way back; for a header or a footer, that it is on every page and how it goes live, and the way back to the page it was opened from) and the Block tab (the selection's panel), following the selection and chosen by hand in between, the choice holding for that selection only; hidden from its own button (over the site style too) or the top bar's key, the canvas taking its room. While a block is dragged its settings wait: the Block tab says what moves and where from ("Moving, from Hero, column 1"), its groups closed with their values and out of reach, the Page tab inert |
| `open-groups.ts` | Which of the sidebar's groups the person keeps open, per block type, kept in the browser's local storage: read when the editor starts, written when it changes, every read and write tried, and only its own shape taken back |
| `StatusBar.tsx` | The bottom line: the selection's path from the page, each step a button; a hint when nothing is selected or a column or section is; while a block moves, the live region's sentence in its place, the line graphite; Block edges; the devices, a radio group (Desktop, Tablet 768, Phone 390); the page's width as the canvas lays it out, its layout, and the scale it is drawn at |
| `HistoryPanel.tsx`, `history-words.ts`, `history.css` | The History drawer: this session's steps newest first, the undone ones on top, any of them a button that undoes or redoes up to it; the draft and the page's versions, named by why, when and their name, with no author, the live one marked; "Save version" with an optional name (Ctrl+S opens it); Restore |
| `SaveStatus.tsx` | Where the edits are, from the autosave's snapshot: the top bar's word (Saved only when the server has every edit; a countdown to the next try, on the injected clock, never read to a screen reader); the toast of a save whose outcome is unknown, with Retry now; the conflict's banner, an alert, with Reload and Keep mine |
| `Publish.tsx` | Preview, a link to the draft's preview on the CMS's own origin; the split Publish button and its menu (Publish now; Schedule…, which says when nothing is left to schedule; the scheduled publish's cancel while one waits; the live page), waiting and saying why on an empty page, a conflict or a save not confirmed; nothing for what the storage lacks (no Schedule without the schedule capability) |
| `ScheduleDialog.tsx`, `site-time.ts`, `schedule.css` | Schedule… (design/layout/shots-extra/schedule.png): a date and a time read as typed, in the site's time zone (the CMS's `timeZone`), whatever the browser's, with the offset that date has; a time the clocks skip refused at the field, one they repeat taken as the first and said so, one gone or a year away refused; the button saying the time it will send, in UTC; Change saying where the zone is set, since the editor cannot change it. The page waiting for a scheduled publish says so under its title, in the history (with Cancel) and in the Publish menu; once its time has passed, the shell reads the page again (`App.tsx`), since the CMS's job publishes without the editor, every 3 seconds for a minute and then every half minute for as long as it waits; half a minute after its time (`schedule-late.ts`, on the editor's clock) the top bar says "should have gone live on …" in the warning colour, with a title saying the CMS tries again and what the person can do, and the history says "Should have gone live …", instead of "scheduled for" a time that is behind |
| `SiteStylePanel.tsx` | Site style, the one screen that changes the tokens: each slot's curated tones, the palette of ready colours and a colour of the site's own (`ColorPalette.tsx`, `ColorPicker.tsx`), their contrast in words, warning where a colour reads poorly but keeping it, back to a new site's tone, the type scale and its steps, and the letter width, how wide the Headings typeface is drawn, the steps' samples drawn at it |
| `ColorPalette.tsx`, `palette.ts` | The palette of ready colours under a colour's other choices (a block's site colours, a slot's tones): nineteen hues of a widely used design palette, each with its shades 50 to 900 and four accents (`palette.ts`), and the tile that opens the picker. A hue is kept at a click; held down (450 ms), or with the keymap's Shift+Enter, it shows its shades, each kept at a click; the hue of the colour in use is drawn in that shade, named by it ("Teal 700") and pressed, a colour of no hue pressing the picker's tile. One Tab stop: the arrows along the tiles, ten to a row, Esc closing the shades |
| `ColorPicker.tsx`, `color-preview.ts` | A colour of the site's own: an area of saturation and brightness over the hue, a hue bar, both sliders to the keyboard (the arrows by 1, Shift by 10), and the colour as hex, typed or pasted in any of its forms and kept as `#rrggbb`. A drag shows the colour on the canvas at once (`color-preview.ts`: the site style or the block drawn with it, nothing saved), and letting go keeps it, one change and one step of undo; the arrows keep it after a pause; the contrast checks follow the drag |
| `panels/EditPanel.tsx` (`PartPanel`) | The Page tab of a header or a footer: what it is (drawn on every page, above or below its sections, built as a page is, Logo and Menu in Insert's Site group), how it goes live (Publish puts it on every page at once, in the browser demo on every page published in this browser; until then every page shows the one the site started with), and Back to the page it was opened from, else the home page |
| `AboutDialog.tsx` | About: the mark, the version (the package's, held to the repository's) and "Developed by Riccardo Sapuppo" |
| `Palette.tsx`, `preset-pictures.tsx`, `insert.ts`, `pickers.tsx`, `tiles.ts` | The Insert drawer: a search; Blocks (a new section by its number of columns, then the widgets as named keys in their labelled groups) and Sections (the ready-made sections); a sentence saying where a click puts a block; where a new block goes (after the selection, as a paste does); what an image, a gallery, a video or the picture beside text needs before it is added (images from the media library, below). Every key of Insert and of a "+" picker is a drag source (`tiles.ts`), by the mouse or by Space where Enter would add it and the arrows; a key whose block needs something first is dragged as a stand-in that only places it, and dropped, it opens the picker at the drop place with its window, which adds the block there by one command, or nothing |
| `responses/` | Form responses, from the mark's menu, drawn only when the storage keeps responses (`capabilities.responses`; `context.ts` gives the screen the adapter's operations, or nothing). The site's forms that visitors have sent, page by page (`read.ts`: only pages ever published are asked, one list each for its counts; each form named from its page's draft as the editor names blocks, "Form in Join", the page being edited from the editor's own draft; a form the draft no longer has keeps its responses as "Form no longer on the page"); the chosen form's responses newest first, a table with headers (when each was sent, the page's version, its first written answer), one Tab stop that the arrows, Home and End move along, older ones a part of 50 at a time; one opened whole beside it, every field the form had then with its answer, the version it came from and whether visitors still see that one (`words.ts`). What a visitor wrote is drawn as text, never as markup or a link; in the list, in an isolate of its own read in its own direction, so a bidi control in it (U+202E and the like) is kept but moves nothing after it, and a right-to-left answer cut short shows its start. Delete asked twice, as the media library asks; after it the focus goes to the response that took its place, else the one above, else the next form, else Close, and a line says what was deleted |
| `library/` | The media library (design/shots/media.png), opened by every image tile, Replace image, a gallery's Add images and the picture beside text, and from the mark's menu to look after the library itself. A search, three filters (all, on this page, missing alt text), the count. Uploads (`service.ts`, through the storage adapter only): one at a time, each drawn again first in the browser (`resize.ts`: the EXIF orientation applied, at most 2400 px on the long side, proportions kept, in its own format, the camera's notes left behind; an image that moves goes up as it is), with its progress and a way to stop it; what the browser or the CMS refuses keeps its reason (`files.ts`). No image is placed without alt text or the decorative mark: the button says why it waits and leads to the field. Placing is one command born with the mediaId, the alt text copied in and kept as the library's proposal. Delete, asked twice, after the edits waiting are saved; one the CMS refuses names the pages and kept versions that show the image (`words.ts`). The footer says the CMS makes no smaller copies (`capabilities.imageVariants`) |
| `panels/` | The sidebar's panels, each in collapsible groups named after what they hold (`groups.tsx`; design/layout/, the editor, style, section and page-tab states): the page's Title and address and Search results; a block's in its type's order, a widget's own group first (its folder's, `../widgets/<widget>/panel.tsx`: Text, Button, Questions...), then its style settings by what they set (Size and color, Colors, Line color, Spacing, Background, Alignment...), then Shown on, and for a section Columns and Name and link. Every style key a type accepts is in exactly one group. A closed group says its value in words, the theme's in use where the block sets none ("Display, theme color", "Every device"); a group whose settings have a tablet's or a phone's own value says which device differs, open or closed; a value the server refused opens the group that holds it, until it is closed by hand. The first group opens at first, every group of the page; then the person's choice, per block type. The style settings (`StyleFields.tsx`) edit the device the canvas previews: the base on the desktop; with a tablet or a phone previewed, that device's values only, each setting saying "From desktop" or "Tablet only", an override naming the desktop's value (a ring on the ruler) with a Remove that takes the device's key out, the focus back on the setting |
| `device-style.ts` | A block's style per device as the page's container queries apply it: a tablet or a phone shows its own value, else the base, a phone never the tablet's; the devices a block has values of its own on; "back to desktop" as the key taken out, never the desktop's value written in its place |
| `controls.tsx`, `errors.ts` | The panels' fields, each with its label, hint and errors tied to it; a finding of the editor's checks or of the server's 422 said as a sentence about the field; a text the page refuses kept in its field and held, as `pending.ts` says, until the field gives the page one it takes |
| `Canvas.tsx`, `presets.ts` | The page on the bench, flush with its frame (19 on each side, 12 on the left beside a pushed drawer, the scrollbar's gutter kept), between the site's header and footer (the parts' drafts, inert, not blocks of the page: a click on either opens it, as a page is opened, the part under the pointer outlined with what a click does); a header or a footer being edited drawn in its own element, the page it was opened from around it, dimmed and locked, a click on that page going back to it, and the other part locked (`PartRoot`); drawn smaller when the canvas has less room than the page (the bottom line saying its width and the scale; the box around it as tall as the page drawn smaller from the commit that changes the page, so that a window placed in that commit reads how far the canvas really scrolls), the editor's own controls and words on it kept at their size; Block edges; a provider's player kept with no address, so it never loads on the canvas, not even when a drag's preview puts its block back into the page; the marks of the selection and its clamp (`Clamp.tsx`), the canvas's one Tab stop (the selection, or, where the device previewed does not draw it, the nearest block around it that is drawn), the round "+" that add on the page (on the selected widget's bottom edge; on the seam below the section that holds the selection, and on any seam under the pointer with a hairline and a tip naming the place, whole inside the canvas and clear of the clamp and of the Insert drawer: on the seam right of the "+" where there is room, as the layout draws it, else left of it, under it or over it (`seam-tip.ts`, plain geometry); large in every empty column) and the yellow line a "+" opens, a gap of the column's own or a line across a seam; while Insert is open, its yellow line where a click in it lands, its words at the line's right end under the drawer, under the selection at the end of its column clear of the selection's frame; the dimension lines (the gap's in the block's left quarter, clear of the "+"; none while a picker is open, its line may be in that gap), the selection's frame, one continuous yellow line with a 6 radius and a faint graphite edge, and the hover outline, thinner (a button's of both hugging its pill), its name in a yellow chip at the outline's top left, where the toolbar names a block: inside the outline's corner where the canvas's top would cut it, at its right end where the canvas's right edge would, drawn over the frame of a selection just before it, and placed again when the canvas scrolls or the window's size changes the page's scale; both come in with a short fade, none where the person asked for less motion; the empty page's invitation and its ready-made sections; a text block opened where it stands (a click on the text already selected, a double click, Enter, or its panel's button), its toolbar carrying bold, italic and link and its link's field under it; a heading opened the same ways but its panel's, its line written in the heading's own element; a character typed on a selected text or heading starting the writing with it (`keys.ts`, `writeInto`), so the Space after it is a space, never a move |
| `Clamp.tsx`, `clamp-place.ts` | The selected block's toolbar, still called the clamp in the code (design/layout/NOTES.md, section 4.2, revised on 14 October 2026): a graphite bar floating by the selection's frame, from its start the yellow head chip (the block's type and name; the block menu), the grip (a drag, or Space), the moves (up and down; left and right for a column; one command each, the focus kept on the key, at an end saying why not), More (the right click's items); a key pressed or open yellow, the selection's colour. Every block, column and section gets it. Where it stands (`clamp-place.ts`, plain geometry): above the frame, from its left edge, then from its right edge; under it (clear of the "+" on its foot); inside its top left corner last; the first of those whole in the canvas's visible part, clear of the Insert drawer and over none of the page's words (the locked header and footer and the dimmed page around a part aside), else the one covering the least; a section's tries its inside corner first, in its padding. Never cut by the canvas's edges, moved in from them and right of the drawer; inside a block taller than the canvas whose top has scrolled away, at the canvas's top while the block is there; a block brought into view by the keyboard brings it whole; drawn back to its size on a page drawn smaller. It is drawn over the "+" and a seam's tip, and a seam's "+" it would stand on (a section's toolbar inside its corner on the phone page, over the seam above it) moves along its seam, off it, to its right, or to its left where the seam ends first, and back to the middle once the toolbar leaves it clear; its tip does not follow it past the canvas's edge (`seam-tip.ts`). One Tab stop after the block's own: the arrows go along it, Esc back to the block, or into the text or the heading's line being written. While a text is written the moves give their place to bold, italic and link; the grip and More stay. No handles: nothing on the canvas resizes a block |
| `InsertPicker.tsx`, `insert-place.ts`, `canvas-ui.ts`, `canvas.css` | The picker a "+" opens beside its yellow line, a non-modal dialog offering only what fits there: the widgets in a column (one needing an image or a video asks for it first, as Insert does), 1 to 4 columns or a ready-made section at a seam; its search takes the focus, the arrows go along its rows and between them, Enter adds by one command at the place, the new block focused; Esc, or a press elsewhere, closes it, Esc giving the focus back to the "+", or to what opened it (the block, for the "+" key; the clamp's key, for its menu's Insert before and after). Its keys are dragged as Insert's are: while one is, the picker and its line give way, and once its block is added elsewhere the picker closes. Opened by a dropped key that asks first, it opens on that key's window, which stands beside the yellow line of the drop place and never over it (`place-dialog.ts`: the video window, 440 wide, on the side of the line with room for it; the media library, 1060 wide, over the line or under it, made shorter to the room there, down to 420; where there is none (a window 768 or 720 high), the page is moved: the line near the top of the canvas with the window under it, or, at the end of a long page, near its foot with the window over it, and on a page too short to scroll that far the canvas is given room at its foot while the window is open (`moveFor`), taken back as it closes; while it is open, a page that grows or shrinks above the line (an image of another site arriving), or a window that grows by itself (the video window's error line), has the window stood again beside the line in the next frame (`keepBeside`); the same for a "+" picker's key clicked, and for a seam's section picker); a window opened from the menu or from Insert with no place on the page stays in the middle; Esc or Cancel there adds nothing and gives the focus back to the key. The places (`insert-place.ts`), and the canvas's own state beside the interface's store (`canvas-ui.ts`: the picker's place and what a dropped key asks for, the seam under the pointer, which of the clamp's menus is open). The clamp's, the "+"'s, the lines' and the picker's styles (`canvas.css`) |
| `Navigator.tsx` | The Outline drawer. Blocks: the page as an ARIA tree, in step with the selection both ways, the row of the selection taking the focus when the drawer opens, the selection's path open; a section's row says its columns and a column's its widgets ("3 widgets"); the selected row's "…" opens the More menu under it, as a right click on the row does; the site's header and footer as two rows around it, each saying "Every page" and opening it as a page is opened (not drawn while a part is open); a block with a tablet's or a phone's own values flagged with the device's glyph, said as the row's description; one hidden on some device grayed out. Headings: the page's headings in order, by level, each one a button that selects it |
| `act.ts`, `pending.ts` | The one way every command runs, from a button, a key, the block's menu or a drop: the text still waiting in a panel's field or in a text on the canvas is handed over first, as a command of its own, and a text the page refuses keeps the command from running, as it keeps the page open, unpublished and its history where it is (`App.tsx`: switching pages, Publish, Schedule, a version kept or restored, a step of the history), the tab asking before it closes; then the command; then the focus where its result says (the neighbour after a delete, the new block after an insert, a paste or a duplicate, the block touched after an undo), on the canvas or on the outline's row |
| `drag/` | Drag and drop on the store's drag, behind one module for the drag library (`drag/dnd.ts`, `@dnd-kit` 0.5.0): the selected block (the clamp's grip, or Space) and each key of the Insert drawer and of a "+" picker as sources (`../tiles.ts`); where a block would land, from the pointer's coordinates or from the keyboard's steps (`place.ts`, `steps.ts`); the marks the canvas draws (`marks.ts`), where the block cannot go a flat light grey (the owner's choice over the mock's hatching, `../../../design/layout/NOTES.md`, section 9), with its note (which starts at the right edge of Insert while that drawer floats over the page's left, so a key dragged out of it is not hiding the note under the drawer: `VeilNote` in `Canvas.tsx`), and the no-drop cursor over it; where a widget moves from, a dimmed copy of it with a "Moving" chip, drawn by the canvas alone from the preview plus the copy (`ghost.ts`; a column or a section leaves none); the sentence the bottom line's live region says (`DragLayer.tsx`, `../StatusBar.tsx`). While a block moves, the column it leaves, with the copy in it, and every empty column keep their height, and the browser's scroll anchoring is off the canvas (`../canvas.css`), so the page never moves from under the pointer as the preview puts the block elsewhere |
| `HeadingEditor.tsx`, `heading-session.ts` | A heading written on the canvas: its line, plain text in the heading's own element at its level, so the words stand in the page's type; one heading being written (`heading-session.ts`): its words handed over as the sidebar's Text field hands them, ONE command when the person pauses or leaves, waiting meanwhile as a text's typing does (`pending.ts`); one line of at most 200 characters with a visible one, as the schema asks: Enter leaves as Esc does, a paste is one line cut to what fits, a character past the 200th is not typed, each said; a heading emptied stays open, saying why, until it has words again, another block chosen meanwhile giving the selection back to it; the caret where the click was, and the keys pressed while it opened typed into it. Once open, the line says so on the request it answers (`editingText.open`), as a text's editor says so by its tools, so neither the leaving that drops a text still on its way nor the keys kept for one take it for loading: the keys on its clamp stay the clamp's (`rich/tools.ts`, `textEditorOpen`) |
| `rich/` | Rich text on the canvas: TipTap with exactly the schema's nodes and marks, the link cut to its href and held to the URL policy and the schema (`extensions.ts`, `link-check.ts`); a paste cleaned to what the schema allows (`paste.ts`); what the page takes of a text held while it is written, from the schema's counts and the page's nesting at the block's place: a key, a mark or a link past it not done and said, a paste cut to what fits and said (`limits.ts`); the editor as the canvas makes it (`setup.ts`), loaded on demand with TipTap in a chunk of its own (`TextEditor.tsx`, through `tools.ts`), opened in the same moment once the chunk is here, the focus in it at once, and the keys pressed while it is still on its way kept from the block and typed into it when it opens (`../keys.ts`, `waitForText`), unless another block is chosen first, which gives up the opening and its keys (`tools.ts`, `forgetLeftText`); one text being edited and its two histories (`text-session.ts`: the typing becomes ONE command of the page when the person pauses or leaves the text, before any other command and at a drag's start, and TipTap's history is closed there, so Ctrl+Z in the text is TipTap's and outside it the page's; a text the page refuses all the same is never dropped: the editor stays open saying why, and the commands, drags and the leaving that would lose it wait); its link's field under the block (`FormatBar.tsx`), its bold, italic and link in the clamp (`../Clamp.tsx`) |
| `keymap.ts`, `keys.ts`, `ShortcutsDialog.tsx`, `selection.ts` | The keyboard map in one table: the editor's one keydown listener runs it, the drag library's keyboard sensor and the text editor take their keys from it, every title and `aria-keyshortcuts` names its keys from it (a test reads the source for a key written anywhere else), and the "?" window lists it, in the layout's three columns; the arrows' order through the page. The layout's "+" opens the picker after the selection, whichever key types it (Shift and "=", its own key, the number pad's); Tab from the selected block goes to its clamp. The layout's chords are Alt and Shift with a letter or a digit (Preview, Insert, the Outline, the three devices), never Ctrl and Alt, which many keyboards type as AltGr; off a text they go by the key's place. While the person types (a field, a text on the canvas) the typing keys are the text's: only the entries marked `typing` work there (Save a named version, Preview, Publish now), looked for before the text editor cancels Enter; a chord with Alt counts there by the key it types, never with AltGr |
| `BlockMenu.tsx`, `Menu.tsx`, `clipboard.ts` | The block's menus (design/layout/shots-extra/more.png, block-menu.png): More, from the toolbar or a right click (copy, paste after, duplicate, insert before and after, select the column or section around it, delete), and the block menu, from the toolbar's head or the menu key (the moves first, each saying why it cannot be made at an end, then all of More's); under the toolbar from the pressed key's left, over it where the window has no room below; the focus back on the toolbar's key, the block or the outline's row; copy and paste through the browser's clipboard events, so a copied block is on the system clipboard as text |
| `plain-words.ts` | The words the history, the media library and the keymap's notes share, so they read alike: a day against the clock's ("Today", "Yesterday", "Sep 28", "Dec 30, 2025") and a list in a sentence ("A, B and C") |
| `context.tsx`, `ui-store.ts`, `session.tsx` | What every part reaches: the editor store, the interface's own store (hover, preview, the drawer open, the sidebar shown and what it shows, its tab chosen by hand and the groups open, Block edges, the page's width as laid out, library, site style, the parts' drafts drawn around a page and the page drawn around a part, the server's errors, the drag's mode and what the live region said), the page session |
| `icons.tsx`, `lucide/`, `editor.css` | The editor's icons, Lucide's in the chrome and on the canvas's keys (the owner's choice of 14 October 2026, design/layout/NOTES.md, section 9), each under the editor's name for what it means and drawn shape for shape from its file in `lucide/`, as lucide-static 0.460.0 publishes it, with Lucide's licence beside the files and quoted in `icons.tsx`; and the stylesheet, laid out as the layout's, every icon's stroke 1.5 px in the chrome whatever its size; the design's resets of bare elements are kept off the canvas |

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
- **Drawers:** the layout's notes, which the owner approved, have only
  Insert float and the Outline and History push the page aside, so a block
  chosen in them is never under them; that is built. The mix's brief asks
  for the three drawers on the page without saying how the Outline and
  History sit, and a first version of the editor floated all three. The
  layout's notes decide, for the reason they give (WCAG 2.2, 2.4.11,
  Focus Not Obscured: a floating Outline hid a first-column block in
  every state where it was picked). If the owner wants all three
  floating, it is one function, `pushes` in `ui-store.ts`.
  The layout measures two windows only, 1440 and 1280. In narrower ones
  the Outline and History push the page the same way, and the desktop
  page is drawn smaller to fit: at 81% in a 1280 window, 69% in a 1184
  one and 49% in a 1024 one (92% at 1366; with no drawer open, 100%,
  100% and 84%). The editor of stage 3 drew it at about the same scale
  with its navigator open, about 70% and 50%, from its two fixed columns
  (288 and 264). The mock the layout is built on (its notes call it B)
  floated a drawer below 1360 instead; the layout's notes turned that
  down at 1280 for the reason above, and say nothing below it. If the owner wants a floor
  there, the two ways are a drawer that floats below some width (a
  first-column block hidden under it again) or a sidebar that steps
  aside while the drawer is open (its settings out of sight until the
  drawer closes).
- **The drag state:** a widget's old place keeps its dimmed copy from the
  pick-up, so the drop line stands beside it while the widget is over its
  own place, where the layout draws the copy once the block has left; the
  place it takes is then the same wherever the line goes, and nothing
  below moves under the pointer; a tall widget is shown by its first 240
  pixels. A column or a section leaves no copy. A
  new block from Insert, which has no place to come from, is named in the
  sidebar ("Adding to the page") and its settings wait the same way; the
  layout draws no such drag.
- **Insert gives way:** Insert floats over the page's left, so a first
  column of four sits wholly under it. The layout accepts a block partly
  under Insert, its toolbar right of the drawer, and does not draw one wholly
  under it. A block that takes the focus with none of it in view makes
  Insert close, saying so ("Insert closed: it was covering the block"),
  so the focused block is always seen.
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
  a quote offers the type scale's seven, and beside them Typeface, Body
  or Headings, the theme's two faces, each drawn in its face: the one
  its type takes is checked until another is chosen, and a closed Size
  and color names the typeface only where the block sets one ("Display,
  Headings typeface, Signal"). A setting the block leaves unset
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
  nine stand apart in the sidebar's width.
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
  a chevron on Text, Primary and Accent, which open to their tones; contrast
  ratios cut to one decimal, not rounded ("8.8 to 1" for 8.86), so a
  ratio never reads above a threshold it misses.
- **The header and footer**, which the layout draws as fixed parts of the
  theme, are opened as pages are and built with the page's own tools: a
  click on either on the canvas, a way to each from the Page tab, and the
  page switch's "On every page". The page around a part is drawn dimmed,
  so the part is edited where it is seen; Logo and Menu, the blocks a
  header is made of, are Insert's Site group, after the layout's groups.
- **The toolbar** (the layout's clamp, redrawn on 14 October 2026 at
  the owner's request): a floating horizontal bar by the selection's
  frame, where the layout drew a vertical one in the page's margin, so
  the same toolbar works on every device and the selection reads as one
  continuous line. While a text is written, the layout draws its clamp
  as the head, bold, italic and link; here the grip and More stay too, so
  the block can still be dragged, duplicated or deleted without leaving
  the text first (the text is handed over as the drag or the command
  starts). The head's block menu opens under the toolbar, and over it
  only where the window has no room below it. A column takes no Insert
  before or after: a block goes inside it, from its "+" or the "+" key,
  which opens at its end. Inside a block taller than the canvas whose
  top has scrolled away, the toolbar keeps to the canvas's top while the
  block is there, which the layout lists as not drawn.
- **The "+":** a page has seams above its first section and below its
  last as well as between two; each answers the pointer within 12 pixels
  of it. A seam's "+" names the place it adds at ("Add a section after
  Hero"); under the pointer, between two sections, it names both. The
  picker for a column says where the block lands in words beside the
  line ("after Heading", "at the top of Column 1", "in Column 2"). The
  bottom line's hint while the pointer is over a seam, with nothing
  selected, is the layout's sentence. The layout draws a seam's "+" in
  the page's middle and never a toolbar there; here, where the selected
  block's toolbar stands on it (a section's, inside its corner on the
  phone page), the "+" moves along its seam to the toolbar's side, and
  the toolbar is drawn over it: no key of the block in focus is ever
  under it.
- **Rich text:** the design draws no text being written. While a text is
  open, the block's toolbar carries bold, italic and link (above); the
  link's field opens under the block in the panel's field style. The
  bottom line says "Writing. Esc to finish". The text widget's Text group has no text
  field: its words are written on the page, and the group opens the editor
  there and says how; while the text is written, it lists the keys that
  work in it, from the keymap, Leave the text among them.
- **The Page tab** has no "Show in the site menu" toggle, which the layout
  draws as "Comes later": the site's menu is not a page's setting but a
  Menu block of the site's header, its links set in its panel, and the
  header is reached from the Page tab's way to it, beside Site style. A
  page that neither the header nor the footer links to says so under its
  address, with Add it to the header’s menu: the header opens, the page
  the last link of its menu, which is then selected, for the header to
  be published. The
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
- **Form responses:** the design draws no screen for them. They are the
  site's, like the media library, so they open from the mark's menu
  beside it rather than among the top bar's drawers, which are about the
  page open, and the window is the media library's: its size, head and
  footer, three columns where it has two (the forms, the responses, the
  one opened, on the details' tint), and its way of asking before a
  delete.

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
canvas, the drawers one at a time, Insert floating with the page keeping its
width, the Outline and History pushing it; sections anchored with the editor's own ids, which hold an
underscore no anchor can; the site's header and footer, locked, the
Outline naming them, a click on either opening it, the page dimmed around
it, and a click on that page going back; the
page 1088 wide at 1440 and in its desktop layout at 1280, 807 and 800
drawn at 81% beside the Outline or History, measured in a
browser that draws its scrollbar; in a 1280 by 800 window the pages
whole, a short block's toolbar drawn whole by it, and the page's title
kept whole; and in a
1024 by 768 window the pages drawn smaller to fit, the editor's own
controls and words on them (the toolbar, the "+") kept at their size and in their place, a
hovered block's name kept inside the canvas, at its outline's top left or
inside its corner at the canvas's top, drawn over the frame of a selection
just before it and placed again when the canvas scrolls or the window's
size changes under the pointer),
`drag.spec.ts` (every drop by mouse and by keyboard, Space with the
button held, refused drops, Esc, a drag on a page drawn smaller, its
words at their size, a block moved past a video without the provider's
player loading),
`focus.spec.ts` (the focus after every command, a move from the
toolbar's key and an add from a "+" among them), `clamp.spec.ts` (the
toolbar in every preview and window inside the canvas and over no words,
its moves and head in view; right of the Insert drawer over a block, and
back when it closes; a seam's "+" moved off a section's toolbar on the
phone page, every key drawn where it is and More opening the section's
actions; a seam's tip whole inside the canvas and clear of the toolbar
and the "+", right of the "+" at 1440, beside the Outline at 1184 and
1024; its head's menu under it and More, the arrows along it, its moves
one step each),
`insert.spec.ts` (the "+" on a block's
edge, its line and its picker by the mouse and the keys, an empty
column's large "+" with a video asking first, the seams under the
pointer, the page's top and foot among them, the "+" key after each kind
of selection, the dimension line waiting while a picker is open, Insert's
yellow line and its words clear of the selection's corner marks, Insert
before and after),
`keyboard.spec.ts`
(every key of the map, and the "?" window listing them; in a text being
written, Delete, Backspace and Ctrl+D changing letters and never the
block, and a version kept, a publish and a preview from inside the text,
each with what was just typed), `sidebar.spec.ts` (closed groups saying
their values; the groups open kept in the browser per block type, across
a reload and not in another profile; a value the CMS refuses opening the
group that holds it; the Page tab's description saved; a gallery's six
images in the sidebar and a long page's Outline each scrolling inside
itself, the window never, the page 1088 and 807 wide as before, in a
browser that draws its scrollbar), `devices.spec.ts` (a tablet's and a
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
selected; axe with the link's field open), `heading-in-place.spec.ts`
(a heading clicked once more written where it stands, the caret where the
click was, the CMS's after the pause and undone in one step, axe on the
line; a character typed on a selected heading writing into it, the Space
after it a space; Enter leaving; a pasted paragraph one line),
`menu.spec.ts`
(the block's menu), `drawers.spec.ts` (what a drawer may hide, on a page of
four columns whose first a floating drawer would cover, at 1440 and 1280:
beside the Outline or History a block focused by a command, the arrows or
Undo is in view whole with its toolbar; Insert gives way to a block it
covers wholly, and leaves one it covers in part with its toolbar right of
the drawer; at 1280, where it covers the first column and the room around
it, that block's toolbar stands right of it and works; Esc in the Outline keeps the block chosen there, the measure
shown to tell a block under a drawer from one in view), `marks.spec.ts` (the canvas's marks leaving the
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
library), `responses.spec.ts` (a page with a form published from the
editor and sent twice from the served page, once with markup and a
javascript: link in the answers; Form responses lists both newest first
with the time and the version, opens the newest whole from the keyboard
with the visitor's text as text and nothing made of it, passes axe, and
deletes it after asking, the focus on the response that took its place
and the CMS keeping only the other), `publish.spec.ts`
(the preview, a publish, the live page the CMS serves), `site-style.spec.ts`
(the canvas and the published page following a change),
`site-parts.spec.ts` (a button dragged from Insert into the header's
column, saved and published: a visitor's kept page answered 304 until the
publish and the new header at the next visit, the CMS drawing again the
page and the header's blocks that changed; the header on a phone, 375
and 320 wide, one row, Menu with its word and then its icon alone; a footer of words that cannot break inside
the window; menus in Hebrew, Greek and Cyrillic in their row at 1024 and
1440; the header opened from the Page tab by the keyboard, with axe; a
form pasted into the footer refused at its block), `welcome.spec.ts` (the
first-run note in a browser new to the editor, with axe, and Got it kept
across a reload), `identity.spec.ts`
(the mark read back at 16 px), `a11y.spec.ts` (axe in thirty-seven
states, at 1440 by 900 and at 1280 by 800, among them each drawer and the
Outline's headings, Block edges and the Page tab, the sidebar hidden, the
clamp's block menu, the block picker and the section picker, a seam under
the pointer with its "+" and tip, Insert open over a first column's block
with its clamp on the right, a text being written and its link's field,
a tablet's override, the history and its name field, the media library;
and on the published page), `widgets.spec.ts` (each widget's accessibility
test) and `keyboard-path.spec.ts` (the whole path with no pointer:
insert from Insert by its chord, move with Space and the arrows, add from
the page with the "+" key and its picker and move that block up from its
clamp, a heading's text and level in its Text group, a word made bold in
a text on the canvas, the devices in the bottom line, a column's tablet
space in its Spacing group, the Outline by its chord, an image uploaded
through the system's file chooser and placed with its alt text, undo and
redo, a named version, publish, the live page read at a desktop's and a
tablet's width). The ones tagged `@a11y` are what `npm run check:a11y`
runs. `npm run shots:editor -- <folder>` photographs the editor in every
state the approved layout draws but Schedule, named and staged as its
shots are, on the example site (`../../e2e/shots/editor-shots.ts`).
