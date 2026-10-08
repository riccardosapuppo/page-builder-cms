# Every edit is a command with an exact inverse

Decided on 2 October 2026, with the editor's document model.
Written down on 8 October 2026.

## The question

The editor's page is a tree, and a person changes it by typing, dragging,
pasting and setting values, with undo and redo expected to work through
all of it. Three ways to get there: keep a copy of the whole page at every
step (simple, and memory grows with the page, which can have 500 blocks);
patch the page and compute the reverse patch afterwards (the reverse is
guessed from two states); or make each change a value that knows how to
undo itself.

## The decision

The page is plain data, and every change to it is a **command**
([builder/src/document/](../../builder/src/document/README.md)). A command
is made of steps (insert, remove or move a block; set or take out one key;
insert, remove or move an item of a list), and each step carries both
sides of its change, so its inverse is the same step read the other way.
One function applies a command to a page and returns the next page and
where the focus goes, or why it refuses. The store keeps the commands done
and undone; nothing else changes a page.

Typing in a text block is one command, made when the person pauses or
leaves the text and before any other command or drag; inside a text
Ctrl+Z belongs to the text editor, outside it to the page.

## What it costs

- **No free-form change.** Each new thing the editor does is a command with
  its inverse, its label for the History, the focus it leaves, and a place
  in the random sessions the tests draw. A widget with a list of items
  needs the name of an item and the order of an item's keys, so that an
  inverse puts a key back where it was.
- **The inverse must be exact, not nearly.** Undo gives the same page
  byte for byte, with every removed key absent and every key where it was;
  a key put back at the end of its object, or one set to `undefined`
  instead of taken out, is a failure.
- **Text typing is grouped.** One undo takes back a pause's worth of typing
  and not a character, and Ctrl+Z means two things depending on where the
  focus is.

## The proof

From `builder/`:

```
npx vitest run --project unit src/document/property.test.ts src/document/mutants.test.ts
```

`property.test.ts` draws random valid pages and random editing sessions
(300 by default, `DOC_PROPERTY_RUNS` sets the number; the seed is fixed,
and a failure prints the seed and path that replay it). For every command
the reducer accepts, the page still passes the schema and the application
rules, the inverse gives back the same page, redoing gives the same page
with the same ids, a refusal changes nothing, and a whole session undone
through the store gives back the first page. `mutants.test.ts` runs the
same sessions against a copy of the code with one fault planted, nine in
all (an inverse that writes `undefined`, a duplicate that draws its ids
when applied, a key put back at the end of its object, and so on), and
each must fail first. On 8 October 2026 the two files ran 11 tests, all
passed.
