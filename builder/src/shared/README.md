# src/shared/

What the editor takes from the rest of the repository, in one place every
other folder imports from. Nothing here is the editor's own design: each
file follows a file outside `builder/`, and changes with it.

| File | What it is | Follows |
| --- | --- | --- |
| `document.ts` | The page document as TypeScript types, and the token lists (`SPACE_TOKENS`, `STYLE_KEYS_BY_TYPE`, ...) | `schema/block-document.schema.json`; `document.test.ts` fails when they differ |
| `validate.ts` | `validateDocument(value)` and `parseAndValidate(text or bytes)`: the application rules, then the schema, with the server's pointers. For the editor's own checks (`../document/check.ts`): `validateBlockSchema` (one block alone, against `$defs/block`), `validateDocumentSchema` (the schema without the rules) and `validateHeldDocument` (both, without normalising a page held in memory); and, passed on from the rules for those checks, `checkTree`, `MAX_NESTING`, `normalise` and `scanJson`. For the browser's storage: `isLine(text, max)`, the schema's single line of text (`$defs/line`), which the CMS holds a version's name and an image's alt text to, and `escapePointer` | `schema/tools/rules.ts`, imported as it is, and the schema, compiled when the editor is built (`build/validator.ts`) |
| `collection.ts` | A collection and an entry as TypeScript types (`CollectionDefinition`, `Field`, `EntryContent`, each type of field's value), with the types of field, the orders and the keys a field never takes, the first of them from the collection rules themselves; `collection.test.ts` holds them to the schema, and `validate.ts`'s `validateCollection` and `validateEntry` (the collection rules, `schema/tools/collection-rules.ts` imported as it is, with the schema's validators compiled when the editor is built) to the collection corpus | `schema/collection.schema.json` |
| `validator-module.d.ts` | The types of the two modules the build makes from the schemas: the compiled validators (`virtual:block-document-validator`, the page schema's and the collection schema's) and the nesting rule (`virtual:block-document-nesting`, `build/nesting.ts`) | |
| `site.css` | The published page's stylesheets, for the canvas | `cms/app/assets/stylesheets/site.css` and `tokens.css`, imported as they are |
| `preview-widths.ts` | `PREVIEW_WIDTHS`, the page root's width on the canvas for the tablet and phone previews (768 and 390) | `schema/tokens.json`, `breakpoints["device-preview"]`, imported as it is |
| `free-type.ts` | Free type, a heading's, a text's or a quote's own size, weight, letter spacing, line height and letter width: what counts as a value of each (`freeTypeText`, `fontSizeOf`), the weights and widths each face draws (`FACE_AXES`), and a number as a person types it | `schema/tools/rules.ts` (its tables, `sizeRange` and `decimals`, imported as it is) and the schema; `free-type.fonts.test.ts` reads the faces' axes from `cms/app/assets/fonts` |
| `site-tokens.ts` | `LAYOUT_BREAKPOINTS`, the widths where the published page changes layout (560 and 800), which the bottom line's width names; each palette slot's name and tone, for the Style panel's swatches; the site style's choices and the style a new site starts with (`siteStyleChoices`, `defaultSiteStyle`), read as the CMS reads them, for the browser's storage | `schema/tokens.json`, `breakpoints.container` and `site-tones`, imported as it is |
| `editor-font.css` | Instrument Sans, the editor's typeface | `design/fonts/` |

Import from here; never copy a type, a token list or a rule into a feature
folder. When the schema changes, `document.ts` changes in the same commit,
and the test says where.
