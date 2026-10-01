# schema/

The page document's one schema, and the design tokens it names.

- [`block-document.schema.json`](block-document.schema.json): JSON Schema
  draft 2020-12. The editor validates with ajv, the server with
  json_schemer, and both read this file.
- [`tokens.json`](tokens.json): the design tokens taken from the approved
  mock in `design/`. The style settings of a block are names from this file.

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
| `sectionSpace` | `section-s` `section-l` | `space.site-section` |
| `textSize` | `display` `heading-1` `heading-2` `heading-3` `large` `body` `small` | `type.site` |
| `color` | `text` `background` `primary` `accent` `soft` `muted` | the six palette slots of the site style (see below) |
| `background` | `none` or a palette slot | as above |
| `align` | `left` `center` `right` | |
| `verticalAlign` | `top` `middle` `bottom` | |
| `visibility` | `visible` `hidden` | |

A block names a palette **slot**, never a tone: the site owner chooses the
tone of each slot (Sea, Harbour, Kelp...), and every block that uses the
slot follows. `tokens.json` lists the tones of the default site as
`site-*` colours but has no list of slot names; the slots are the six of
the approved mock (Text, Background, Primary, Accent, Soft, Muted, in
`design/NOTES.md` and as `--sw-*` variables in `design/theme.css`).

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
- never uses the empty negated class `[^]`, inline modifiers like `(?i:)`,
  `\-` outside a class, or a literal `{`;
- is anchored with `^...$` where it describes a whole value;
- has, on every link and on every plain-text field, an unanchored second
  check under `not` that finds a control character anywhere. It keeps the
  field closed even with json_schemer's Ruby resolver.

`format` is not used: both engines accept `javascript:alert(1)` as a valid
`uri`, and they disagree on others. The patterns are the contract.
