# A page is drawn twice, by the server and by the editor, and both are held to the same output

Decided on 1 October 2026, with the first widgets and the render contract.
Written down on 8 October 2026.

## The question

What the canvas shows must be what a visitor reads. Two things pull the
drawing apart. A published page is written by Rails, once per change, kept
in a cache, and carries no script: ERB partials, in
[cms/app/views/blocks/](../../cms/app/views/blocks/). The canvas is drawn
in the browser on every keystroke, with the selection and the drag marks
around the page: React. One renderer cannot be both.

## The decision

Two renderers, and one contract between them
([contract/](../../contract/README.md)):

- **Fixtures**: page documents, among them hostile ones (markup, entities
  and `javascript:` links in every place a link can be, right-to-left text,
  blocks out of place) and a page of exactly 500 blocks.
- **Goldens**: the HTML the server renders for each fixture, written by
  Rails (`UPDATE_GOLDEN=1`) with a manifest of the sha256 of every fixture,
  every golden and every source file of the server's renderer. A renderer
  source that changes without the goldens written again fails the manifest.
- **The editor's half** renders the same fixtures with React and compares
  them to the goldens, both parsed by a parser that is neither side's, with
  three normalisations only: the line break the server writes after a
  block, the order of attributes, and a boolean attribute by its presence.
  Every element, class list and character of text is compared as it is. It
  also draws random valid pages and compares them to the preview the CMS
  serves for the same documents, and the example site's three pages to
  their preview and published pages.
- **The rules both follow** are written once, in the contract's README:
  every block's root carries `data-block-id` and `data-block-type`, an
  address a policy refuses is dropped and the text around it kept, no
  visible text names a provider.

## What it costs

- **Every widget is written twice**, an ERB partial and a React renderer,
  and every helper they share is written twice and tested against the
  other: a map's coordinates are written with six decimals the way Ruby's
  `format("%.6f")` writes them, quirk included, because rounding correctly
  on one side would give the canvas and the page two addresses for one
  map. The contract says: change both sides or neither.
- **A golden that changes is a page that changes.** Writing the goldens
  again is easy and reading the diff is the work. A new widget costs its
  fixture, its goldens and a manifest written again
  ([Adding a widget](../../README.md#adding-a-widget)).
- **The canvas is not the CMS's HTML.** The editor shows React's drawing of
  the same markup. The cache and the headers belong to the server alone,
  and are checked there
  ([published-pages-cached-by-key.md](published-pages-cached-by-key.md)).
  The browser demo draws its published page the same way, with React.

## The proof

From `cms/`:

```
ruby bin/rails test test/contract/goldens_test.rb
```

renders every fixture and fails on any byte that differs from its golden,
naming the line and the column. From `builder/`:

```
npm run test:contract
```

is the editor's half. With one heading partial planted to mark its text as
safe instead of escaping it, the server's run failed on the two fixtures
that carry `<script>` in a heading and on the stale manifest. On
8 October 2026 the server's test ran 11 tests with 26 assertions and no
failure, and the editor's 25 tests passed.
