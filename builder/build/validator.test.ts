// The validator the browser gets is ajv's, compiled ahead of time: it must
// carry no require() and answer exactly as ajv compiled at run time does,
// which the schema's comparator holds to the server's json_schemer.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import { describe, expect, test } from "vitest";
import { CHILD_TYPES } from "virtual:block-document-nesting";
import compiled, { validateBlock, validateSite } from "virtual:block-document-validator";
import { AJV_OPTIONS } from "../../schema/tools/ajv-options.ts";
import { listCorpus, readManifest } from "../../schema/tools/corpus.ts";
import { parseDocument } from "../../schema/tools/rules.ts";
import { validateSite as checkSite } from "../src/shared/validate.ts";
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

  // The header and footer the editor sends (src/shared/validate.ts,
  // validateSite) are checked by $defs/site, compiled here, after the rules
  // on the tree, as the server checks them (Site.check). The site's corpus
  // (schema/corpus/site) holds the server's json_schemer and ajv at run
  // time to one verdict and to the manifest's pointer and rule for each
  // refusal (npm run compare:site); this holds the compiled validator to
  // ajv at run time, and the editor's whole check to the manifest. Two
  // files break a rule of the text itself (a member named twice, a
  // trailing comma), which no value in memory can hold: the editor never
  // sends text it did not write.
  test("validateSite answers every file of the site's corpus as ajv at run time does, and the editor's check names the manifest's pointer and rule", () => {
    const schema = readSchema() as { $id: string };
    const ajv = new Ajv2020({ ...AJV_OPTIONS });
    ajv.addSchema(schema);
    const runtime = ajv.getSchema(`${schema.$id}#/$defs/site`);
    if (!runtime) throw new Error("ajv has no $defs/site");
    const corpus = join(schemaDir, "corpus", "site");
    const manifest = readManifest(corpus);
    let compared = 0;
    let refused = 0;
    let textOnly = 0;
    for (const file of listCorpus(corpus)) {
      const entry = manifest[file];
      if (!entry) throw new Error(`${file} is not in the manifest`);
      const text = readFileSync(join(corpus, file), "utf8");
      const parsed = parseDocument(new Uint8Array(readFileSync(join(corpus, file))));
      let value: unknown = parsed.document;
      if (parsed.errors.length > 0) {
        expect(entry.layer, file).toBe("rules");
        let read: unknown;
        try {
          read = JSON.parse(text);
        } catch {
          textOnly += 1;
          continue;
        }
        // JSON.parse keeps the last of a member named twice: nothing left
        // in memory says it was there.
        if (entry.keyword === "duplicateKey") {
          textOnly += 1;
          continue;
        }
        value = read;
      } else {
        expect(validateSite(value), file).toBe(runtime(value));
        expect(shape(validateSite.errors), file).toEqual(shape(runtime.errors));
      }
      compared += 1;
      const ours = checkSite(value);
      expect(ours.valid, file).toBe(file.startsWith("valid/"));
      if (!ours.valid) {
        refused += 1;
        expect(ours.errors.map((e) => `${e.pointer} ${e.keyword}`), file).toContain(`${entry.pointer} ${entry.keyword}`);
      }
    }
    // On 9 October 2026: 50 files, 6 valid; a corpus that shrank must not
    // pass by looking at less.
    expect(compared).toBeGreaterThanOrEqual(48);
    expect(refused).toBeGreaterThanOrEqual(42);
    expect(textOnly).toBe(2);
  });
});
