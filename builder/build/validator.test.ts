// The validator the browser gets is ajv's, compiled ahead of time: it must
// carry no require() and answer exactly as ajv compiled at run time does,
// which the schema's comparator holds to the server's json_schemer.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import { CHILD_TYPES } from "virtual:block-document-nesting";
import compiled, { validateBlock } from "virtual:block-document-validator";
import { AJV_OPTIONS } from "../../schema/tools/ajv-options.ts";
import { parseDocument } from "../../schema/tools/rules.ts";
import { fieldBlocks, partAnchors, partFaults, partForms, validateDocument, validatePart } from "../src/shared/validate.ts";
import { schemaDir } from "./paths.ts";
import { ajvStandalone, readSchema, replaceRequires, validatorSource } from "./validator.ts";

const Ajv2020 = Ajv2020Module.default;
const REQUIRE = /\brequire\s*\(/g;

// Every valid and invalid corpus file the application rules let through to
// the schema, as the schema sees it.
function corpusDocuments(): Array<{ name: string; document: unknown }> {
  const corpus = join(schemaDir, "corpus");
  const found: Array<{ name: string; document: unknown }> = [];
  for (const folder of ["valid", "invalid"]) {
    for (const name of readdirSync(join(corpus, folder)).filter((f) => f.endsWith(".json"))) {
      const result = parseDocument(new Uint8Array(readFileSync(join(corpus, folder, name))));
      // A file the application rules refuse never reaches the schema.
      if (result.errors.length === 0) found.push({ name: `${folder}/${name}`, document: result.document });
    }
  }
  return found;
}
type Errors = { instancePath: string; keyword: string; schemaPath: string; params: unknown }[] | null | undefined;
const shape = (errors: Errors) => (errors ?? []).map((e) => `${e.instancePath} ${e.keyword} ${e.schemaPath} ${JSON.stringify(e.params)}`);

describe("the compiled validator", () => {
  // Two compilations of the whole schema.
  test("ajv's own output calls require(), and the module the build serves calls none", { timeout: 60_000 }, () => {
    const raw = ajvStandalone();
    const before = raw.match(REQUIRE)?.length ?? 0;
    // Without this, the check below could pass because ajv stopped
    // emitting require(), not because the build replaced it.
    expect(before).toBeGreaterThan(0);

    const source = validatorSource();
    expect(source.requiresInAjvOutput).toBe(before);
    expect(source.runtimeModules).toEqual(["ajv/dist/runtime/ucs2length"]);
    expect(source.code.match(REQUIRE)).toBeNull();
    expect(source.code).toContain('import * as ajvRuntimeModule0 from "ajv/dist/runtime/ucs2length.js";');
  });

  test("a require() of a form the build does not know stops the build", () => {
    const planted = 'const func1 = require("ajv/dist/runtime/ucs2length").default;const other = require("fast-uri");';
    expect(() => replaceRequires(planted)).toThrow(/still calls require\(\)/);
  });

  // Every corpus file, twice: seconds on a busy machine.
  test("it answers every corpus file as ajv compiled at run time does, errors included", { timeout: 60_000 }, () => {
    const runtime = new Ajv2020({ ...AJV_OPTIONS }).compile(readSchema());
    let compared = 0;
    let invalid = 0;
    for (const { name, document } of corpusDocuments()) {
      const a = compiled(document);
      const b = runtime(document);
      expect(a, name).toBe(b);
      expect(shape(compiled.errors), name).toEqual(shape(runtime.errors));
      compared += 1;
      if (!a) invalid += 1;
    }
    // The corpus had 181 files past the rules on 1 October 2026; a corpus
    // that shrank to nothing must not pass.
    expect(compared).toBeGreaterThanOrEqual(150);
    expect(invalid).toBeGreaterThanOrEqual(100);
  });

  // The editor checks a change by validating the one block it touches
  // (src/document/check.ts), with the nesting rule for the slot the block
  // sits in. That is only sound if a block passes alone exactly when it
  // would pass inside a page, but for its type in that slot: so every
  // section of every corpus file is validated both ways, and a page whose
  // sections all pass alone fails only for what the page itself holds (its
  // title, its description, how many sections) or for a block type the
  // nesting rule refuses at the page.
  test("validateBlock answers every section of the corpus as ajv at run time does, and as the page validator does", { timeout: 60_000 }, () => {
    const schema = readSchema() as { $id: string };
    const ajv = new Ajv2020({ ...AJV_OPTIONS });
    ajv.addSchema(schema);
    const runtime = ajv.getSchema(`${schema.$id}#/$defs/block`);
    if (!runtime) throw new Error("ajv has no $defs/block");
    let blocks = 0;
    let refused = 0;
    let insideABlock = 0;
    let nestingOnly = 0;
    for (const { name, document } of corpusDocuments()) {
      const sections = (document as { sections?: unknown }).sections;
      if (!Array.isArray(sections)) continue;
      let allPass = true;
      sections.forEach((section, k) => {
        const a = validateBlock(section);
        expect(a, `${name} /sections/${k}`).toBe(runtime(section));
        expect(shape(validateBlock.errors), `${name} /sections/${k}`).toEqual(shape(runtime.errors));
        blocks += 1;
        if (!a) {
          refused += 1;
          allPass = false;
        }
      });
      const pageValid = compiled(document);
      const pageErrors = pageValid ? [] : (compiled.errors ?? []);
      const inBlocks = pageErrors.filter((e) => /^\/sections\/[0-9]+\//.test(e.instancePath));
      if (allPass) {
        const notNesting = inBlocks.filter((e) => {
          const slot = /^\/sections\/([0-9]+)\/type$/.exec(e.instancePath);
          const type = slot ? (sections[Number(slot[1])] as { type?: unknown }).type : undefined;
          return !(typeof type === "string" && !(CHILD_TYPES.page ?? []).includes(type));
        });
        expect(notNesting.map((e) => e.instancePath), name).toEqual([]);
        if (inBlocks.length > 0) nestingOnly += 1;
      } else {
        // A block that fails alone fails inside the page too.
        expect(pageValid, name).toBe(false);
        insideABlock += 1;
      }
    }
    // On 2 October 2026: 1163 sections compared, 146 refused alone, in 146
    // files; one file refused only by the nesting rule (a column where a
    // section belongs). A corpus that shrank must not pass by looking at less.
    expect(blocks).toBeGreaterThanOrEqual(1000);
    expect(refused).toBeGreaterThanOrEqual(120);
    expect(insideABlock).toBeGreaterThanOrEqual(120);
    expect(nestingOnly).toBeGreaterThanOrEqual(1);
  });

  // A part's draft, the site's header or footer (src/shared/validate.ts,
  // validatePart), is checked as a page's, by the compiled validator, then
  // held to the part's own rules, as the server checks it (SiteParts.check):
  // every valid page of the corpus is a valid part but for its forms and
  // its sections' anchors, each refused where it is and nothing else.
  test("validatePart takes every valid page of the corpus but for its forms, its anchors and its Field blocks, each refused where it is, keyword part or field", () => {
    const valid = join(schemaDir, "corpus", "valid");
    let parts = 0;
    let withForms = 0;
    let withAnchors = 0;
    let withFields = 0;
    for (const name of readdirSync(valid).filter((f) => f.endsWith(".json"))) {
      const page = validateDocument(JSON.parse(readFileSync(join(valid, name), "utf8")));
      if (!page.valid) throw new Error(`${name} is in the valid corpus and refused`);
      const faults = [...partForms(page.document).map((pointer) => `${pointer} part`), ...partAnchors(page.document).map((pointer) => `${pointer} part`), ...fieldBlocks(page.document).map((pointer) => `${pointer} field`)];
      const part = validatePart(page.document);
      if (faults.length === 0) {
        expect(part.valid, name).toBe(true);
        parts += 1;
      } else {
        expect(part.valid ? [] : part.errors.map((e) => `${e.pointer} ${e.keyword}`), name).toEqual(faults);
        expect(partFaults(page.document).map((f) => `${f.pointer} ${f.keyword}`), name).toEqual(faults);
        if (partForms(page.document).length > 0) withForms += 1;
        if (partAnchors(page.document).length > 0) withAnchors += 1;
        if (fieldBlocks(page.document).length > 0) withFields += 1;
      }
    }
    // On 12 October 2026, with the anchors refused too: 23 valid parts, 3
    // pages with a form, 2 with an anchor (one has both); on 15 October,
    // 2 with a Field block (the base page and the fields' own). A corpus
    // that shrank must not pass by looking at less.
    expect(parts).toBeGreaterThanOrEqual(23);
    expect(withForms).toBeGreaterThanOrEqual(3);
    expect(withAnchors).toBeGreaterThanOrEqual(2);
    expect(withFields).toBeGreaterThanOrEqual(2);
  });
});
