# Final mock: the change list

The owner chose direction A ("light workshop"), one of the three directions
drawn and judged in stage 0, as the base. The name stays
**Page Builder CMS**. The final mock starts as a copy of direction A, which
stays untouched as the judged version. Only the final mock is kept in this
repository.

Every item below is required. Each one is verified against the screenshots,
so do it where the item says it shows. The brief common to the three
directions still applies in full, including the hard rules and both tools
exiting 0.

Sources: the judges found the defects in A themselves. Grafts are marked (C)
or (B) for the direction the idea comes from. You may look at the other two
of the three directions to see a graft, but implement it in A's own visual
language.

## Identity

1. **A more ownable accent.** Replace Marking blue `#2447E0`. On grey trays
   it reads as the stock blue of the common design and site tools.
   - Choose ONE hue that:
     - is not default blue, acid green, vermilion or terracotta;
     - is clearly distinct from the site palette (Sea green, Buoy orange)
       and from the danger red;
     - stays ≥ 3:1 against the canvas paper, the trays and the bench (it
       marks selection, insertion, the drop line, focus on the canvas and
       the primary action);
     - has a text-safe partner for the primary button label.
   - Think of a chalk line or a marking gauge: a working colour, not a
     brand gradient.
   - Update `tokens.json` (colours and pairs), the mark if it uses the
     accent, and every state. Justify the choice in NOTES.md.
2. **A width rule above the canvas (B), in A's dimension-line language.**
   It shows the canvas width ("Desktop, 832 wide" / "Tablet, 768 wide") and
   notches at the breakpoints taken from tokens.json (560, 800). It gives
   the chrome its identity even when nothing is selected. Never show a pixel
   size of the selection: steps only, as now.

## Words and controls

3. **Plain spacing names (C).** Rename "Padding" to "Space inside" and "Gap
   between widgets" to "Space between widgets". The steps become None, XS,
   S, M, L, XL (and XXL if needed) instead of "space 0–9", everywhere:
   - the Style tab, with the base value marked by the hollow ring;
   - the dimension lines on the canvas ("M", plus the tablet glyph for the
     override);
   - History rows ("Set Space inside to M on tablet, Column 2");
   - the token sheet.
4. **Labelled device switch (B):** Desktop, Tablet, Phone in words, not three
   look-alike icons.
5. **Per-control scope labels in the Style tab (B):** "All devices" against
   the tablet glyph on the overridden control.

## States

6. **`style`.**
   - The tablet canvas opens with the hero in view, and shows the reflow:
     the site header collapses to a **Menu** button (C) and the hero
     stacks.
   - The override exists only at tablet width as a real container-query
     rule in a page stylesheet (C's `#page-css` idea), so canvas and page
     agree.
   - Keep A's banner, the Remove button and the dimension line.
7. **`page-phone` (C).** The site navigation must stay reachable on phone:
   a Menu button in the header, never hidden links with no control.
   Render the menu closed, with the button visible.
8. **`save-states`.**
   - One name per state across card header, caption and banner (e.g.
     "Changed in another tab" everywhere).
   - The conflict banner shown in place under the real top bar, with
     "Saving is paused until you choose" (C); Publish stays disabled during
     the conflict, as A already does.
   - Add the consequence lines (B): "Publish is paused until you choose",
     "Closing the tab warns that N changes would be lost", "Either choice can
     be undone from History".
   - Add a small "How it moves between states" transition diagram (B), which
     replaces three of the four near-identical hero thumbnails.
   - The "Connection lost" toast must not cover an illustration.
   - The warning tint must not read as cream: it must sit clearly away from
     #F4F1EA.
9. **`media`.**
   - "Use image" is disabled while the alt error shows.
   - Add a header count "11 images, 2 without alt text", a "Missing alt
     text" filter and a "No alt text" flag on the affected tiles (B).
10. **`site-style`.**
    - Curated swatches only: remove the free Hex field (B).
    - An edited slot shows "Edited, was Sea" with "Reset to Sea" (C), plus
      two contrast checks in words: button text on it, and links on the
      background (C).
    - The top bar save state shows "Saving…" while the change lands (B).
    - Scroll the canvas so the hero heading is visible and visibly restyled.
    - Fix the icon-box text that wraps to 4 lines and is cut at the window
      edge ("line.").
11. **Type scale.** Fix the duplicate step: Heading 3 and Large text are both
    24 px. Make the scale consistent with its own hint ("each step is about
    a third larger" or whatever ratio you state), in `site-style`, on
    `tokens` and in tokens.json.
12. **`empty`.**
    - Undo and Redo are disabled.
    - Publish is not the primary on a page with no content: make it disabled
      or secondary, with the reason in a tooltip or line.
    - When nothing is selected, the Edit tray shows **page properties** (C):
      title, address, description in search results, "Show in the site
      menu".
13. **`drag`.**
    - The drop line opens a visible gap between Text and Map instead of
      sitting on Map's top edge.
    - The ghost tile does not cover the map.
    - The forbidden areas are clearly hatched, not a faint grey on grey.
14. **`publish`.**
    - Exactly ONE focus ring on screen: the stale ring on the Text field
      must go.
    - Under Publish now: "Visitors see your 6 changes right away" (B).
    - The live address under "View live page" (B).
    - A "Change" link next to the time zone.
15. **`shortcuts`.** Exactly ONE focus ring on screen (drop the stale ring
    behind the scrim).
16. **`history`.** A "Current draft: 6 changes not published yet" row at the
    top of Versions (B). The same spacing words as item 3.
17. **`editor`.**
    - Move the "Button" hover tag so it does not touch the paragraph's
      descenders.
    - Navigator rows show column counts ("2 columns") (C).
    - The navigator footer reads "7 sections, 19 widgets" (B), with the real
      counts of the mock.

## Drawing details

18. **The Quote icon** reads as "99" at tile size: redraw it as quotation
    marks that read at 20–24 px. On the published quote, the opening mark is
    “, not ”.
19. **The map illustration:** the pin sits on a dark rectangle that pokes out
    on both sides (it reads like a kettle). Redraw.

## Architecture of the mock

20. **The site theme in its own file, `theme.css`,** loaded by the canvas and
    the published page alike, separate from the chrome CSS. This makes "same
    theme CSS on canvas and page" provable.
21. **A "States" row on the token sheet (C):** focus on chrome, focus on the
    canvas, selection, device override, error.

## Done means

- Every item above is visible in the named state, or provable in the CSS for
  items 6 and 20.
- `shots.mjs` and `contrast.mjs` (now in `design/tools/`) both exit 0.
- NOTES.md has a "Final round" section: one line per item number above, what
  was done, and where it shows.
