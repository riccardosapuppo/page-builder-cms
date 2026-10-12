# A menu folds into Menu where the widths of its letters say

Decided on 9 October 2026, when the editor began to set the header and
footer, for the header's bar; revised on 12 October 2026, when the header
became a part of the site made of blocks
([header-and-footer-are-parts.md](header-and-footer-are-parts.md)) and
the menu a block of its own, which may stand in any column.

## The question

A menu block holds a row of links, and a pill, Menu, that opens them as a
sheet. In a block wide enough the links stand in the row; in a narrower
one, they fold into Menu. The design's four links need 327 px. In the
design's header, the menu stands in the middle column of a row whose logo
and button take what they hold: at 1440 px the block is more than 700 px
wide, on a phone 375 wide less than 100. A fifth link, a longer label, a
menu in a narrower column, and the row no longer fits where it did.

The published page runs no script, so it cannot measure its links and
fold them when they do not fit; limits on lengths cannot do it either,
since what fits depends on all the links together and on each letter
(four links of six W's need more room than the design's four, at 28
letters), and on the width the menu's column is given.

## The decision

- **The block is a container of its own** (`container: menu /
  inline-size`, site.css), so its links fold on the width the block is
  given, wherever it stands: a header's middle column, a footer's, a
  page's section.
- **A fold the server works out.** `npm run header-metrics`
  ([tools/header-metrics.ts](../../tools/header-metrics.ts)) measures,
  once, in Chromium, the width of each letter of the site's typeface in a
  menu's links, what the fonts the browser falls back to draw the letters
  of Greek, Cyrillic, Hebrew, Arabic and CJK at (the face holds a Latin
  subset), and the gap between two links, into
  [schema/header-metrics.json](../../schema/header-metrics.json).
  [HeaderFit](../../cms/app/models/header_fit.rb) adds up the width the
  row needs for its words and names on the block the narrowest of
  site.css's steps that holds it, one every 40 px from 80 to 1120
  (`data-fold`), or `all` for a row wider than the widest; in a block
  narrower than its step the links fold into Menu. The design's four
  links fold below 360. The editor's canvas, to draw the same menu, adds
  up the same file the same way
  ([builder/src/render/header-fit.ts](../../builder/src/render/header-fit.ts)).
- **Lengths, for one line in a sheet.** A link's label is at most 40
  characters, a menu at most 12 links (the schema's `menuBlock`); a label
  wider than its place in Menu's sheet breaks inside it. Below 104 px the
  pill keeps its icon alone, its word for a screen reader.
- **In the header, the sheet hangs from the header's row**, at the row's
  edge on the menu's side, not from the menu's own box: a menu in a narrow
  column, beside a long name or a long button, opens its links inside the
  window.

## What it costs

- **A file of letter widths, measured in one browser on one machine,** to
  write again after any change to the menu's styles or fonts, or to the
  fonts of the machine that measures. `--check`, in the check's fixtures,
  says when it is stale. The file keeps two fingerprints of each script
  the face lacks: one of every width the fonts drew its letters at (alone,
  joined and after each letter of its script, in the four stacks), and
  one of that with what was drawn and the widths the file holds. Where a
  machine draws a script with other fonts (another machine, or these
  fonts after an update), `--check` compares all the rest and says it
  could not run here, rather than failing; a file edited, or written from
  other letters or stacks, fails wherever it runs. CI does not run it as
  a check: its production job asks it which lines of the links it may
  hold, says in its result what it did not hold, and fails only a file
  not drawn as it holds where no script is drawn with other fonts. Other
  browsers draw the face at the same advances, but nothing here measures
  them; and the letters the face lacks are drawn by a visitor's own
  fonts, of which the file holds what the measuring machine's drew, the
  widest of four.
- **The sum errs wide, and in the face's own letters never narrow.** It
  leaves out kerning and adds 1% for the pairs the face sets apart, and a
  step is 40 px: a menu may fold up to a step sooner than it must. A
  letter of Greek, Cyrillic, Hebrew, Arabic or CJK counts what it was
  drawn at, at its widest among those fonts (for CJK, the widest letter
  of the script), so a short menu in those alphabets folds where one of
  Latin letters does (Hebrew and Japanese below 240, Arabic below 280,
  Greek and Cyrillic below 360, where each letter counted at 1.5 em
  folded the last two below 720). A letter of Greek, Cyrillic or Hebrew
  counts the most it adds after any letter of its script: the fonts'
  kerning sets a few Cyrillic pairs apart, and with each letter counted
  alone, as until 10 October, АД was drawn 2.6% wider than its sum. An
  Arabic letter counts the widest of the four forms it takes alone and
  joined to the letters beside it: heh, meem, alef, teh marbuta and
  keheh are drawn wider joined than alone, and counted alone, as they
  were until 10 October, the word مهم was drawn 17% wider than its sum.
  Any other character counts 1.5 times the font size, so a word of
  symbols or of another script folds sooner still.
- **The links may still wrap, inside their block.** The promise that
  they stand on one line holds for the face's own letters, and for those
  of the scripts the file measures where the visitor's fonts are those it
  was measured with. A letter that a visitor's font draws wider than the
  file counted, or a character counted at 1.5 em that is drawn wider
  still (U+FDFD, the Arabic bismillah ligature, is drawn about 91 px wide
  in a link where 22.5 are counted), can put the links on two lines in a
  block the sum says holds one. `site.css` lets them wrap inside the block
  rather than leave the page; the production check holds only that for
  such a letter.
- **Two programs add up the file:** the server, and the editor's canvas,
  which `builder/src/render/header-fit.rails.test.ts` holds together, to
  the bit.

## The proof

From the repository root, `node tools/header-metrics.ts --check` measures
again and compares (a wrong width planted in the file fails it), checks
each step of site.css by drawing a menu on both sides of it, and checks
its sum against words drawn whole, in Greek, Cyrillic, Hebrew, Arabic and
CJK too. With the tab's sans-serif another font, it says it could not
compare those scripts and exits 2, having compared the rest; with the
file's fingerprint of Arabic, its check or one of its widths edited, it
fails. `node tools/check-production.ts` publishes ten headers through the
API on a production CMS and draws its home page in Chromium at the
phones', the tablet's and the desktop's widths, and at the windows that
put each menu's block on both sides of its step: nothing leaves the
page, the header holds one row, the links show exactly where the block's
width and `data-fold` say, and there they stand on one line, just past
the step too, for the face's letters and, where `--check` finds this
machine's fonts to be those the file was measured with, for the letters
of the scripts it measures; elsewhere those lines are not held, nor that
of a character counted at 1.5 em. From `builder/`, `npm run e2e --
site-parts` publishes a short Hebrew, a Greek and a Cyrillic menu in the
header and shows their links in the row at 1024 and at 1440, on the
published page and in the editor. From `cms/`, `ruby bin/rails test
test/models/header_fit_test.rb` holds the sums, the lookup of a letter
in its script, and the steps site.css folds at;
`builder/src/render/header-fit.rails.test.ts` holds the editor's twin to
it, to the bit, on 4000 generated menus.
