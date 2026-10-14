// The site's own files, read from cms/ when the editor is built
// (./site-file.ts) and served as `virtual:site-theme`: the header's and
// footer's starters, the documents a site draws until it publishes its own
// parts, and the site's time zone. The browser's storage adapter, which
// has no CMS to ask, starts its parts from this module, so the canvas draws
// the same header and footer in both modes.
//
// The CMS checks the starters as it starts (config/initializers/
// site_parts.rb) against the rules a part's draft is held to, and a file
// that breaks them stops it, naming each value: a starter the editor could
// not save back would be drawn on every page and refused when sent back
// unchanged. The build makes the same check, with the editor's engine (the
// application rules of schema/tools/rules.ts, then the page schema by ajv,
// with the options the editor's validator is compiled with, then the
// part's own rule: no form), and stops the same way.
import type { Plugin } from "vite";
import Ajv2020Module from "ajv/dist/2020.js";
import { AJV_OPTIONS } from "../../schema/tools/ajv-options.ts";
import { checkTree, escapePointer } from "../../schema/tools/rules.ts";
import { PART_KINDS, partFile, readSiteTheme, siteFile } from "./site-file.ts";
import { readSchema } from "./validator.ts";

// ajv is CommonJS: the constructor is module.exports.default.
const Ajv2020 = Ajv2020Module.default;

export const SITE_THEME_MODULE = "virtual:site-theme";
const RESOLVED = `\0${SITE_THEME_MODULE}`;

// The words of the part's own rules, the server's (SiteParts::FORM,
// SiteParts::ANCHOR).
const PART_FORM = "A header or footer holds no form: a form's answers belong to the page it is on.";
const PART_ANCHOR = "A header or footer block takes no anchor: it would be on every page, where the page's own blocks have theirs.";

// Each rule a starter breaks, as the CMS names it when it refuses to start
// ("/sections/0/children/1/children/0 (part): ..."): the application rules
// first and, when they pass, the schema, then the part's rules (its forms,
// then its anchors), the order SiteParts.check follows. None when the starter is a part's draft the
// editor could save back.
export function starterProblems(document: unknown, schema: object = readSchema()): string[] {
  const rules = checkTree(document);
  const errors = rules.length > 0 ? rules : schemaErrors(document, schema);
  const found = errors.length > 0 ? errors : [
    ...forms(document).map((pointer) => ({ pointer, keyword: "part", message: PART_FORM })),
    ...anchors(document).map((pointer) => ({ pointer, keyword: "part", message: PART_ANCHOR })),
  ];
  return found.map((e) => `${e.pointer || "the whole"} (${e.keyword}): ${e.message}`);
}

function schemaErrors(document: unknown, schema: object): Array<{ pointer: string; keyword: string; message: string }> {
  const ajv = new Ajv2020({ ...AJV_OPTIONS });
  const validate = ajv.compile(schema);
  if (validate(document)) return [];
  // As the editor reads ajv's errors (src/shared/validate.ts): no "if" at
  // a branch that failed, and an unknown member pointed at by its name.
  return (validate.errors ?? []).filter((e) => e.keyword !== "if").map((e) => {
    const key = e.keyword === "additionalProperties" ? (e.params as { additionalProperty?: unknown }).additionalProperty : undefined;
    return { pointer: typeof key === "string" ? `${e.instancePath}/${escapePointer(key)}` : e.instancePath, keyword: e.keyword, message: e.message ?? e.keyword };
  });
}

// The pointer of every anchor of a valid document's blocks: a section's,
// then its columns' and their widgets'.
function anchors(document: unknown): string[] {
  type Held = { props: { anchor?: string }; children: Held[] };
  const found: string[] = [];
  const walk = (blocks: Held[], pointer: string): void => {
    blocks.forEach((block, k) => {
      if (block.props.anchor !== undefined) found.push(`${pointer}/${k}/props/anchor`);
      walk(block.children, `${pointer}/${k}/children`);
    });
  };
  walk((document as { sections: Held[] }).sections, "/sections");
  return found;
}

// The pointer of every form block of a valid document.
function forms(document: unknown): string[] {
  const sections = (document as { sections: Array<{ children: Array<{ children: Array<{ type: string }> }> }> }).sections;
  return sections.flatMap((section, s) => section.children.flatMap((column, c) =>
    column.children.flatMap((block, w) => (block.type === "form" ? [`/sections/${s}/children/${c}/children/${w}`] : []))));
}

// The module: the starters, once they pass the CMS's check, and the time
// zone. A starter that breaks it stops the build, each value named.
export function siteThemeSource(text?: string, readPart?: Parameters<typeof readSiteTheme>[1]): string {
  const theme = readSiteTheme(text, readPart);
  const problems = PART_KINDS.flatMap((kind) => starterProblems(theme.parts[kind]).map((problem) => `${kind}.json: ${problem}`));
  if (problems.length > 0) throw new Error(`cms/config/parts: the starters break the rules a header's or footer's draft is held to: ${problems.join("; ")}`);
  return `// Generated by builder/build/site-theme.ts from cms/config/site.yml and cms/config/parts.\nexport const SITE_THEME = ${JSON.stringify(theme)};\n`;
}

// `import { SITE_THEME } from "virtual:site-theme"`, read again from the
// files whenever the module is loaded, so it is never older than they are.
export function siteTheme(): Plugin {
  return {
    name: "page-builder-cms:site-theme",
    resolveId(source) {
      return source === SITE_THEME_MODULE ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      this.addWatchFile(siteFile);
      for (const kind of PART_KINDS) this.addWatchFile(partFile(kind));
      return siteThemeSource();
    },
  };
}
