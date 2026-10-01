// Shows that lint.ts can fail. It runs the lint once on the schema as it is
// (it must pass), then on copies of the schema with one fault planted in
// each (every one must fail, for the reason planted). The copies live in a
// temporary folder that is removed at the end.
//
//   node lint-plants.ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA, SCHEMA_DIR, TOOLS } from "./corpus.ts";

type J = any;
const BACKSLASH = String.fromCharCode(0x5c);

interface Plant {
  name: string;
  args?: string[];
  expect: string;
  plant?: (schema: J) => void;
  // Plants in a copy of schema/README.md instead.
  readme?: (text: string) => string;
}

const plants: Plant[] = [
  {
    name: "a \\s in a pattern",
    expect: `escape ${BACKSLASH}s`,
    plant: (s) => { s.$defs.blockId.pattern = `^[A-Za-z0-9_-]{1,64}${BACKSLASH}s*$`; },
  },
  {
    name: "a dot in a pattern",
    expect: "dot at",
    plant: (s) => { s.$defs.mediaId.pattern = "^.{1,64}$"; },
  },
  {
    name: "a lone { in a pattern",
    expect: "is not a quantifier",
    plant: (s) => { s.$defs.mediaId.pattern = "^[a-z]{1,64}{$"; },
  },
  {
    name: "an inline modifier, which ajv compiles and json_schemer refuses (style check off)",
    args: ["--no-style"],
    expect: "json_schemer refuses it",
    plant: (s) => { s.$defs.blockId.pattern = "^(?i:[a-z0-9_-]{1,64})$"; },
  },
  {
    name: "\\- outside a class, which json_schemer compiles and ajv refuses (style check off)",
    args: ["--no-style"],
    expect: "ajv's engine refuses it",
    plant: (s) => { s.$defs.blockId.pattern = `^[a-z]+${BACKSLASH}-[a-z]+$`; },
  },
  {
    name: "\\S for 'has a visible character', which the engines read differently (style check off)",
    args: ["--no-style"],
    expect: "the engines disagree",
    plant: (s) => { s.$defs.line.pattern = `${BACKSLASH}S`; },
  },
  {
    name: "a dot, which the engines read differently (style check off)",
    args: ["--no-style"],
    expect: "the engines disagree",
    plant: (s) => { s.$defs.blockId.pattern = "^a.$"; },
  },
  {
    name: "a oneOf",
    expect: "uses oneOf",
    plant: (s) => { s.$defs.noChildren.oneOf = [true]; },
  },
  {
    name: "a widget type with no branch, and another with two",
    expect: "\"map\" has 0 branches",
    plant: (s) => {
      const branches: J[] = s.$defs.block.allOf;
      const map = branches.findIndex((b) => b.if.properties.type.const === "map");
      branches.splice(map, 1);
      branches.push(structuredClone(branches.find((b) => b.if.properties.type.const === "quote")));
    },
  },
  {
    name: "a branch whose if lacks required [\"type\"]",
    expect: "lacks required",
    plant: (s) => { delete s.$defs.block.allOf[0].if.required; },
  },
  {
    name: "a section that holds five columns",
    expect: "one to four columns",
    plant: (s) => { s.$defs.sectionBlock.properties.children.maxItems = 5; },
  },
  {
    name: "a spacing step that tokens.json does not have",
    expect: "$defs/spaceToken is",
    plant: (s) => { s.$defs.spaceToken.enum.push("xxxl"); },
  },
  {
    name: "a palette slot that tokens.json does not have",
    expect: "$defs/paletteSlot is",
    plant: (s) => { s.$defs.paletteSlot.enum.push("brand"); },
  },
  {
    name: "a README example that drifted from the corpus",
    expect: "is not valid/readme-example.json",
    readme: (text) => {
      const changed = text.replace('"level": 1', '"level": 2');
      if (changed === text) throw new Error("the README example has no level 1 to change");
      return changed;
    },
  },
];

function lint(schemaPath: string, args: string[] = []): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [join(TOOLS, "lint.ts"), "--schema", schemaPath, ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
    timeout: 300_000,
    killSignal: "SIGKILL",
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

let failures = 0;
const control = lint(SCHEMA);
console.log(`control, the schema as it is: exit ${control.status}`);
if (control.status !== 0) {
  failures++;
  console.log(control.out);
}

const dir = mkdtempSync(join(tmpdir(), "schema-lint-plants-"));
let caught = 0;
try {
  const original = readFileSync(SCHEMA, "utf8");
  const readme = readFileSync(join(SCHEMA_DIR, "README.md"), "utf8");
  plants.forEach((p, k) => {
    const schema = JSON.parse(original);
    p.plant?.(schema);
    const path = join(dir, `plant-${k}.schema.json`);
    writeFileSync(path, JSON.stringify(schema, null, 2));
    const args = [...(p.args ?? [])];
    if (p.readme) {
      const readmeCopy = join(dir, `plant-${k}.README.md`);
      writeFileSync(readmeCopy, p.readme(readme));
      args.push("--readme", readmeCopy);
    }
    const r = lint(path, args);
    const line = r.out.split(/\r?\n/).find((l) => l.includes(p.expect));
    if (r.status === 1 && line) {
      caught++;
      console.log(`caught   ${p.name}\n         ${line.trim().slice(0, 220)}`);
    } else {
      failures++;
      console.log(`MISSED   ${p.name}: exit ${r.status}, expected a line with ${JSON.stringify(p.expect)}`);
      console.log(r.out.slice(0, 2000));
    }
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`planted ${plants.length}, caught ${caught}; temporary folder removed`);
if (failures > 0) {
  console.log(`RESULT: FAIL (${failures})`);
  process.exit(1);
}
console.log("RESULT: PASS");
