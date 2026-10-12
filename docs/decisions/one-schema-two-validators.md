# The page document has one schema, and two validators are held to it

Decided on 1 October 2026, with the schema and the first Rails code.
Written down on 8 October 2026.

## The question

A page is a JSON document, and two programs in two languages must agree on
which documents are valid. The editor refuses a bad page before it is
sent; the server refuses the same page when it arrives from anything else.
If the two disagree, the editor can open nothing the server stored, or
the server can store what the editor then cannot open, and the person who
meets it loses work.

## The decision

One schema, `schema/block-document.schema.json` (JSON Schema, draft
2020-12). The editor validates with ajv, compiled ahead of time when the
editor is built; the server validates with json_schemer; both read the
same file.

What a schema cannot say (a block id used once on the page, a depth limit,
finite numbers, integers that JavaScript can hold exactly, strings that
are well formed, no repeated member name, a form's field names used once)
is written as **application rules**, once in TypeScript
(`schema/tools/rules.ts`) and once in Ruby
(`cms/lib/block_document/rules.rb`), and run before the schema on both
sides. [schema/README.md](../../schema/README.md) lists each rule and why
the schema cannot hold it.

A **corpus** holds the two to one verdict
([schema/corpus/](../../schema/corpus/)): documents both must accept,
documents both must refuse (each the base page with one change), and a
manifest naming, for every refused file, the JSON pointer and the keyword
where both engines must report it. A trap refused for the wrong reason
fails. `schema/tools/compare.ts` runs both engines over it and fails on a
disagreement, on an exception (never taken for a verdict), on a missing or
repeated result, and on a file the manifest does not list.

Since 12 October 2026 the site's header and footer are documents of the
same schema as a page, parts of the site
([header-and-footer-are-parts.md](header-and-footer-are-parts.md)): they
need no definition of their own, and their starters, the documents a
site draws until it publishes its own, go through the comparison beside
the example site's pages (`npm run compare:examples`). From 9 to 12
October they were four values, `$defs/site`, held to one verdict on a
corpus of their own; both went with them.

## What it costs

- **Every rule outside the schema is written twice**, and nothing but the
  corpus keeps the two copies in step. A new rule needs a file on each
  side of the line before it can be trusted, and a rule added to one
  language alone is found only if a corpus file shows it.
- **The patterns are narrow.** They use explicit ASCII classes and never
  `\d`, `\w`, `\s`, `.` or `\p{}`, because the two engines read those
  differently; `format` is not used at all, so a web address is a pattern,
  not a format. A control-character check sits beside every link pattern.
- **A change to the base page rewrites the corpus.** Each invalid file is
  the base page with one change, so a new widget in the base page changes
  the generator's output: the form widget's commit rewrote 225 corpus
  files ([Adding a widget](../../README.md#adding-a-widget)).
- **The Ruby side is the slow one.** Its 283 results took 15.0 s, ajv's
  1.1 s, in the run below.

## The proof

From `schema/tools/`, with the CMS's gems installed:

```
npm run compare
```

prints `RESULT: PASS (283 files, 0 disagreements, 0 exceptions)` (12
October 2026), and `npm run compare:examples`, for the example site's
pages and the header's and footer's starters, `RESULT: PASS (5 files, 0
disagreements, 0 exceptions)` (12 October 2026). `npm run corpus:check` fails if
a file on disk differs from what the generator writes, and `npm run
lint:plants` shows the schema's lint failing on each of its planted
faults. The schema README's "It can fail" lists the faults planted in the
comparison itself (a resolver that reads `$` as a line end, a result that
goes missing, a rule left out of the Ruby twin, one side's rules turned
off), each run and each exited 1.
