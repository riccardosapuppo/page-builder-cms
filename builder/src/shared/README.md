# src/shared/

What the editor takes from the rest of the repository, in one place every
other folder imports from. Nothing here is the editor's own design: each
file follows a file outside `builder/`, and changes with it.

| File | What it is | Follows |
| --- | --- | --- |
| `document.ts` | The page document as TypeScript types, and the token lists (`SPACE_TOKENS`, `STYLE_KEYS_BY_TYPE`, ...) | `schema/block-document.schema.json`; `document.test.ts` fails when they differ |
| `validate.ts` | `validateDocument(value)` and `parseAndValidate(text or bytes)`: the application rules, then the schema, with the server's pointers. For the editor's own checks (`../document/check.ts`): `validateBlockSchema` (one block alone, against `$defs/block`), `validateDocumentSchema` (the schema without the rules) and `validateHeldDocument` (both, without normalising a page held in memory) | `schema/tools/rules.ts`, imported as it is, and the schema, compiled when the editor is built (`build/validator.ts`) |
| `validator-module.d.ts` | The types of the two modules the build makes from the schema: the compiled validators (`virtual:block-document-validator`) and the nesting rule (`virtual:block-document-nesting`, `build/nesting.ts`) | |
| `site.css` | The published page's stylesheets, for the canvas | `cms/app/assets/stylesheets/site.css` and `tokens.css`, imported as they are |
| `preview-widths.ts` | `PREVIEW_WIDTHS`, the page root's width on the canvas for the tablet and phone previews (768 and 390) | `schema/tokens.json`, `breakpoints["device-preview"]`, imported as it is |
| `editor-font.css` | Instrument Sans, the editor's typeface | `design/fonts/` |

Import from here; never copy a type, a token list or a rule into a feature
folder. When the schema changes, `document.ts` changes in the same commit,
and the test says where.
