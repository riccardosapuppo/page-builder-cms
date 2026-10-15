// The files outside builder/ the editor's build reads. They stay where the
// rest of the repository keeps them, and the build points at them, so
// there is one copy of each: the schema, the published page's
// stylesheets, the fonts.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const builderRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(builderRoot, "..");

export const schemaDir = join(repoRoot, "schema");
export const schemaFile = join(schemaDir, "block-document.schema.json");
// A collection's definition and the values of its entries' fields.
export const collectionSchemaFile = join(schemaDir, "collection.schema.json");
export const tokensFile = join(schemaDir, "tokens.json");
// The application rules, the TypeScript twin of cms/lib/block_document/rules.rb.
export const rulesFile = join(schemaDir, "tools", "rules.ts");
export const ajvOptionsFile = join(schemaDir, "tools", "ajv-options.ts");

// The published page's stylesheets: the theme, and the token classes
// `ruby bin/rails tokens:css` writes from schema/tokens.json.
export const cmsStylesheets = join(repoRoot, "cms", "app", "assets", "stylesheets");
// Archivo and Source Serif 4, the published page's fonts, with their licences.
export const cmsFonts = join(repoRoot, "cms", "app", "assets", "fonts");
// Instrument Sans, the editor's own font, with its licence: the approved
// design is the only place in the repository that has it.
export const designFonts = join(repoRoot, "design", "fonts");
// The example site, the pages and pictures the CMS's seed puts in, which
// the browser demo puts in the browser's storage on a first visit.
export const exampleSite = join(repoRoot, "example-site");
