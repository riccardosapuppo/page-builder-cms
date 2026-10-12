# A page is sections of one to four columns holding widgets, and nothing else

Decided on 1 October 2026, with the schema.
Written down on 8 October 2026.

## The question

A page builder is a layout tool, and the freest layout is a tree of boxes
in boxes. Each level of freedom is paid for three times: by the schema,
which must describe every shape; by the drag and drop, which needs a rule
for every pair of container and thing dragged; and by the renderer, which
must make every shape adapt to a tablet and a phone.

## The decision

Three levels, fixed: a **section** holds one to four **columns**; a
**column** holds **widgets**; a widget holds nothing (`children` is always
`[]`). The schema says so, and the editor reads the same rule when it is
built (`builder/build/nesting.ts`), so the schema is the only place the
hierarchy is written.

- **The number of columns is the number of children.** A section has no
  `columns` property to keep in step with its children.
- **Widths are presets of the section** (`3:2`, `2:3`, `2:1`, `1:2` for two
  columns, `2:1:1`, `1:2:1`, `1:1:2` for three) and apply on desktop only;
  on a tablet and a phone the columns stack. The schema checks the preset
  against the number of columns, and adding or removing a column is also
  the moment the editor resets the widths.
- **Dragging follows the schema.** A block can only land where the schema
  would accept it, and the picker behind each "+" on the page lists only
  what fits there.

## What it costs

- **Some layouts cannot be made.** No widget directly in a section, no
  column in a column, no section in a column, more than four columns, or a
  free width. A person who wants one of those is told so by an editor that
  never offers it.
- **Every page is three levels deep**, even a page of one sentence: a
  section, a column, a text.
- **The hierarchy is a promise to the renderers.** Both can rely on it and
  neither handles a block out of place, except to leave it out.

## The proof

The corpus holds the shapes the hierarchy refuses, each the base page with
one change, and both validators refuse each for the manifest's reason:
`tree-column-in-column`, `tree-section-in-column`, `tree-widget-in-section`,
`tree-section-five-columns`, `tree-section-no-columns` and
`tree-section-widths-one-column`, among others
([schema/corpus/invalid/](../../schema/corpus/invalid/)). From
`schema/tools/`:

```
npm run compare
```

prints `RESULT: PASS (283 files, 0 disagreements, 0 exceptions)` (12
October 2026). In the editor, `npx vitest run --project unit
src/document/drag.test.ts` (from `builder/`) holds the drag to the same
rule: on 8 October 2026 its 14 tests passed.
