// @vitest-environment node
// The property test (property.test.ts) is only worth its green if it turns
// red on the faults it is there to catch. Each case here copies
// src/document and src/store into a folder of its own, plants one fault in
// the copy's source text, loads the copy, and runs the same random sessions
// against it with the same seed: the run must fail. An unchanged copy runs
// first and must pass, so a failure is the fault's and not the copying's.
//
// The copy sits in builder/.mutants/ (ignored by git, outside every
// tsconfig, lint and test pattern), so its imports of packages resolve as
// the real files' do, and it is removed when the case ends.
import fc from "fast-check";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { newTally, runSettings, sessionProperty, type Implementation } from "../../test/document-arbitraries.ts";

const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mutantsRoot = resolve(src, "..", ".mutants");
const COPIED = ["document", "store"];
const slash = (path: string): string => path.replaceAll("\\", "/");

interface Plant {
  file: string;
  search: string;
  replace: string;
}

let made = 0;

// The copy, with every relative import that leaves the copied folders
// pointed at the real file, and the plants applied. A plant whose text is
// not in the file exactly once stops the case: a plant that changed
// nothing would make the case pass by testing the real code.
async function load(plants: readonly Plant[]): Promise<Implementation> {
  const root = join(mutantsRoot, `m${process.pid}-${++made}`);
  for (const folder of COPIED) {
    mkdirSync(join(root, folder), { recursive: true });
    for (const name of readdirSync(join(src, folder)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      let text = readFileSync(join(src, folder, name), "utf8");
      text = text.replace(/from "(\.{1,2}\/[^"]+)"/g, (whole, spec: string) => {
        const target = resolve(src, folder, spec);
        const inside = COPIED.some((f) => slash(target).startsWith(`${slash(join(src, f))}/`));
        return inside ? whole : `from "${slash(target)}"`;
      });
      for (const plant of plants.filter((p) => p.file === `${folder}/${name}`)) {
        const found = text.split(plant.search).length - 1;
        if (found !== 1) throw new Error(`the plant for ${plant.file} matches ${found} times, not once: ${plant.search}`);
        text = text.replace(plant.search, () => plant.replace);
      }
      writeFileSync(join(root, folder, name), text);
    }
  }
  for (const plant of plants) {
    if (!COPIED.some((f) => plant.file.startsWith(`${f}/`))) throw new Error(`no copied file ${plant.file}`);
  }
  const at = (path: string): string => slash(join(root, path));
  return {
    commands: await import(/* @vite-ignore */ at("document/commands.ts")),
    reducer: await import(/* @vite-ignore */ at("document/reducer.ts")),
    richText: await import(/* @vite-ignore */ at("document/rich-text.ts")),
    clipboard: await import(/* @vite-ignore */ at("document/clipboard.ts")),
    tree: await import(/* @vite-ignore */ at("document/tree.ts")),
    store: await import(/* @vite-ignore */ at("store/editor-store.ts")),
  };
}

afterAll(() => rmSync(mutantsRoot, { recursive: true, force: true }));

// The run that must fail, stopped at the first failure (no shrinking: the
// point is that it fails, not the smallest example).
function run(impl: Implementation, numRuns: number): fc.RunDetails<unknown> {
  const { seed } = runSettings(numRuns);
  return fc.check(sessionProperty(impl, newTally()), { seed, numRuns, endOnFailure: true }) as fc.RunDetails<unknown>;
}

const firstLine = (details: fc.RunDetails<unknown>): string => String(details.errorInstance instanceof Error ? details.errorInstance.message : details.errorInstance).split("\n")[0] ?? "";

const MUTANTS: Array<{ name: string; plants: Plant[]; expect: RegExp }> = [
  {
    name: "an inverse that writes undefined instead of taking the key out",
    plants: [{ file: "document/ops.ts", search: "if (\"before\" in op) inverse.after = op.before as Json;", replace: "inverse.after = op.before as Json;" }],
    // Which check meets it first depends on the sessions the run draws:
    // the page after the undo, the command through JSON, or the inverse of
    // the inverse.
    expect: /undoing .* (did not give back the same page|was refused|gave an invalid page)|does not survive JSON|the inverse of the inverse of .* is not the command/,
  },
  {
    // A change of a form field's type takes its longest answer out; the
    // inverse must put it back, or a text field is left with none.
    name: "an inverse that does not give a form field's longest answer back when its type changes",
    plants: [{ file: "document/ops.ts", search: "if (\"before\" in op) inverse.after = op.before as Json;", replace: "if (\"before\" in op && op.key !== \"maxLength\") inverse.after = op.before as Json;" }],
    // Seen as the undo's own step refused for the limit it does not give
    // back, or as an inverse undone again that is not the command.
    expect: /undoing Changed field .* was refused: .*maxLength|the inverse of the inverse of Changed field .* is not the command/,
  },
  {
    name: "a duplicate that draws its ids when it is applied, not when it is made",
    plants: [
      { file: "document/commands.ts", search: "const copy = reidentify(found.block, idDraw(doc, newId));", replace: "const copy = found.block;" },
      {
        file: "document/ops.ts",
        search: "list.splice(op.at.index, 0, op.block as unknown as AnyBlock);",
        replace: "list.splice(op.at.index, 0, (locate(doc, op.block.id) ? reidentify(op.block, () => Math.random().toString(36).slice(2, 12)) : op.block) as unknown as AnyBlock);",
      },
      {
        file: "document/ops.ts",
        search: "import { isObject, keyIndex, sameJson, withKey, withoutKey, type Json } from \"./json.ts\";",
        replace: "import { isObject, keyIndex, sameJson, withKey, withoutKey, type Json } from \"./json.ts\";\nimport { reidentify } from \"./ids.ts\";",
      },
    ],
    expect: /(undoing|redoing) Duplicated/,
  },
  {
    name: "a removed override that leaves an empty override object behind",
    plants: [{ file: "document/commands.ts", search: "if (device !== \"base\" && Object.keys(part).length === 0 && steps.ops.length > 0) {", replace: "if (false) {" }],
    expect: /Cleared .* must be possible here/,
  },
  {
    name: "a reducer that does not validate the container a change touches",
    plants: [{ file: "document/reducer.ts", search: "    const problem = checkContainer(next, id);\n    if (problem) return problem;\n", replace: "    checkContainer(next, id);\n" }],
    expect: /gave an invalid page/,
  },
  {
    name: "column widths that outlive a change in the number of columns",
    plants: [{ file: "document/commands.ts", search: "function clearWidths(doc: PageDocument, sectionId: string | null, countAfter?: number): Op[] {\n", replace: "function clearWidths(doc: PageDocument, sectionId: string | null, countAfter?: number): Op[] {\n  if (sectionId !== \"\") return [];\n" }],
    expect: /must be possible here, and was refused/,
  },
  {
    name: "a stacking that outlives a section left with one column",
    plants: [{ file: "document/commands.ts", search: "  if (countAfter !== undefined && countAfter < 2 && section.props.stack !== undefined) {\n", replace: "  if (countAfter === -1 && section.props.stack !== undefined) {\n" }],
    expect: /must be possible here, and was refused/,
  },
  {
    name: "a key put back at the end of its object instead of where it was",
    plants: [{ file: "document/ops.ts", search: "return withKey(object, op.key, op.after, op.at);", replace: "return withKey(object, op.key, op.after);" }],
    // Seen as the order of the keys an undo gives back, or, when the key
    // was added at the end, as the undo's own step finding it out of place.
    expect: /keys in another order|undoing .* was refused: .* is not at \d+/,
  },
  {
    // The text editor's own reading of the stored text (marks reordered, a
    // link's nulls dropped) taken for the text to put back on undo.
    name: "a text command whose undo puts back the editor's reading of the stored text, not the text itself",
    plants: [{
      file: "document/rich-text.ts",
      search: "  return makeSetProps(doc, id, { doc: next as unknown as Json });",
      replace: "  const made = makeSetProps(doc, id, { doc: next as unknown as Json });\n  if (made.ok) for (const op of made.command.ops) if (op.op === \"set\" && \"before\" in op) (op as { before: unknown }).before = richTextFromEditor(op.before);\n  return made;",
    }],
    expect: /Changed Text.*(must be possible here, and was refused|did not give back the same page)/,
  },
  {
    name: "a text command that keeps the link's attributes as the editor wrote them",
    plants: [{
      file: "document/rich-text.ts",
      search: "found.set(\"link\", { type: \"link\", attrs: { href: mark.attrs.href } });",
      replace: "found.set(\"link\", { type: \"link\", attrs: { ...mark.attrs } } as Mark);",
    }],
    expect: /Changed Text.*(must be possible here, and was refused|another form than the canonical one)/,
  },
];

describe("planted faults", () => {
  // Each case loads a copy and runs up to 300 sessions: seconds each.
  test("the unchanged copy passes the same runs", { timeout: 180_000 }, async () => {
    const details = run(await load([]), 150);
    expect(details.failed, firstLine(details)).toBe(false);
    expect(details.numRuns).toBe(150);
  });

  for (const mutant of MUTANTS) {
    test(`fails on ${mutant.name}`, { timeout: 180_000 }, async () => {
      const details = run(await load(mutant.plants), 300);
      expect(details.failed).toBe(true);
      expect(firstLine(details)).toMatch(mutant.expect);
      console.log(`mutant "${mutant.name}": failed after ${details.numRuns} run(s): ${firstLine(details)}`);
    });
  }
});
