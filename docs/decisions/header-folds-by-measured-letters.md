# A menu too long for the bar folds into Menu where the widths of its letters say

Decided on 9 October 2026, when the editor began to set the header and
footer.

## The question

The editor sets the site's name, the menu's links and the header's button
(`PUT /api/site`). The design's bar holds its own four links from 800 px
up, with 46 px to spare, and folds them into a Menu below that; at 375 px
its brand, button and Menu already run 8 px into the right padding. A
fifth link, or a longer name or label, no longer fits where the design
draws them. Asked for, in a word: lengths limited so that the header
still fits at 375 px and the menu does not wrap the bar.

Limits on lengths alone cannot do it. At 375 px the design's own name and
button are already the most the row holds. At 800 px the room for the
links depends on all of them together, on the name and the button beside
them, and on each letter: four links of six W's need more room than the
design's four, at 28 letters. Limits that held any letters would hold no
real menu. And the published page runs no script, so it cannot measure
itself and fold the links when they do not fit.

## The decision

- **Lengths, for what a phone shows.** `$defs/site` of the page schema
  limits the name to 28 characters, a link's label to 24, the button's to
  18, at most 8 links: in words of average width, what a 375 px phone
  shows on one line in its place (the name on a row of its own, the
  button beside Menu, a link in Menu's sheet).
- **A header that gives way rather than breaks.** The row wraps when its
  parts do not fit side by side (the brand above, the rest below on the
  right), as the narrowest phones already drew the design's; a name or a
  label wider than its place breaks inside it. The row's right padding is
  an item that gives way before the row wraps, so the design's header is
  laid out as before at every width.
- **A fold the server works out.** `npm run header-metrics`
  ([tools/header-metrics.ts](../../tools/header-metrics.ts)) measures,
  once, in Chromium, the width of each letter of the site's typeface in
  the header's three places, what the fonts the browser falls back to draw
  the letters of Greek, Cyrillic, Hebrew, Arabic and CJK at (the face
  holds a Latin subset), and the spacing around them, into
  [schema/header-metrics.json](../../schema/header-metrics.json).
  [HeaderFit](../../cms/app/models/header_fit.rb) adds up the width the bar
  needs for the words it holds and names on the header the narrowest of
  site.css's `data-fold` widths (880, 960, 1040, 1120, 1200, 1248) that
  holds it, or `all`; below it the links fold into Menu, as on a tablet.
  The design's header names none. The editor's canvas, to draw the same
  header, must add up the same file the same way.

## What it costs

- **A file of letter widths, measured in one browser on one machine,** to
  write again after any change to the header's styles or fonts, or to the
  fonts of the machine that measures. `--check`, in the check's fixtures,
  says when it is stale. The file keeps a fingerprint of the fonts that
  drew each script the face lacks: where a machine draws one with other
  fonts (another machine, or these fonts after an update), `--check`
  compares all the rest and says it could not run here, rather than
  failing. CI does not run it. Other browsers draw the face at the same
  advances, but nothing here measures them; and the letters the face
  lacks are drawn by a visitor's own fonts, of which the file holds what
  the measuring machine's drew, the widest of four.
- **The sum errs wide, and in the face's own letters never narrow.** It
  leaves out kerning and adds 1% for the pairs the face sets apart, and a
  step is 80 px: a menu may fold up to a step sooner than it must. A
  letter of Greek, Cyrillic, Hebrew, Arabic or CJK counts what it was
  drawn at, at its widest among those fonts (for CJK, the widest letter
  of the script), so a short menu in those alphabets keeps its links in the
  bar as one of Latin letters does. An Arabic letter counts the widest of
  the four forms it takes alone and joined to the letters beside it: heh,
  meem, alef, teh marbuta and keheh are drawn wider joined than alone, and
  counted alone, as they were until 10 October, the word مهم was drawn 17%
  wider than its sum in a link. Any other character counts 1.5 times the
  font size, so a word of symbols or of another script folds sooner still.
- **The menu may still wrap the bar, inside the page.** The promise that
  it does not holds for the face's own letters. A letter that a
  visitor's font draws wider than the file counted, or a character
  counted at 1.5 em that is drawn wider still, can put the bar on two
  rows at a width where the sum says one row fits: three of U+FDFD, the
  Arabic bismillah ligature, as a fifth link of the design's header (each
  drawn 91 px wide in a link, where 22.5 are counted) took two rows
  (118 px) at 880 and 920, where the sum puts the fold, and one (80 px) at
  1248 and 1440. `site.css` lets the links wrap inside the bar rather
  than leave the page, so nothing leaves it; the fold is not a guarantee
  of one row for such a letter, and the production check holds only the
  first for them.
- **Two programs add up the file:** the server, and the editor's canvas,
  which the parity of the theme's header with the served one
  (`builder/test/theme.rails.test.tsx`) must hold together.
- **A long header is taller on a phone.** The design draws one row; a
  name longer than the design's takes two rows there.

## The proof

From the repository root, `node tools/header-metrics.ts --check` measures
again and compares (a wrong width planted in the file fails it), and
checks its sum against words drawn whole, in Greek, Cyrillic, Hebrew,
Arabic and CJK too (with those scripts' widths cut to a third it fails on
the Greek words; with Arabic letters measured alone again, on eight
Arabic words such as مهم and مهرجان). With the serif family drawing Greek
and Cyrillic in another font, it says it could not compare those two and
exits 2, having compared the rest. `node tools/check-production.ts`
sets nine headers
through the API on a production CMS and draws its home page in Chromium at
23 widths from 320 to 1440 px: nothing leaves the page, the links show
exactly where `data-fold` says, and, for letters of the face, the bar is
one 80 px row there (for letters outside the face the machine's fonts
decide that, and it is not held); with the fold planted away, three of the
nine fail. From `builder/`, `npm run e2e -- header-footer` sets a short
Hebrew, a Greek and a Cyrillic header and shows their links in the bar at
1024 and at 1440, on the published page and in the editor (with every
letter outside the face counted at 1.5 em again, the Hebrew one fails at
1024). From `cms/`, `ruby bin/rails test test/models/header_fit_test.rb`
holds the sums, the lookup of a letter in its script, and the widths
site.css folds at; `builder/src/render/header-fit.rails.test.ts` holds the
editor's twin to it, to the bit.
