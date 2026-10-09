# The mix: Marked galley

Layout B ("Galley") is the skeleton: the page in the middle as a long proof,
document tools on top, one settings sidebar on the right, a line at the
bottom that says where you are. The mix keeps all of that and adds the two
things a proof gets when someone works on it: marks on the page where
something goes in (the round "+"), and the tools in the margin beside the
line being corrected (the clamp). The catalogue of blocks (Insert) floats
over the page when you ask for it; the Outline and History open beside the
page, as in B, so nothing you are working on hides behind them.

The identity is the approved mock's, unchanged: palette, Tool yellow always
with graphite edges, Instrument Sans in the chrome, Archivo and Source Serif 4
on the page, the mark, the widget icons, the marking-out selection, the
token controls. The page is the same "Slack Water" site, theme and images
(`../theme.css`, `../img/`, `../fonts/`, referenced, not copied).

Files: `index.html`, `styles.css`, `script.js` (states by hash; groups open
and close; right-click opens More; the device keys and the Alt+Shift chords
switch states; a desktop page with less than 800 of room is drawn smaller),
`extra-shots.mjs`. From `disposizione`: `node shots.mjs dir-mix` (the 13
states, `shots/`) and `node dir-mix/extra-shots.mjs` (18 extras,
`shots-extra/`, plus the clamp and width checks on all 31 states).

```
┌────────────────────────────────────────────────────────────────────────────┬──────────────┐
│ ▣▾ │ + Insert  Outline  History │ ↶ ↷        Home ▾        ✓ Saved  Preview  [Publish ▾] ◫ │
│                                  ◐ Published, 6 changes not live                          │
├────────────────────────────────────────────────────────────────┬───────────────────────────┤
│   ┌ page, 1088 wide at 1440, 928 at 1280 ──────────────────┐   │ Page │ Block              │
│   │ Slack Water                          Swims …  [Join]   │   │ H  Heading                 │
│  [H]─⌜Swim at slack water⌝                                 │   │ ▾ Text                     │
│  [⠿]  ⌞                 (+)⌟   ← "+" on the block's edge   │   │ › Size and color  Display  │
│  [↑]   Dawn swims, beginners’ courses…                     │   │ › Alignment       Left     │
│  [↓]   [Join a trial swim]                                 │   │ › Shown on        Every…   │
│  [⋯]                                                       │   │                           │
│   ├────────────────────────(●+)───────────────────────────┤   │                           │
│   │ the clamp lives in the margin  ↑   the seam "+"        │   │                           │
├────────────────────────────────────────────────────────────────┤                           │
│ Page › Hero › Column 1 › ⌜Heading⌟   ⬚ Block edges [Desktop|Tablet 768|Phone 390] Page 1088 wide │
└────────────────────────────────────────────────────────────────┴───────────────────────────┘
```

## 1. What came from B (the skeleton)

- **Top bar**: Insert, Outline and History (side by side, the three drawers
  together), Undo and Redo, the page's title in the middle (it opens the
  pages: find, switch, New page), the save state, Preview, Publish, the
  sidebar button.
- **Outline drawer** (Blocks and Headings) and **History drawer** (this
  session, versions, Save version, Restore). Both **push the page aside**, as
  in B: at 1440 the page is then 807 wide, still the desktop layout; at 1280
  the desktop page is drawn at 81%, as the editor does today when its canvas
  is narrower than 800 (`outline-col1`).
- **One sidebar on the right with "Page" and "Block" tabs.** Collapsible
  groups named after what they hold and after the real editor's settings
  (Text, Size and color, Spacing, Background, Text size and color, Line
  color, Colors, Alignment, Shown on, Name and link, Columns); a closed group
  shows its value; a group with a tablet or phone override says so ("Tablet
  differs").
- **The breadcrumb in the bottom line**, each step a button, and the drag's
  live sentence in the same line (graphite while something moves).
- **The Insert drawer**, kept for browsing everything and the ready-made
  sections, with its sentence that says where a click puts the block.
- From B unchanged: site style one level below Page, the media library, the
  conflict banner, the offline toast, the empty page's invitation.

## 2. What came from A

- **Adding on the page is the main way to add.** Round "+" buttons:
  - white with a graphite ring on the **bottom edge of the selected block**
    (adds a block right after it);
  - graphite on the **seam between two sections** (adds a section there);
  - **large, inside an empty column**, with words ("Add a block to Column 1,
    or drag one here from Insert").
- **When each "+" shows** (the rule the builders follow):
  - the block "+": on the selected block only, one at a time. It hides while
    a text is being written, and while the Insert drawer is open (its yellow
    line marks the spot instead);
  - the seam "+": always on the seam below the section that holds the
    selection; on every other seam (including the top of the first section
    and the bottom of the last) while the pointer is over it, with a hairline
    across the page and a tip that names the place ("Add a section between
    Gallery and See the bay", `seam-hover`). With nothing selected, as the
    editor opens, no "+" shows until the pointer finds a seam;
  - the large "+": always, in every empty column;
  - from the keyboard (the canvas is one Tab stop, so no seam is a Tab
    stop): **+** adds after the selection (a block after a block, a section
    after a section); with nothing selected it opens the section picker at
    the end of the page; **Insert before** in the block menu adds above,
    which is how a section goes above Hero.
- **Pressing one first opens the yellow insertion line at that spot**, then a
  small **picker beside it offers only what fits there**: blocks in a column
  (`add`), a section of 1 to 4 columns or a ready-made section at a seam
  (`insert-at-seam`). The picker is a non-modal dialog: its search takes the
  focus, arrows move between the keys, Enter adds, Esc closes and gives the
  focus back to the "+". A short graphite leader joins it to the line.
- **The clamp** (also in C): see section 4.

## 3. What came from C

- **The device switch in one click**: Desktop, Tablet 768 and Phone 390 are
  keys in the bottom line, beside the page's width, which is always shown
  ("Page 1088 wide, desktop layout"; "drawn at 81%" when the page is drawn
  smaller; it reads the real width from the page).
- **The clamp** (also in A): see section 4.

## 4. The changes the mix's brief asked for, item by item

1. **Adding on the page** (from A), as above. B's **Insert drawer floats**
   over the page at every window width, never pushes it, and stops above the
   bottom line so the breadcrumb stays readable. With a block selected it
   says where a click lands ("Click to add after Accordion in Column 2 of
   Questions, or drag to any column") and the page shows that yellow line
   (`insert-drawer-1280`). Insert in the top bar is as quiet as Outline and
   History: it is the catalogue, the "+" is the way.
   **Only Insert floats.** The mix's brief asks it of Insert alone; for Outline and
   History it is silent, so B decides: they push the page. A floating
   Outline would cover the left 288 of the canvas, which is the whole left
   margin where a first-column block keeps its clamp, and the clamp is where
   Tab goes (a fault against WCAG 2.2, 2.4.11 Focus Not Obscured). The
   Outline's job is to pick a block and then act on it, so it must not hide
   that block.
   **While Insert covers a block's left margin, the block's clamp goes to
   its right side** (the gutter, or the page's right margin), by the same
   rules as on the left (`insert-col1`: the Hero heading, its clamp in the
   32 gutter beside the image). The yellow line's label moves to the line's
   right end.
2. **The block's toolbar is a vertical graphite clamp in the page's margin**,
   never over the block. From the top: the **yellow head** with the block's
   type icon, which opens the **block menu** (the moves, then everything in
   More; what Shift+F10 opens); **drag**; **move up**; **move down**;
   **More** (copy, paste after, duplicate, insert before or after, select the
   parent, delete: the same items as the right-click menu, `more`). A
   column's clamp moves **left and right**; a section's clamp sits inside the
   section, in the same margin, so all the clamps line up on one vertical.
   - **Where it goes.** The margin on the block's left: the page's margin
     for a first column or a single one, the gutter for the others. A gutter
     of **48 or more** holds the full clamp (34 wide) and its tie (14). A
     gutter of **28 to 47** (the 32 of Hero and What we do) holds the
     **narrow clamp**: 28 wide, keys of 26, centred in the gutter, no tie; it
     touches the selection's frame and stays 2 clear of the column beside it
     (`narrow-gutter`: Beginners’ course selected; the hero image's clamp in
     `media` is the same). A gutter **under 28** (a section whose Space
     between columns is set to L or less) cannot hold a clamp: it goes out to
     the nearest page margin, level with the block's top, with no tie (not
     drawn; listed in section 10).
   - **Every block gets the same clamp, whatever its height.** The mix's brief asked
     for a short version under about 120 tall. Measured on this page, that is
     9 of the 21 blocks at 1440 and 10 at 1280 (every h2, the hero text and
     button, the Questions and Join texts), and the Hero heading is 133 tall
     at 1440 but 117 at 1280: the short version would take one-click moves
     from almost half the blocks, and change a block's tools when the window
     narrows or the text gets a line longer. So the clamp keeps its five
     keys everywhere; on a short block it runs on below it, in the margin,
     where nothing else sits (one block is selected at a time) (`small-block`:
     the 54-tall button). It never flips: the margin runs to the foot of the
     page, and the canvas scrolls to show the whole clamp when a block is
     selected. This is the one place the mix departs from the mix's brief; the short
     version can come back as a CSS rule if the owner wants it.
   - **Bold, italic and link while writing** (`text-editing`): my call is
     the clamp itself. While words are being written, Up, Down and Space
     belong to the text, so the clamp's moving keys have nothing to do; they
     give their place to **Bold, Italic and Link** (with Bold shown pressed
     on the bold words), and Esc gives them back. Why there, rather than a
     separate bar beside the clamp or above the text: it never covers a
     word (a bar above the text covers the end of the block above, whose gap
     is only 24); it does not jump as the selection moves; it is where the
     eye and the Tab key already find the block's tools; and it is how the
     real editor works today, which draws Bold, Italic and Link on the
     selected text block's own bar while its text is open
     (`builder/src/editor/rich/FormatBar.tsx`): the bar is now vertical. The
     sidebar's Text group lists the three with their keys while you write,
     and the bottom line says "Writing. Esc to finish".
3. **The device switch is one click** (from C), in the bottom line, beside
   the width. **B's View menu goes.** Of its options, "where the toolbar
   sits" has no reason left (the clamp always has the margin), and "outline
   every block" becomes **Block edges**, a toggle in the bottom line next to
   the devices: both are ways of looking at the page. Below 1360 wide it
   keeps its icon and its name for screen readers only. Keyboard shortcuts
   stay in the mark's menu and under "?".
4. **Keyboard, as the real editor does today**: see section 6.
5. **Left out of this stage** (section 5).
6. **Page settings in the sidebar's Page tab** (`page-tab`): title, address,
   search description; **Site style one click below** ("Site style, palette
   and type scale for every page"), with a way back. **Show in the site
   menu** is drawn, as the mix's brief asks, but **marked "Comes later"** and switched
   off: today the site's menu is not page data, it comes from the CMS's
   configuration (`cms/config/site.yml`), and nothing in the editor changes
   it. It is new CMS work, priced apart in section 8. Title, address and
   description already exist in the real editor.
7. **Publish**: the Publish menu holds three plain items (Publish now,
   Schedule…, View live page). **Schedule… opens a small dialog of its own**
   (`schedule`): date, time, the site's time zone, a sentence on what
   happens to later changes, Cancel and "Schedule for Oct 4 at 6:15 AM". No
   fields inside a menu any more (that was a critical finding against all
   three directions).
8. **Width**, measured with the scrollbar shown, as a Windows browser draws
   it (a thin one, 10 wide): with no drawer open the page is **1088 wide at
   1440** and **928 at 1280**, the desktop layout. Where the scrollbar
   overlays the page (a Mac, and the headless screenshots, which hide it) it
   is 10 more: the screenshots read 1098 and 938. The frame keeps 19 each
   side for that. With **Insert** open the page keeps that width (it
   floats); with **Outline or History** open it is 807 at 1440 (desktop
   layout; 817 in the screenshots) and, at 1280, the desktop page drawn at
   81% (82% in the screenshot).
   `extra-shots.mjs` measures all of it in a browser that draws scrollbars,
   and fails if the page is narrower than promised (last run: editor 1088,
   editor-1280 928, insert-drawer-1280 928, insert-col1 1088, structure 807,
   history 807, outline-col1 800 drawn at 81%).

## 5. What was left out, and why

- **"/" in an empty line, and "Turn into"** (B): they need new commands in
  the real editor; they come later. The clamp's head opens the block menu,
  not "Turn into"; no "/" hint anywhere.
- **The short clamp** (the mix's brief): see 4.2; every block keeps its moves.
- **"Link to this block" on widgets**: the real editor gives an anchor to
  sections only (`AdvancedTab.tsx`). Sections keep it, in "Name and link";
  headings, texts and accordions no longer show it.
- **A's floating settings card**: it covered what was next to the block and
  changed place with every block. Settings stay in the one sidebar.
- **A's Plan view** (the page drawn as boxes): it replaced the page; a later
  candidate as a second tab of the Outline.
- **A's single menu** for history, media, site style and pages: each keeps
  its own place (History in the top bar, media from the Image group, site
  style under Page, pages under the title).
- **C's rulers, zoom to fit, command line and graphite frame**: designer
  tools, or a change to the approved look. The bottom line stays B's plate
  (graphite only while a block moves, as in B).
- **B's floating toolbar above the block** (replaced by the clamp), B's
  docked-toolbar option, the Quote hover card in Insert.

## 6. Keys

Kept, from the real editor's keymap (`builder/src/editor/keymap.ts`):
- Down and Up select the next and previous block; Alt+Up the parent column
  or section; Alt+Down the first block inside; Esc clears the selection.
  **The canvas is one Tab stop**: Tab from the selected block goes to its
  clamp (one stop; Up and Down move along it; Esc goes back to the block),
  Tab again to the sidebar.
- Space picks up a block, the arrows carry it (Left and Right to another
  column), Space drops it, Esc puts it back.
- Enter edits a block's text; Ctrl+C, Ctrl+V (paste after), Ctrl+D, Delete;
  Shift+F10 opens the block menu (the menu key, as today).
- While writing: Ctrl+B, Ctrl+I, Ctrl+K, Esc to leave the text.
- Ctrl+Z, Ctrl+Shift+Z (and Ctrl+Y), Ctrl+S (opens History on Save version);
  Ctrl+Shift+Enter publishes now; ? shows the list.

Changed or new (no Ctrl+Alt anywhere: it is AltGr on the Italian keyboard):
- **Preview: Alt+Shift+P** (today Ctrl+Alt+P).
- **+** (the page has the focus, nothing being written): opens the picker
  after the selection, offering what fits there: blocks after a block, a
  section after a selected section, blocks in a selected empty column; with
  nothing selected, the section picker at the end of the page. The key and
  the round button are the same sign. "+" is its own key on the Italian
  keyboard, Shift+= on others, and on the number pad.
- **Alt+Shift+N**: open Insert. **Alt+Shift+O**: open the Outline.
- **Alt+Shift+1, 2, 3**: Desktop, Tablet, Phone.
- Dropped: B's Ctrl+Alt+I, O, S and P, Alt+F10, Ctrl+Shift+Up and Down (not
  in the real editor; the clamp's keys and Space with the arrows do it).

Why Alt+Shift with these letters: Ctrl+Alt is AltGr; most Ctrl+Shift letters
already belong to the browsers (developer tools, private windows, bookmarks,
reopening a tab, screenshots); one browser uses Alt+Shift+I, T and A for its
own panels, and another opens its menus with Alt and F, E, V, S, B, T or H,
so those letters are avoided. Alt+Shift chords are matched by the key's
place (`code`), as the real editor already does for its Alt chord, so a
Mac's Option characters and other layouts do not change them; inside a text
they never fire when the press would type a character.

## 7. The six things the brief asked to change, against today

| Today | In the mix | Why it is better for someone editing their own pages |
| --- | --- | --- |
| Widgets from a tile tray on the left | Round "+" on the page, where the block goes; a picker beside it with only what fits; Insert drawer for browsing | They choose the place first and see it; they never drag from the edge of the screen; the left of the screen is the page's |
| Properties in the same left tray | One sidebar on the right, Page and Block | One fixed place, no Add/Edit switch, and the page has its own tab |
| Structure tree in a fixed right column | Breadcrumb always in the bottom line; Outline drawer on demand | The path is always visible in one line; the full tree is one click away, and it opens beside the page, not over it |
| Device switch in the middle of the top bar | One click in the bottom line, beside the width | The device is a way of looking at the page, with the width it gives |
| Content / Style / Advanced tabs | Groups named after what they hold, showing their value when closed | "Shown on" says what "Advanced" hid; a block reads at a glance |
| A small yellow tab on the block's corner | The clamp in the margin: type, drag, up, down, More | Moving up and down is one click on every block; it never covers the block or the column beside it; it sits where a proofreader marks |

Better than today: the page is wider (1088 and 928, desktop at 1280, with a
scrollbar showing); no column ever opens on the left until asked for; adding
is where the block lands; moving up and down is one click on every block;
settings never hide behind a switch; Schedule is a real dialog.
Worse than today: the Insert drawer covers the left of the page while open
(a selected block's clamp moves right, but the first 200 of a first-column
block hide under it); the Outline and History make the page narrower while
open, and at 1280 draw it at 81%; widgets are not on screen until a "+" or
Insert is pressed; the tree is not visible by default; the clamp is one more
object beside the selection, and on a short block it reaches past it.

## 8. How hard to build (my view, after reading `builder/src/editor/`, read only)

The two judges put the mix at 150 to 215 hours (counting tests and photo
rounds) and 65 to 90 (counting the moves). Where the work is:
- **Moves** (cheap): device keys into the bottom line (`TopBar.tsx`); the
  Insert drawer made floating (`editor.css`); Navigator and History into
  drawers that push the canvas (the scaled desktop page under 800 already
  exists: `shared/preview-widths.ts`, `fitPreview`); the frame's room from
  `clientWidth` less 2×19 instead of `FRAME_ROOM` (2×28 + 12), so 1088 holds
  at 1440 with the scrollbar; the breadcrumb from the selection's path;
  Schedule… from menu items into a dialog (`Publish.tsx`); title, address and
  description into the Page tab (they exist in `EditPanel.tsx`).
- **The clamp** (medium): the floating bar in `Canvas.tsx` becomes vertical
  and anchored to the block's left edge; its place is chosen from the gutter
  it lands in (full, narrow, or out to the page margin) and from whether the
  Insert drawer covers it (right side); the overlays already counter the
  page's scale (`--canvas-unscale`); the format keys already exist
  (`rich/FormatBar.tsx`) and move into it; `BlockMenu.tsx` gains Insert
  before and after, Select parent, and the moves for the head.
- **The "+" and pickers** (medium): `insert.ts` already inserts after the
  selection; the seam and empty-column targets are new positions, and the
  seam under the pointer a new hover target; the pickers reuse
  `Palette.tsx` and `presets.ts`, filtered by place.
- **Groups with summaries** (medium): `StyleTab` and `AdvancedTab` split
  into named groups, each with a one-line summary. The settings themselves
  stay the real ones: a column keeps its Text color and all seven type steps
  (`STYLE_KEYS_BY_TYPE`, `TYPE_STEPS`), the media library its JPG, PNG, WebP
  and GIF (no SVG: `library/files.ts`).
- **Tests and photos**: the e2e and the shots name today's places; they move
  with the layout.

**New, not moves** (on top of the 65 to 90 hours, and of the 150 to 215):
- **"Show in the site menu"**, about **12 to 20 hours**: the menu becomes
  page data (the document's contract and its validation), the CMS stores it
  and builds the menu from the pages instead of `cms/config/site.yml`, the
  site header renders it, and the editor's switch saves it. Drawn as "Comes
  later" until then.
- Nothing else drawn here is new: the widget anchors that were drawn are
  gone (section 5).

## 9. States

The brief's 13, in `shots/` (1440×900; `editor-1280` at 1280×800):

| State | What it shows | Focus on |
| --- | --- | --- |
| `editor` | Heading selected: the clamp in the margin, the "+" on its edge and on the seam below Hero; the Block tab; breadcrumb, devices, width | the heading's Text field |
| `editor-1280` | The same at 1280: page 928 wide (938 without a scrollbar), desktop layout, the same five-key clamp; Block edges icon only | the same |
| `add` | The "+" under Heading pressed: the yellow line opens, the block picker beside it | the picker's search |
| `structure` | Outline open beside the page (807 wide, desktop); Text in Column 2 of See the bay selected, its full clamp in the 48 gutter, the seam "+" below See the bay; in sync with the tree and the breadcrumb | the Text row |
| `style` | Column 1 of Hero: its clamp (left, right), Spacing with the tablet override, Background, Text size and color (the seven steps and Text color), Alignment and Shown on closed | the Space inside scale |
| `drag` | Button moving: drop line, ghost, hatched areas, the live sentence in the graphite bottom line | none (a pointer drag) |
| `tablet` | Tablet 768 pressed in the bottom line; Column 1 with its tablet-only L | the Column 1 step |
| `publish` | Publish menu: Publish now, Schedule… (opens a dialog), View live page | Schedule… |
| `history` | History open beside the page; nothing selected, so the Page tab | Save version |
| `media` | Media library: an upload, alt text required, Use image waiting; JPG, PNG, WebP or GIF | the alt text |
| `site-style` | Site style below Page; Primary edited to Harbour, previewed on the page | Harbour |
| `empty` | A new page: the section picker laid out on the page, with the seam's "+"; the site-menu switch marked "Comes later" | 2 columns |
| `shortcuts` | The real keys, and the ones the mix adds | the search |

Extras, in `shots-extra/`: the six of the mix's brief, `text-editing`,
`small-block` (now the full clamp on the 54-tall button, running on below
it), `insert-at-seam`, `insert-drawer-1280` (1280×800), `page-tab`,
`schedule`; then `block-menu` (the head's menu, with the moves), `more`
(More, same as right-click), `new-section` (a new 2-column section, a large
"+" in each empty column), `phone`, `section` (a section's clamp, Shown on,
Name and link), `pages`, `conflict`, `offline`; and the four drawn after
review:
- `narrow-gutter`: Beginners’ course selected in What we do; the narrow
  clamp centred in the 32 gutter, clear of "Twice a week, at first light,
  when the" in the column beside it; focus on the clamp's head;
- `seam-hover`: nothing selected, the pointer over the seam between Gallery
  and See the bay: hairline, "+", tip; the bottom line says how to add;
- `outline-col1` (1280×800): the Outline open beside the page, a
  first-column block (the Hero heading) selected, its clamp in full view;
  the page drawn at 81%;
- `insert-col1`: the Insert drawer floating over the left at 1440, the Hero
  heading selected: its clamp on the right, in the 32 gutter; the yellow
  line's label at its right end.

**The owner's choice of 4 October 2026, over the `drag` state's
hatching.** Trying the editor, the owner asked for no diagonal lines on the
areas a moving block cannot go, and a light grey background instead. The
editor draws them as a light, flat grey wash (Alloy at 85%, no stripes)
over the section bands, the theme's header and footer and the page around
them, wherever this mock draws hatching; this choice overrides the mock,
whose `shots/drag.png` stays as approved. What the hatching also said is
still said without colour: the "Widgets go inside a column." note, now
with a Steel edge so it stands out against the grey (3.7 to 5.1 to 1 over
the site's six band colours; Rule was 2.1 to 2.9), the browser's no-drop
cursor over the grey, and the bottom line's sentence ("Nowhere to drop it
here."). The places that can take the block keep their graphite marks,
9.6 to 13.1 to 1 against the grey (`builder/e2e/drag.spec.ts` measures
them from the pixels).

**The owner's choice of 9 October 2026, over "Comes later".** Trying the
editor, the owner asked how the header is changed, and then for a panel
for the site's header and footer. The editor now changes the site's name,
the menu's links, the header's button and the footer's two lines in
Header and footer, an entry of the Page tab that this mock does not draw:
it is drawn as Site style is, a level below Page with its way back, and a
click on the header or the footer on the canvas opens it too. This choice
overrides the sentence above that nothing in the editor changes the menu.
The menu stays the site's, not a page's setting, so the page's "Show in
the site menu" switch, drawn as "Comes later" and priced as new work, is
not drawn: the menu is changed there, link by link. The mock's shots stay
as approved (`builder/e2e/header-footer.spec.ts` drives the panel).

## 10. Known weak spots

- **The Insert drawer covers the left of the page**: about 200 of every
  first-column block at 1440 (the clamp moves right, so it stays usable, and
  the drawer's sentence names the place). A target there means closing
  Insert or using the "+" on the page.
- **Outline and History narrow the page**: 807 at 1440 (still the desktop
  layout, 7 above its threshold), and at 1280 the page is drawn at 81%
  (body text about 15 px on screen). It is today's behaviour at 1280.
- **The narrow clamp is tight**: 28 wide with keys of 26 in a 32 gutter,
  2 clear on each side; the keys stay above the 24 the rules ask for. In
  the tablet and phone previews the clamp straddles the page's edge.
- **A gutter under 28** (Space between columns set to L or less) sends the
  clamp out to the page margin with no tie: the selection's frame is then
  the only link between them. Not drawn.
- **A short block's clamp reaches past it**: beside a 42-tall heading the
  clamp runs about 120 below, next to the block that follows. Its head and
  tie sit on the selected block, and nothing else is in that margin, but it
  is one more thing to read.
- **Formatting in the clamp is far from the words** in a wide column; the
  keys and the sidebar's list make up for it. Not drawn: a long block whose
  top scrolls away (the clamp should stick to the top of the canvas while
  its block is in view).
- **Two menus overlap**: the head's menu is More plus the moves. It may be
  simpler to make the head's menu the only one; I kept More because the mix's brief
  asks for it and right-click users expect it.
- **"+" as a key** relies on the canvas being in focus mode for screen
  readers (it already takes the arrows); and Alt+Shift chords are checked
  against the browsers' own keys, not against every desktop's.
- **The picker covers the column beside it** (the hero image in `add`).
- **The bottom line is full at 1280** when a long breadcrumb gets a hint
  (writing at 1280 is not drawn).
- **Static mock**: picker, menus and clamps are placed for 1440×900 and
  1280×800 only. Accessibility checked with axe (WCAG 2.0 to 2.2, A and AA)
  on all 31 states: no violation.

## 11. Review log

Round 1 (13 PNGs and 13 extras): the insertion slot's class clashed with Site
style's palette rows (Site style broke): renamed. The empty page's "+" sat on
its title: laid out in a row. The picker's key line wrapped badly: its own
line. "Desktop, tablet or phone" wrapped in the shortcuts: three rows. The
sidebar's while-writing list had bullets: styled. The Insert line overlapped
the accordion's selection: moved below it. The section's seam "+" was cut by
the canvas: the view opens a little lower. At 1280 the bottom line was tight:
Block edges becomes icon only below 1360.
Round 2 (13 PNGs and 14 extras, `block-menu` added): `#block-menu` was also a
menu's id, so the browser scrolled the page to it: renamed. The "+" drew over
an open block menu: a clamp with an open menu comes forward. axe found
`aria-checked` on `<html>` (the device script matched `data-device` on the
root): scoped to the bottom line. The top bar got a name.
Round 3 (13 PNGs and 14 extras): the short clamp's menu ran past the bottom
of the canvas: it opens upward from the clamp's foot when there is no room.
Shift+F10 (the real editor's menu key) added to the shortcuts. Unused rules
of B's floating toolbar removed.
Round 4, after the two reviews (13 PNGs and 18 extras, four new): the clamp
reached 16 into the column beside it in 32 gutters: the narrow clamp, and
`narrow-gutter`. The short clamp removed (moves on every block; the 1280
heading had broken its own rule). Floating Outline and History hid
first-column clamps: they push the page, the page is drawn smaller under
800, the clamp goes right under Insert; `outline-col1`, `insert-col1`. The
"+" got its rule and `seam-hover`. Widths now hold with the scrollbar shown
(frame 19 each side) and the script measures them that way. Copy matched to
the real editor: no widget anchors, the column's seven type steps and Text
color, Line color on the accordion, Colors on the button, Shape Original on
the image, JPG/PNG/WebP/GIF in the library; the site-menu switch marked
"Comes later". On the photos: the seam pointer showed on every state (an
SVG ignores `hidden`): wrapped in a span; the Insert line's label sat under
the drawer: moved to the line's right end; the tablet group's summary named
the desktop source like its neighbours. The clamp check now also fails a
clamp that reaches into a neighbouring column, hides under anything, or
lacks its moves; it runs on all 31 states. Both scripts exit 0; axe finds
no WCAG A or AA violation on any of the 31 states.
