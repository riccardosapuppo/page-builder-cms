# src/document/

The page document as data, and every change to it, in pure functions: no
React, no DOM, no clock, no network. Everything here runs in Node, and its
tests say so in their first line, `// @vitest-environment node`.

Types come from `../shared/document.ts`, the validator and the pieces of
the application rules from `../shared/validate.ts`. Nothing here imports
from `../store`, `../render`, `../widgets`, `../editor` or `../storage`,
except `property.test.ts` and `mutants.test.ts`, which replay each random
session through the store as well.

| File | What it holds |
| --- | --- |
| `tree.ts` | Finding a block, its container and its place (an index per page, kept while the page lives, since pages are never changed in place), and the immutable updates that copy only the blocks on the way down. |
| `nesting.ts` | The nesting rule: page > section > column > widget, read from the schema when the editor is built (`../../build/nesting.ts`, served as `virtual:block-document-nesting`), never written out here. |
| `ops.ts` | The steps every command is made of: insert, remove, move a block; set or take out one key; insert, remove, move an item of a list. Each carries both sides of its change, so its inverse is the same step read the other way. |
| `commands.ts` | The makers of commands, one per thing the editor does, and `invertCommand`. |
| `reducer.ts` | `applyCommand(page, command)`: the next page and where the focus goes, or why not. |
| `check.ts` | What a change must not break, checked where it can break it. |
| `drag.ts` | Drag and drop as data: a preview on a tree of its own, one command on the drop. |
| `clipboard.ts` | Copy and paste of a block as text, read back like anything from outside. |
| `ids.ts` | Where new ids come from, and fresh ids for a copy. |
| `labels.ts` | The words of the history and the drop announcements, in en-US. |
| `rich-text.ts` | The text widget's document as the canvas's text editor hands it over, made into one canonical form the schema takes (`richTextFromEditor`: marks bold, italic, link, a link's href alone, a numbered list's start from 2 and its type a, A, i or I, no marks on a line break, control characters as spaces, a half of a UTF-16 pair alone as U+FFFD, runs with the same marks joined and cut at the schema's 10000 characters), and `makeTextEdit`, the command that keeps it. |
| `upgrade.ts` | The twin of the server's upgrade of an older `schemaVersion`, and `openDocument`, what a stored page goes through before the editor loads it. |
| `json.ts` | Equality, copies and key placement for JSON values, where an absent key is not a key holding `undefined`. |

## Commands

A command is a value: its kind, the label the history shows, the block it
is about, and its steps. The makers:

| Maker | Kind | Label, as the history shows it |
| --- | --- | --- |
| `makeInsert` (a block made elsewhere, such as the widget panel's), `makeInsertSection`, `makeInsertUploadedImage` | insert | "Added Quote to Column 2 in Hero", "Added a section with 2 columns", "Added Image to Column 1 in Join" |
| `makeDelete` | delete | "Deleted Divider in Hero" |
| `makeMove` | move | "Moved Heading to Column 1 in Join", "Moved Heading in Hero" |
| `makeDuplicate` | duplicate | "Duplicated Hero" |
| `makePaste`, with `pasteTarget` | paste | "Pasted Quote into Column 1 in Hero" |
| `makeSetProps` | props | "Changed Button text in Join", "Changed Quote in Members’ words", "Renamed section to Questions" |
| `makeTextEdit` (`rich-text.ts`), a text written on the canvas | props | "Changed Text in Hero" |
| `makeSetStyle` | style | "Set Space inside to L on tablet, Column 1 in Hero", "Cleared Alignment on tablet, Column 1 in Hero" |
| `makeSetColumnWidths` | columnWidths | "Set the column widths of Hero to 3:2", "Set equal column widths in Hero" |
| `makeSetColumnCount` | columns | "Changed Hero to 3 columns" |
| `makeSetPage` | page | "Changed the page title", "Removed the page description" |
| `makeReplacePage` (the whole page given way to another: a reload after a conflict takes the server's) | page | the caller's: "Reloaded the page saved in another tab" |
| `makeInsertItems`, `makeRemoveItem`, `makeMoveItem`, `makeSetItem` | items | "Added 2 images to Gallery in Join", "Removed image 2 from Gallery in Join", "Changed the alt text of image 1 in Gallery in Join" |

What they promise:

- **Everything that is not deterministic is decided when the command is
  made**: the ids of a duplicate, a paste or a new section or column
  (drawn from an injected `NewId`, `randomIds()` in the editor), the media
  id of an upload, which exists only once the upload has finished. Redo
  applies the very same command, so it gives the very same page.
- **An unset value is an absent key**, never `undefined` or `null`:
  `REMOVE` in an update takes the key out. Taking out the last tablet or
  phone override takes out the override object too, which the schema
  refuses empty. A key put back goes where it was among its object's
  keys, so an undo gives back the page byte for byte; a new key goes where
  the schema lists it.
- **The column-width preset follows the columns**: it names one part per
  column, so a change in the number of columns (an insert, a delete, a
  move to another section, a new count) takes it out, and a column moved
  inside its section takes its part along (2:1 becomes 1:2).
- **A new column count keeps every widget**: the widgets of the columns
  that go are moved, in order, to the end of the last column that stays.
- **Focus, as data**, on the result of every command: after an insert, the
  new block; after a delete, the block now in its place, else the one
  before it, else its container; after a move or an edit, the block itself;
  for a list's items, the item. An undo is the inverse command, so it
  focuses the block it touched, or where that block was when the undo took
  it away.

## What is checked, and where

The reducer replays a command's steps and checks what they could break:
the nesting rule where each block landed; the application rules
(`../../../schema/tools/rules.ts`) on what came in, at the depth it sits;
ids nobody else on the page has; section anchors no other section has,
when a section came in or its props changed (a duplicate, and a paste
onto a page that uses the anchor, leave it off the copy); and the schema
on each container whose children changed and each block whose props or
style changed, validated alone with everything under it (`validateBlock`,
compiled from the schema's `$defs/block`). A block's validity is its own
and its subtree's, so a page
that was valid stays valid; the random sessions below check that claim by
validating the whole page after every command. Counts are the schema's
own: a fifth column is refused by its "at most 4", said as "Hero is full:
it holds at most 4 columns." The page itself is checked as a shell, its
sections and columns without their widgets. The whole page is validated
only when asked: on a drop, and when a page is read (`openDocument`).

A drag validates each container the first time the pointer is over it,
with the dragged block in it (and, for a move, the container it leaves),
and remembers the answer for the rest of the drag: the page does not
change while it is dragged.

What that costs, on the render contract's page of 500 blocks
(`../../../contract/fixtures/large-500.json`), from
`npx vitest run --config build/measure.config.ts` in `builder/`, on
2 October 2026, Windows 11, Node 24.19.0, an Intel Core i5-7200U (2 cores,
4 threads), **with the machine 100% busy with other work during the run**:
the numbers are the median and the best of 30 batches, and an idle machine
should give less. They are not yet numbers to quote.

| What | Median | Best |
| --- | --- | --- |
| One parent alone: a column of 5 widgets | 59.1 µs | 18.5 µs |
| One parent alone: a column of 19 widgets | 179.0 µs | 112.3 µs |
| One parent alone: a section of 4 columns, 16 widgets | 158.1 µs | 93.3 µs |
| The page as a shell: 25 sections, 60 columns | 328.6 µs | 187.7 µs |
| The whole page: application rules and schema | 13.55 ms | 7.46 ms |
| The whole page: the schema alone | 4.18 ms | 2.85 ms |
| An insert into a column of 4, applied and checked | 658.4 µs | 271.2 µs |
| The same insert with the whole page validated, as on a drop | 9.36 ms | 7.18 ms |
| A pointer move over a container already judged | 5.7 µs | 4.8 µs |

The plan had 9 to 37 µs for one parent and 1.1 ms for the whole page, from
prototypes on a machine as busy; these runs are slower on both, and are to
be taken again on an idle machine before any of them is quoted.

## The tests

- `commands.test.ts`: each command on a small page: what it changes, its
  label, its focus, what it refuses and in which words.
- `property.test.ts`: random valid pages and random editing sessions
  (`../../test/document-arbitraries.ts`), some of their commands refused on
  purpose. For every command the reducer accepts, the page passes the
  schema and the application rules; the inverse gives back the same page,
  byte for byte and with every removed key absent; redoing gives the same
  page with the same ids; the command survives JSON. A refusal changes
  nothing, and a command valid on any page must be accepted. The whole
  session, undone through the store, gives back the first page. Among the
  commands, texts handed over as TipTap writes them (`editorText`: every
  link attribute and a title, list starts of 0 and 250000, tabs, a run over
  10000 characters), onto pages whose stored texts take every form the
  schema allows: each must be taken, kept in the canonical form, and
  undone to the stored text exactly. The seed is
  fixed; a failure prints the seed and path that replay it:
  `DOC_PROPERTY_SEED=<seed> DOC_PROPERTY_PATH=<path> npm test -- src/document/property.test.ts`
  (`DOC_PROPERTY_RUNS` sets the number of sessions, 300 by default).
- `mutants.test.ts`: the same sessions against a copy of this folder and of
  `../store` with one fault planted in the copy's source; each must fail,
  and the unchanged copy must pass first. The faults: an inverse that
  writes `undefined` instead of taking a key out; a duplicate that draws its
  ids when applied; an emptied override object left behind; a reducer that
  does not validate the container a change touches; column widths that
  outlive a change in the number of columns; a key put back at the end of
  its object instead of where it was; a text command whose undo puts back
  the editor's reading of the stored text rather than the text itself; a
  text command that keeps a link's attributes as the editor wrote them.
- `replace.test.ts`: `makeReplacePage` on random pairs of valid pages,
  which share ids: applied, it gives the other page byte for byte, title
  and description with it; undone, the first; redone, the other again.
  With the description left out of its steps, it failed.
- `drag.test.ts`, `upgrade.test.ts`, `tree.test.ts`: the drag, the upgrade
  twin (held to the server's `upgrade.rb` and to `schema/corpus/upgrade/`),
  and the small pieces.

## Migrations

`upgrade.ts` is the twin of `../../../cms/app/models/block_document/upgrade.rb`:
the same loop, the same refusals in the same words, and `STEPS` empty,
because version 1 is the first shape. When the schema moves on, a step is
added to both; `upgrade.test.ts` reads the server's file and fails while
the two disagree on the current version or the number of steps.
