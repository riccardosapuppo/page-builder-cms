# example-site/

Slack Water, an invented swimming club: the example site of the approved
design, as page documents and pictures. It is the one copy, read as it is
by the CMS's seed (`ruby bin/rails db:seed`,
[cms/db/seeds/example_site.rb](../cms/db/seeds/example_site.rb)) and meant
to be read the same way by the editor's browser demo, so that both show the
same three pages.

- [`site.json`](site.json): the site's name, its images and its pages, in
  order.
  - Each image has an `id` (the form of the schema's `mediaId`), its `file`
    under `images/`, and the `alt` text the media library keeps for it.
  - Each page has its `slug`, its `file` under `pages/`, and whether it is
    the `home` page (exactly one is).
- [`pages/`](pages/): one page document each, valid against
  [the schema](../schema/block-document.schema.json). An image is named by
  its `id` in `site.json`, never by a library's id: whoever loads the site
  uploads the image first and puts the id the library gave it in its place.
  - `home.json`, at `/`: the home page as `design/index.html#page` draws it,
    its Join band holding the design's form.
  - `winter-series.json`: a content page.
  - `notices.json`: a page that breaks assumptions on purpose: four
    columns, a word too long for any line, emoji, right-to-left text, nested
    lists, a long alt text, a dark band, a heading hidden on phones.
- [`images/`](images/): the nine pictures, PNG. Nobody photographed them:
  `node tools/seed-images.ts` (from the repository root) draws each from
  the design's SVG of the same name (`design/img/`) in headless Chromium,
  and `--check` draws them again and compares the bytes.

The video and the map keep the card that loads the third party only when a
visitor clicks it: their documents hold a provider's id and coordinates,
never an address.

Nothing here names a real person, company or brand. The video's id is
invented, and the map's point is an arbitrary stretch of coast.

## What holds these files

- [cms/test/integration/seed_test.rb](../cms/test/integration/seed_test.rb):
  the seed on an empty database, then again on its own result, which
  changes nothing; each page stored exactly as its file, with the
  library's ids; a page changed since left as it is; and a file the seed
  cannot read (an image `site.json` does not list, two home pages, a path
  out of the folder) refused before anything is uploaded or saved.
- `npm run compare:examples` in [schema/tools/](../schema/tools/): both
  validators, the editor's and the server's, call every page valid and
  normalise it the same way, through the corpus's own comparison
  ([schema/README.md](../schema/README.md)). CI runs it in the schema job.
