# schema/

The page document's one schema, and the design tokens it names.

- [`block-document.schema.json`](block-document.schema.json): JSON Schema
  draft 2020-12. The editor validates with ajv, the server with
  json_schemer, and both read this file.
- [`tokens.json`](tokens.json): the design tokens taken from the approved
  mock in `design/`. The style settings of a block are names from this file.
- [`icons.svg`](icons.svg): the eight icons an icon box may name, one
  symbol per name of the schema's `icon` enum. Sunrise, buoys and cup are
  the design's; calendar, clock, pin, globe and info are drawn in the same
  language (a 40-unit grid, round strokes, one shape in the accent). The
  server draws them inline on the published page, and the editor reuses
  the file.

## The document

```json
{
  "schemaVersion": 1,
  "title": "Winter series",
  "description": "Short, cold swims from November to March.",
  "sections": [
    {
      "id": "s1", "type": "section", "props": {}, "style": { "base": {} },
      "children": [
        {
          "id": "s1c1", "type": "column", "props": {}, "style": { "base": {} },
          "children": [
            {
              "id": "h1", "type": "heading", "children": [],
              "props": { "level": 1, "text": "Winter series" },
              "style": { "base": { "textSize": "display" }, "phone": { "textSize": "heading-1" } }
            }
          ]
        }
      ]
    }
  ]
}
```

- **Title and description live in the document**, so they change only when
  a version is published, together with the rest of the page. The address
  (slug) does not: it belongs to the page record and changes on publish.
- **The tree is strict.** A section holds one to four columns, and the
  number of columns *is* the number of children: there is no count to keep
  in step. A column holds widgets. A widget holds nothing (`children` is
  always `[]`).
- **Every block has the same five keys**, `{id, type, props, children,
  style}`, and no others.
- **Column widths** are a property of the section, `columnWidths`: a
  preset of parts in column order, `3:2`, `2:3`, `2:1` or `1:2` for two
  columns and `2:1:1`, `1:2:1` or `1:1:2` for three. It applies on desktop
  only; on tablets and phones the columns stack. Absent means equal, and
  `equal` is never written; one and four columns take no preset. The
  schema checks the preset against the number of columns, with one
  if/then branch per count, so adding or removing a column is also the
  moment the editor resets the widths.
- **Widgets:** heading, text (rich text), image, button, divider, spacer,
  gallery, video, map, icon box, quote, accordion.
- **Style is by token name.** `style.base` applies on every device;
  `style.tablet` and `style.phone` hold only what differs there. A key that
  is absent means "as in base"; nothing is ever `null`, and an empty
  override object is not stored, so removing the last override removes the
  object. Each block type accepts only the settings that mean something for
  it (a divider has no text size).
- **Images** come from the media library (`{mediaId, alt}`) or from another
  site (`{url, alt}`), never both. Alt text is required unless the image is
  marked `"decorative": true`, and then it has none.
- **Rich text** is the editor's own JSON, cut down to paragraphs, line
  breaks, bullet and numbered lists, and bold, italic and link marks. A
  run of text carries each mark at most once: two links on one run would
  be one `<a>` inside another, which HTML does not allow and a browser
  splits in two. The editor's marks each exclude themselves, so it never
  writes a repeat; the schema says it with `contains` and `minContains`
  under `not`, since `uniqueItems` would compare whole marks.
- **Video and map store data, not URLs:** a provider from a fixed list and
  a video id; or latitude, longitude and zoom. The renderers build the
  addresses, so no stored string is ever parsed as a URL on the way out.
- **Links** (`href` on buttons, headings and rich-text links) accept
  `https:` and `http:` with a host, `mailto:`, `tel:`, a site path
  (`/pricing`, never `//host`), a `?query` or a `#fragment`, in ASCII. An
  external image accepts only `https:` or a site path.

### Token names

| Setting | Values | From |
| --- | --- | --- |
| `spaceInside`, `spaceBetween`; spacer `size` | `none` `xs` `s` `m` `l` `xl` `xxl` (None to XXL in the editor) | `space.site` in `tokens.json` |
| `spaceAbove`, `spaceBelow` (sections only) | a spacing step, `none` to `xxl`, or `section-s` `section-l`; absent, the theme's rhythm for the device (96, 64 and 48 px on desktop, tablet and phone) | `space.site` and `space.site-section` |
| `aspect` (images only) | `original` `16:9` `3:2` `4:3` `5:4` `1:1`: the crop, width to height; `original` keeps the image's shape, and as a tablet or phone override undoes a crop | `aspect.site`, which gives each its CSS `aspect-ratio` |
| `textSize` | `display` `heading-1` `heading-2` `heading-3` `large` `body` `small` | `type.site` |
| `color` | `text` `background` `primary` `accent` `soft` `muted` | the six palette slots, `site-tones` in `tokens.json` (see below) |
| `background` | `none` or a palette slot | as above |
| `align` | `left` `center` `right` | |
| `verticalAlign` | `top` `middle` `bottom` | |
| `visibility` | `visible` `hidden` | |

A block names a palette **slot**, never a tone: the site owner chooses the
tone of each slot (Sea, Harbour, Kelp...), and every block that uses the
slot follows. `site-tones` in `tokens.json` lists the six slots of the
approved mock, each with the tones the site owner may choose from (curated,
never a free colour) and the tone a new site starts with; `site-type-scale`
lists the other choice of the site style, Gentle, Balanced or Strong, each
naming the sizes it draws under `type`. Balanced is the mock's scale
(`type.site`, each step about a third above the next in a wide window).
The mock names Gentle and Strong without drawing them; their sizes
(`type.site-gentle`, `type.site-strong`) follow the panel's hint, a step
of about a fifth (1.2) and about 1.414 in a wide window, and fall on
tablets and phones as Balanced's does (three quarters and three fifths of
the step's excess over 1), from the same body sizes, rounded to whole
pixels. Display is 45, 76 and 102 px in a wide window, 28, 40 and 48 on a
phone. The server reads the same two lists to accept or refuse a site
style, so there is one list of slots and tones, not one per program.

## What the schema cannot say, and where it is said

A JSON Schema checks one value at a time against a shape. Some rules are
about the whole document, and some are about how two programs read the
same bytes. Those live in code, in the **application rules**, which run
before the schema, identically in the editor and on the server.

| Rule | Why the schema cannot hold it | Where it lives |
| --- | --- | --- |
| Block ids are unique across the page | `uniqueItems` compares whole items in one array, not a field across a tree | application rules: `uniqueId` |
| Maximum depth | A recursive schema has no depth limit. The strict hierarchy already fixes blocks at three levels, but rich text nests lists, and a hostile document can nest anything inside `props` before the schema rejects it. Ruby's parser stops at 100 levels, JavaScript's does not | application rules: `maxNesting`, 64 levels of JSON |
| Numbers are finite | `1e400` reads as Infinity in both languages; json_schemer then raises `FloatDomainError` instead of answering | application rules: `finite` |
| Integers are exact | `12345678901234567890` is exact in Ruby and rounded in JavaScript, so the two sides would validate different numbers | application rules: `safeInteger`, at most 2^53 - 1 |
| Strings are well formed | A lone surrogate (`"\ud83d"`) parses in JavaScript and is rejected by Ruby's parser; invalid UTF-8 bytes parse in Ruby and make json_schemer raise | application rules: `wellFormed`, `encoding` |
| No duplicate keys | Both parsers see a different document: JavaScript keeps the last value silently, Ruby's json 3 rejects the text | application rules: `duplicateKey` |
| The text is strict JSON | A byte-order mark, comments, trailing commas, raw control characters: the schema only sees what a parser made of the text | application rules: `parse` |
| `2.0` is the integer `2` | Both engines accept `2.0` where an integer is required, as the specification says, but Ruby keeps it a Float: the page would render `<h2.0>` | application rules: normalisation, after the checks |
| The media item exists | The schema does not know the library | the server, when it saves (stage 1) |
| Section anchors are unique on the page | Same reason as block ids | not enforced yet: two equal anchors make the second unreachable by link |
| The video id exists at the provider | Only the provider knows | not checked: the player shows the provider's own error |
| Older documents | Each `schemaVersion` has its own shape | upgrade functions, run when a document is read (none exist for version 1) |
| Text length as people count it | `maxLength` counts code points in both engines: an emoji is 1, an accented letter written as letter plus accent is 2 | the editor counts code points too, never UTF-16 units or graphemes |
| Document size | | a byte limit on the server, set once json_schemer's speed on 500 blocks is measured on the production machine |

## Writing patterns both engines read the same way

ajv runs patterns as ECMA-262 with the `u` flag. json_schemer, set to its
`ecma` resolver, translates them to Ruby: `^` and `$` become `\A` and `\z`,
and `\s` and `\S` become classes of its own, which leave out U+2028. Its
default `ruby` resolver would keep `^` and `$` as line anchors, so
`"javascript:alert(1)\nhttps://ok.example"` would match `^https://`.

So every pattern here:

- uses explicit ASCII classes (`[0-9]`, `[A-Za-z0-9_-]`) and `\uXXXX`
  escapes, never `\d`, `\w`, `\s`, `\S`, `.` or `\p{...}`;
- writes a negated class out in full: "has a visible character" is a
  `[^...]` that lists every blank character, not `\S`;
- never uses the empty classes `[]` and `[^]`, a group other than `(?:...)`
  (so no inline modifier like `(?i:)`), `\-` outside a class, a `{` that is
  not a quantifier, or `[` or `&&` inside a class;
- is anchored with `^...$` where it describes a whole value;
- has, on every link and on every plain-text field, an unanchored second
  check under `not` that finds a control character anywhere. It keeps the
  field closed even with json_schemer's Ruby resolver.

`format` is not used: both engines accept `javascript:alert(1)` as a valid
`uri`, and they disagree on others. The patterns are the contract.

`npm run lint` (below) holds every pattern to this list.

## The corpus

[`corpus/`](corpus) is what both validators are held to.

- `valid/`: documents both must accept. The base page with every widget
  and overrides on every device, the smallest page, a page of exactly 500
  blocks, rich text nested to the depth limit, every token, every link
  form, every icon and video provider, non-ASCII text, escapes, integral
  floats.
- `invalid/`: documents both must refuse. Each is the base page with **one**
  change.
- `upgrade/`: documents of an older `schemaVersion`. Empty, because version
  1 is the first; [its README](corpus/upgrade/README.md) says what it will
  hold.
- `manifest.json`: for every file, the rule it shows; for every invalid
  file, also the JSON pointer and the keyword where **both** engines must
  report it, and whether the application rules or the schema refuse it. A
  trap refused for the wrong reason fails the comparison.

[`tools/gen-corpus.ts`](tools/gen-corpus.ts) writes all of it, and
`npm run corpus:check` fails if a file on disk differs from what it would
write.

There are traps for every widget, and these, which tell engines apart:

- a newline before or after an anchored value (a block id, a video id), and
  a newline or a tab inside a link;
- digits of other scripts (Arabic-Indic, fullwidth) in ids and in `tel:`;
- 200 emoji against a `maxLength` of 200, and letters written as letter
  plus combining accent;
- `2.0`, `1.2e1`, `3.000`, `-0.0` and `1e-400` where an integer is
  expected, and `5.0` above a maximum of 4;
- `1e400`, `-1e400`, `1e300` and a 20-digit integer;
- lone surrogates in a value and in a member name, invalid UTF-8 bytes, a
  byte-order mark;
- duplicate member names, one of them spelled with an escape;
- 64 levels of nesting (valid), 65 and 200 (invalid);
- blank text made of no-break spaces, a line separator, zero-width spaces
  or an ideographic space.

## Two validators, one verdict

[`tools/`](tools) is a small Node package: TypeScript run directly by
Node 24, ajv pinned to 8.20.0. The Ruby side runs through the app's own
bundle, so it uses json_schemer 2.5.0 and the json 3.0.2 parser that
`cms/Gemfile.lock` pins.

```
cd schema/tools
npm ci
npm run compare
npm run typecheck
```

The gems of `cms/` must be installed first ([cms/README.md](../cms/README.md)),
and `ruby` must be on the PATH.

- [`validate.ts`](tools/validate.ts), the editor's side: `rules.ts`, then
  ajv as `new Ajv2020({strict: true, strictTuples: false, allErrors: true,
  validateFormats: false, unicodeRegExp: true})`. The options are one
  object, in [`ajv-options.ts`](tools/ajv-options.ts), which the editor's
  build imports too when it compiles the schema ahead of time
  (`builder/build/validator.ts`); the editor imports `rules.ts` itself.
- [`validate.rb`](tools/validate.rb), the server's side: the twin rules in
  [`cms/lib/block_document/rules.rb`](../cms/lib/block_document/rules.rb),
  then `JSONSchemer.schema(schema, regexp_resolver: "ecma", format: false)`.
- [`compare.ts`](tools/compare.ts) runs both and fails on:
  - a verdict the two engines disagree on;
  - an exception on either side: an exception is never a verdict;
  - a missing, repeated or unknown result, or a runner that exits non-zero;
  - fewer corpus files than the manifest lists, a file it does not list,
    or fewer than 60 files in all;
  - a verdict against the folder (`valid/` must pass, `invalid/` must fail);
  - an invalid file where either engine does not report the manifest's
    pointer and keyword;
  - a document the two languages normalise differently (`2.0` must be the
    integer `2` on both sides);
  - a file in `upgrade/` while there is no upgrade step to run on it.

It also compares **where** the errors are, as sets of `{pointer, keyword}`,
after three normalisations: ajv reports an unknown property at the object
and json_schemer at the property, so the property is appended to ajv's
pointer; ajv adds an `if` error at every block whose branch failed, which
is dropped; and ajv reports `required` once per missing key where
json_schemer reports the object once, so the errors are compared as sets.

The run of 2 October 2026 (Windows 10, Node 24.19.0, Ruby 3.4.11):

```
corpus:  ../corpus: 211 files (23 valid, 188 invalid, 0 upgrade); the manifest lists 211
ajv:          ajv 8.20.0, JSON.parse, node v24.19.0; 211 results in 0.7 s
json_schemer: json_schemer 2.5.0, json 3.0.2, ruby 3.4.11, bundle cms/Gemfile, regexp resolver ecma; 211 results in 7.5 s
rules:   on; Ruby normalisation: on
verdicts compared: 211; disagreements: 0; against the folder: 0; exceptions: 0
expected {pointer, keyword} reported: ajv 188/188, json_schemer 188/188
identical {pointer, keyword} sets: 188/188 invalid files (refused by the rules: 26/26; by the schema: 162/162)
errors on the invalid files: ajv 648, json_schemer 210; normalised: 437 ajv "if" errors dropped, 20 ajv additionalProperties pointers extended, repeated {pointer, keyword} merged: ajv 11, json_schemer 10
normalised documents with the same numbers and values: 185/185
RESULT: PASS (211 files, 0 disagreements, 0 exceptions)
```

### It can fail

Each of these was run, and each exited 1. The flags exist only for this;
they change nothing on disk, and the shortened corpus is a temporary copy.
They were run on the corpus as it stood earlier that day, 194 files,
before the column widths, image crops and section spacing added 13.

| Run | What it plants | What the comparator reported |
| --- | --- | --- |
| `node compare.ts --regexp ruby` | json_schemer's default resolver, where `^` and `$` match at line breaks | `verdicts differ` on `block-id-leading-newline`, `block-id-trailing-newline` and `video-youtube-id-trailing-newline` (json_schemer valid). The four links with a newline stayed refused by both, through the unanchored control-character check |
| `node compare.ts --drop-ruby invalid/image-url-data.json` | a result that goes missing | `json_schemer: no result for invalid/image-url-data.json` |
| `node compare.ts --min-files 195` | fewer files than required (194 is the corpus, and `--min-files 194` passes) | `only 194 files in the corpus (at least 195 required)` |
| `node compare.ts --corpus <copy without image-url-data.json>` | a corpus file that disappears | `the manifest lists invalid/image-url-data.json, which is not in the corpus` and `193 files in the corpus, fewer than the 194 the manifest lists` |
| `node compare.ts --rules off` | no application rules on either side | 42 failures, among them five exceptions on the Ruby side (`FloatDomainError: Infinity` on `1e400`, `ArgumentError: invalid byte sequence in UTF-8` on the three invalid-UTF-8 files, `JSON::GeneratorError` on `-1e400`); duplicate keys, lone surrogates and the byte-order mark judged differently; duplicate block ids and 65 levels of nesting accepted by both; the 20-digit integer read as two different numbers |
| `node compare.ts --ruby-normalize off` | `2.0` left a Float in Ruby | `the normalised documents differ on valid/integral-floats.json` and on `invalid/heading-level-5-written-5.0.json` |
| `node compare.ts --schema <the schema before the marks rule>` (2 October 2026, on 211 files) | a mark type a run of text may carry twice | six failures: each engine `calls invalid/text-bold-twice.json valid, against its folder`, and the same for `text-break-italic-twice` and `text-link-twice` |

## The lint of the schema

`npm run lint` checks the schema itself, before any document:

- **Patterns.** Each one is in the portable subset above, compiles in both
  engines (`new RegExp(pattern, "u")` for ajv, json_schemer's own ECMA
  translation for Ruby, in [`lint.rb`](tools/lint.rb)), and both engines
  answer the same on the probe strings: every ASCII character and 28
  characters engines are known to read differently (Unicode spaces and line
  breaks, digits of other scripts, letters that fold to ASCII, a combining
  mark, a byte-order mark, an emoji), alone, next to a letter, and at the
  start, middle and end of up to six values from the valid corpus that the
  pattern accepts.
- **Keywords** the schema must not use: `oneOf` (exponential in depth in
  both engines), `discriminator` (ajv only), `unevaluatedProperties` and
  `unevaluatedItems` (the engines disagree after a passing `if`), `format`,
  `uniqueItems` (Ruby tells `1` from `1.0`) and a fractional `multipleOf`.
- **Dispatch.** Wherever if/then branches dispatch on a property's const,
  every value of that property's enum has exactly one branch, every branch
  is for a value of the enum, and every `if` requires the property, so a
  block without a type runs no branch. That covers the 14 block types, the
  video providers, the rich-text nodes and the marks.
- **Marks:** every mark type of the enum has exactly one entry in the rule
  that a run of text carries it at most once, so a mark type added later
  cannot be repeated for want of one.
- **Hierarchy,** read from the schema: the page holds sections, a section one
  to four columns, a column the widget types, and no widget holds children.
- **Column widths:** every count of columns from one to four has exactly
  one branch of the section saying which presets it takes, every preset
  has one part per column of its branch, and the branches offer the whole
  of `columnWidthsToken` between them.
- **Tokens:** the spacing, type-step and crop enums are the names in
  `tokens.json`, the section-spacing enum is the spacing steps followed by
  the section steps, and every crop's value is the ratio its name says
  (`16:9` is `16 / 9`); the palette-slot enum is the slots of `site-tones`, and
  the background enum is `none` and those slots. Every tone is a colour of
  `tokens.json`, every slot's default is one of its tones, and the type
  scale's default is one of its choices. Every type-scale choice draws a
  scale of its own under `type`, with a size and line height for every
  step on every device, each size smaller than the one above it, and no
  two choices give a heading step the same size on the same device: with
  Gentle pointed back at Balanced's sizes, as the choice stood before it
  had any, the lint failed twelve times.
- **The schema** is valid draft 2020-12 to both engines, and the example at
  the top of this README is the corpus file `valid/readme-example.json`.

The run of 2 October 2026:

```
pattern style: 11/11 patterns in the portable subset
pattern compile: 11/11 patterns compile in both engines (json_schemer 2.5.0, ruby 3.4.11)
pattern probes: 23245 probes over 11 patterns, 9133 matched by both, 0 patterns with a disagreement
keywords: 385 subschemas, 0 forbidden keyword(s) (oneOf, discriminator, unevaluatedProperties, unevaluatedItems, format, uniqueItems, fractional multipleOf)
dispatch: #/$defs/block on type: 14 values, 14 branches; #/$defs/videoBlock/properties/props on provider: 2 values, 2 branches; #/$defs/pmBlockNode on type: 3 values, 3 branches; #/$defs/pmInlineNode on type: 2 values, 2 branches; #/$defs/pmMark on type: 3 values, 3 branches
marks: 3 mark types, 3 of them at most once on a node
hierarchy: page > section (1-4 columns) > column > 12 widget types, 12 of them with no children
column widths: 1 column: no preset(s), 2 columns: 4 preset(s), 3 columns: 3 preset(s), 4 columns: no preset(s); 7/7 presets offered
tokens: spaceToken = 7 names, sectionSpaceToken = 9 names, typeStep = 7 names, aspectToken = 6 names, paletteSlot = 6 names, backgroundToken = 7 names from tokens.json; 12 tones over 6 slots, 3 type-scale choices, 3 of them drawn
schema: compiled by ajv, 0 meta-schema error(s) from json_schemer; README example compared with the corpus
RESULT: PASS
```

`npm run lint:plants` shows it can fail: it runs the lint on the schema as
it is (it must pass), then on 19 copies with one fault planted in each, in
a temporary folder it removes afterwards. Each must fail for the reason
planted: `\s`, a dot and a lone `{` in a pattern; with the subset check
off, an inline modifier json_schemer refuses, a `\-` ajv refuses, and `\S`
and a dot, which both compile but answer differently (`\S` on U+2028, the
dot on a carriage return and the two Unicode line breaks); a `oneOf`; a
widget type with no branch and one with two; an `if` without `required`;
the link mark left out of the at-most-once rule; a section of five
columns; a two-part column preset offered to three columns, and a column
count left without a branch; a spacing step, a
section space, an image crop and a palette slot `tokens.json` lacks; and
a README example that no longer matches the corpus. The last run, on
2 October 2026: `planted 19, caught 19`.

The checks on `tokens.json` itself were shown failing by hand once, on
1 October 2026: with Kelp replaced by a `site-teal` tone that `color` does
not define, and Soft's default set to `site-sea`, `node lint.ts` exited 1
with `site-tones/primary names the tone "site-teal", which is not a colour
of tokens.json` and `site-tones/soft has a default that is not one of its
tones`. The file was then put back. The same day, by hand again: with
16:9 written `16 / 10` it exited 1 with `aspect.site/16:9 is "16 / 10",
not "16 / 9"`, and with Gentle pointed at Balanced's sizes it failed
twelve times, beginning `balanced and gentle give display the same size
on desktop (76)`.

The application rules (`rules.ts`, `rules.rb`) were not touched by the
column widths, crops and section spacing: they check the whole document
(ids, depth, numbers, strings, keys), never a style key.

## Versions

ajv 8.20.0 (`tools/package-lock.json`); json_schemer 2.5.0 and json 3.0.2
(`cms/Gemfile.lock`); Node 24 and Ruby 3.4.10 for the runs above. A change
to any of them, to the schema or to either set of rules is a change that
must pass the comparator.
