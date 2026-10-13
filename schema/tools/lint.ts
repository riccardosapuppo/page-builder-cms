// Checks on the schema itself, before any document is validated:
//
//   1. patterns: each one is written in the portable subset below, compiles
//      in ajv's engine (ECMA-262 with the u flag) and in json_schemer's ECMA
//      translation to Ruby (lint.rb, through the app's bundle), and the two
//      engines answer the same on every probe string;
//   2. keywords the schema must not use;
//   3. dispatch: every value of an enum that if/then branches dispatch on
//      has exactly one branch, and every branch's value is in the enum;
//   4. hierarchy: page > section > column > widget, read from the schema;
//   5. tokens: the style enums are the token names in tokens.json;
//   6. the schema is valid draft 2020-12 to both engines, and the example in
//      schema/README.md is the corpus file valid/readme-example.json.
//
//   node lint.ts [--schema PATH] [--readme PATH] [--no-style]
//
// --no-style skips the portable-subset check, so lint-plants.ts can show the
// compile and probe checks failing on their own; --readme reads the example
// from another copy of the README, for the same reason.
//
// The portable subset, which both engines read the same way:
//   - the source is ASCII; other characters are written as \uXXXX escapes;
//   - outside a class, the only escapes are \uXXXX and escaped syntax
//     characters: no \s \S \d \D \w \W \b \B \p \P, no \- and no \n;
//   - inside a class, only \uXXXX and \\ \] \[ \- \^ \/;
//   - no dot, no group other than (?:...) (no lookaround, named group or
//     inline modifier), no { that is not a quantifier and no lone };
//   - no empty class [] or [^], no [ inside a class (Ruby nests it), no &&
//     inside a class (Ruby intersects).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeAjv } from "./ajv.ts";
import { CORPUS, SCHEMA, SCHEMA_DIR, TOOLS, argValue, listCorpus } from "./corpus.ts";
import { escapePointer } from "./rules.ts";

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);

const argv = process.argv.slice(2);
const schemaPath = argValue(argv, "--schema", SCHEMA);
const readmePath = argValue(argv, "--readme", join(SCHEMA_DIR, "README.md"));
const checkStyle = !argv.includes("--no-style");
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Obj;
const defs = (isObject(schema.$defs) ? schema.$defs : {}) as Record<string, unknown>;

const problems: string[] = [];
const report: string[] = [];
const problem = (section: string, message: string): void => {
  problems.push(`${section}: ${message}`);
};

// --- walking the schema ---------------------------------------------------------
// Only places that hold subschemas are walked, so a property named "pattern"
// or "oneOf" is never mistaken for the keyword.
const MAP_KEYWORDS = ["properties", "patternProperties", "$defs", "dependentSchemas"];
const ONE_KEYWORDS = ["items", "additionalProperties", "not", "if", "then", "else", "contains", "propertyNames", "unevaluatedItems", "unevaluatedProperties"];
const LIST_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"];

function subschemas(root: unknown): Array<{ s: Obj; at: string }> {
  const out: Array<{ s: Obj; at: string }> = [];
  const visit = (s: unknown, at: string): void => {
    if (!isObject(s)) return;
    out.push({ s, at });
    for (const k of MAP_KEYWORDS) {
      const m = s[k];
      if (isObject(m)) for (const [name, child] of Object.entries(m)) visit(child, `${at}/${k}/${escapePointer(name)}`);
    }
    for (const k of ONE_KEYWORDS) if (k in s) visit(s[k], `${at}/${k}`);
    for (const k of LIST_KEYWORDS) {
      const l = s[k];
      if (Array.isArray(l)) l.forEach((child, i) => visit(child, `${at}/${k}/${i}`));
    }
  };
  visit(root, "#");
  return out;
}
const all = subschemas(schema);

// Follows local $refs to the schema that holds the keywords.
function deref(s: unknown): Obj | undefined {
  let cur = s;
  for (let hops = 0; hops < 20 && isObject(cur); hops++) {
    const ref = cur.$ref;
    if (typeof ref !== "string") return cur;
    const m = /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(ref);
    if (!m) return undefined;
    cur = defs[m[1] as string];
  }
  return isObject(cur) ? cur : undefined;
}
const enumOf = (s: unknown): unknown[] | undefined => {
  const d = deref(s);
  return d && Array.isArray(d.enum) ? d.enum : undefined;
};
const sameList = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

// --- 1. patterns -------------------------------------------------------------------
const patterns = all.filter(({ s }) => typeof s.pattern === "string").map(({ s, at }) => ({ at: `${at}/pattern`, source: s.pattern as string }));

function styleProblems(p: string): string[] {
  const out: string[] = [];
  for (let k = 0; k < p.length; k++) {
    const c = p.charCodeAt(k);
    if (c < 0x20 || c > 0x7e) {
      out.push(`character ${k} is not printable ASCII: write it as a \\u escape`);
      break;
    }
  }
  const isHex4 = (at: number): boolean => /^[0-9A-Fa-f]{4}$/.test(p.slice(at, at + 4));
  let i = 0;
  let inClass = false;
  let atom = false; // whether a quantifier may follow
  while (i < p.length) {
    const c = p.charAt(i);
    if (c === "\\") {
      const e = p.charAt(i + 1);
      if (e === "u") {
        if (!isHex4(i + 2)) out.push(`\\u at ${i} needs four hex digits`);
        i += 6;
      } else {
        const allowed = inClass ? "\\][-^/" : "\\/.[](){}*+?|^$";
        if (e === "" || !allowed.includes(e)) out.push(`escape \\${e} at ${i}${inClass ? " inside a class" : ""}`);
        i += 2;
      }
      atom = true;
      continue;
    }
    if (inClass) {
      if (c === "]") {
        inClass = false;
        atom = true;
      } else if (c === "[") {
        out.push(`[ at ${i} inside a class (Ruby reads a nested class)`);
      } else if (c === "&" && p.charAt(i + 1) === "&") {
        out.push(`&& at ${i} inside a class (Ruby reads an intersection)`);
      }
      i++;
      continue;
    }
    switch (c) {
      case "[":
        if (p.startsWith("[]", i) || p.startsWith("[^]", i)) out.push(`empty class at ${i}`);
        inClass = true;
        i += p.charAt(i + 1) === "^" ? 2 : 1;
        continue;
      case ".":
        out.push(`dot at ${i}: each engine leaves out different line breaks`);
        atom = true;
        break;
      case "(":
        if (p.charAt(i + 1) === "?" && p.charAt(i + 2) !== ":") out.push(`group (?${p.charAt(i + 2)} at ${i}: only (?:...) is portable`);
        if (p.charAt(i + 1) === "?") i += 2;
        atom = false;
        break;
      case ")":
        atom = true;
        break;
      case "|":
      case "^":
        atom = false;
        break;
      case "*":
      case "+":
      case "?":
        if (!atom) out.push(`quantifier ${c} at ${i} with nothing to repeat`);
        if (p.charAt(i + 1) === "?") i++;
        atom = false;
        break;
      case "{": {
        const m = /^\{[0-9]+(?:,[0-9]*)?\}/.exec(p.slice(i));
        if (!m || !atom) {
          out.push(`{ at ${i} is not a quantifier`);
          break;
        }
        i += m[0].length;
        atom = false;
        continue;
      }
      case "}":
        out.push(`lone } at ${i}`);
        break;
      default:
        atom = true;
    }
    i++;
  }
  if (inClass) out.push("a class is not closed");
  return out;
}

if (checkStyle) {
  let clean = 0;
  for (const { at, source } of patterns) {
    const found = styleProblems(source);
    if (found.length === 0) clean++;
    for (const f of found) problem("pattern style", `${at}: ${f}`);
  }
  report.push(`pattern style: ${clean}/${patterns.length} patterns in the portable subset`);
} else {
  report.push("pattern style: skipped (--no-style)");
}

// Probe strings. Every printable and control ASCII character, and the
// characters on which regex engines are known to differ: Unicode spaces and
// line breaks, digits of other scripts, letters that fold to ASCII under
// case-insensitive matching (long s, Kelvin sign), a combining mark, a
// zero-width joiner, a byte-order mark and an emoji outside the BMP.
const PROBE_CODE_POINTS = [
  ...Array.from({ length: 0x80 }, (_, k) => k),
  0x85, 0xa0, 0xad, 0xe9, 0xf6, 0x17f, 0x301, 0x660, 0x663, 0x6f3, 0x1680, 0x180e,
  0x2000, 0x200a, 0x200b, 0x200d, 0x200f, 0x2028, 0x2029, 0x202f, 0x205f, 0x2060,
  0x212a, 0x3000, 0xfeff, 0xff10, 0xff41, 0x1f600,
];
const PROBE_CHARS = PROBE_CODE_POINTS.map((c) => String.fromCodePoint(c));

// Seeds: strings of the valid corpus that a pattern accepts, so each probe
// character is also tried at the start, the middle and the end of a real
// value, where an anchored pattern can tell.
const corpusStrings = new Set<string>();
const collect = (v: unknown): void => {
  if (typeof v === "string") corpusStrings.add(v);
  else if (Array.isArray(v)) v.forEach(collect);
  else if (isObject(v)) Object.values(v).forEach(collect);
};
for (const file of listCorpus(CORPUS).filter((f) => f.startsWith("valid/"))) collect(JSON.parse(readFileSync(join(CORPUS, file), "utf8")));

interface PatternRun { at: string; source: string; probes: string[]; js?: RegExp; jsError?: string }
const runs: PatternRun[] = patterns.map(({ at, source }) => {
  let js: RegExp | undefined;
  let jsError: string | undefined;
  try {
    js = new RegExp(source, "u");
  } catch (e) {
    jsError = e instanceof Error ? e.message : String(e);
  }
  const seeds = js ? [...corpusStrings].filter((s) => (js as RegExp).test(s)).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).slice(0, 6) : [];
  const probes = new Set<string>(seeds);
  for (const c of PROBE_CHARS) {
    probes.add(c);
    probes.add(`a${c}`);
    probes.add(`${c}a`);
    for (const seed of seeds) {
      const mid = Math.floor(seed.length / 2);
      probes.add(c + seed);
      probes.add(seed + c);
      probes.add(seed.slice(0, mid) + c + seed.slice(mid));
    }
  }
  // A probe must not split a surrogate pair: lone surrogates never reach the
  // schema (the application rules refuse them), and Ruby cannot hold them.
  return { at, source, probes: [...probes].filter((s) => s.isWellFormed()), ...(js ? { js } : {}), ...(jsError ? { jsError } : {}) };
});

interface RubyPattern { at: string; ok: boolean; error?: string; ruby?: string; matches?: string }
interface RubyAnswer { engine: string; schemaErrors: string[]; patterns: RubyPattern[] }
const rubyInput = JSON.stringify({ schema: schemaPath, patterns: runs.map(({ at, source, probes }) => ({ at, source, probes })) });
const ruby = spawnSync(process.env.RUBY ?? "ruby", [join(TOOLS, "lint.rb")], {
  input: rubyInput,
  encoding: "utf8",
  maxBuffer: 1 << 30,
  timeout: 300_000,
  killSignal: "SIGKILL",
});
let answer: RubyAnswer | undefined;
if (ruby.error || ruby.status !== 0) {
  problem("json_schemer", `lint.rb did not run: ${ruby.error?.message ?? `status ${ruby.status}`} ${ruby.stderr?.trim().slice(0, 600) ?? ""}`);
} else {
  try {
    answer = JSON.parse(ruby.stdout) as RubyAnswer;
  } catch {
    problem("json_schemer", `unreadable answer from lint.rb: ${ruby.stdout.slice(0, 200)}`);
  }
}

// A probe as a reader can see it: anything outside printable ASCII is shown
// by code point.
const show = (s: string): string =>
  [...s].map((ch) => {
    const c = ch.codePointAt(0) as number;
    return c >= 0x20 && c <= 0x7e ? ch : `<U+${c.toString(16).toUpperCase().padStart(4, "0")}>`;
  }).join("");

let compiledBoth = 0;
let probesTotal = 0;
let probesMatched = 0;
let disagreeing = 0;
for (const run of runs) {
  const r = answer?.patterns.find((x) => x.at === run.at);
  if (run.jsError !== undefined) problem("pattern compile", `${run.at}: ajv's engine refuses it: ${run.jsError}`);
  if (answer && !r) problem("pattern compile", `${run.at}: no answer from json_schemer`);
  if (r && !r.ok) problem("pattern compile", `${run.at}: json_schemer refuses it: ${r.error ?? "?"}`);
  if (!run.js || !r?.ok || r.matches === undefined) continue;
  compiledBoth++;
  if (r.matches.length !== run.probes.length) {
    problem("pattern probes", `${run.at}: json_schemer answered ${r.matches.length} probes of ${run.probes.length}`);
    continue;
  }
  const differ: string[] = [];
  run.probes.forEach((probe, k) => {
    const js = (run.js as RegExp).test(probe);
    const rb = r.matches?.charAt(k) === "1";
    probesTotal++;
    if (js && rb) probesMatched++;
    if (js !== rb) differ.push(`"${show(probe)}" ajv ${js ? "matches" : "does not match"}, json_schemer ${rb ? "matches" : "does not"}`);
  });
  if (differ.length > 0) {
    disagreeing++;
    problem("pattern probes", `${run.at}: the engines disagree on ${differ.length} of ${run.probes.length} probes, e.g. ${differ.slice(0, 3).join("; ")}`);
  }
}
report.push(`pattern compile: ${compiledBoth}/${patterns.length} patterns compile in both engines${answer ? ` (${answer.engine})` : ""}`);
report.push(`pattern probes: ${probesTotal} probes over ${compiledBoth} patterns, ${probesMatched} matched by both, ${disagreeing} patterns with a disagreement`);

// --- 2. keywords ----------------------------------------------------------------------
// oneOf: exponential in nesting depth in both engines; discriminator: ajv
// only; unevaluated*: the engines disagree on annotations from a passing
// "if"; format: annotation only, "javascript:alert(1)" is a valid uri;
// uniqueItems: Ruby compares 1 and 1.0 as different; a fractional
// multipleOf: floating-point remainders differ.
const FORBIDDEN = ["oneOf", "discriminator", "unevaluatedProperties", "unevaluatedItems", "format", "uniqueItems"];
let keywordHits = 0;
for (const { s, at } of all) {
  for (const k of FORBIDDEN) {
    if (k in s) {
      keywordHits++;
      problem("keywords", `${at} uses ${k}`);
    }
  }
  if ("multipleOf" in s && !Number.isInteger(s.multipleOf)) {
    keywordHits++;
    problem("keywords", `${at} has a fractional multipleOf`);
  }
}
report.push(`keywords: ${all.length} subschemas, ${keywordHits} forbidden keyword(s) (${FORBIDDEN.join(", ")}, fractional multipleOf)`);

// --- 3. dispatch ------------------------------------------------------------------------
// A dispatcher is a schema whose allOf holds if/then branches keyed on the
// const of one property. Its values come from that property's enum.
interface Dispatcher { at: string; key: string; values: unknown[]; branches: number }
const dispatchers: Dispatcher[] = [];
for (const { s, at } of all) {
  if (!Array.isArray(s.allOf)) continue;
  const byKey = new Map<string, Array<{ value: unknown; branch: Obj; index: number }>>();
  s.allOf.forEach((branch: unknown, index: number) => {
    if (!isObject(branch) || !isObject(branch.if) || !isObject(branch.if.properties)) return;
    for (const [key, cond] of Object.entries(branch.if.properties)) {
      if (isObject(cond) && "const" in cond) {
        const list = byKey.get(key) ?? [];
        list.push({ value: cond.const, branch, index });
        byKey.set(key, list);
      }
    }
  });
  for (const [key, branches] of byKey) {
    const props = isObject(s.properties) ? s.properties : {};
    const values = enumOf(props[key]);
    if (!values) {
      problem("dispatch", `${at} dispatches on ${key}, which has no enum: an unknown value would run no branch and pass unchecked`);
      continue;
    }
    const seen = new Map<unknown, number>();
    for (const { value, branch, index } of branches) {
      seen.set(value, (seen.get(value) ?? 0) + 1);
      const ifSchema = branch.if as Obj;
      if (!Array.isArray(ifSchema.required) || !ifSchema.required.includes(key)) {
        problem("dispatch", `${at}/allOf/${index}: the branch for ${JSON.stringify(value)} lacks required ["${key}"], so a value without ${key} would run it`);
      }
      if (!("then" in branch)) problem("dispatch", `${at}/allOf/${index}: the branch for ${JSON.stringify(value)} has no then`);
      if (!values.includes(value)) problem("dispatch", `${at}: a branch for ${JSON.stringify(value)}, which is not in the enum`);
    }
    for (const value of values) {
      const n = seen.get(value) ?? 0;
      if (n !== 1) problem("dispatch", `${at}: ${JSON.stringify(value)} has ${n} branches, not exactly one`);
    }
    dispatchers.push({ at, key, values, branches: branches.length });
  }
}
const blockDispatch = dispatchers.find((d) => d.at === "#/$defs/block" && d.key === "type");
if (!blockDispatch) problem("dispatch", "#/$defs/block does not dispatch on type");
const blockTypes = enumOf(defs.blockType) ?? [];
if (blockDispatch && !sameList(blockDispatch.values, blockTypes)) problem("dispatch", "#/$defs/block dispatches on an enum other than $defs/blockType");
report.push(`dispatch: ${dispatchers.map((d) => `${d.at} on ${d.key}: ${d.values.length} values, ${d.branches} branches`).join("; ")}`);

// --- 3b. marks ---------------------------------------------------------------------------
// A run of text carries each mark at most once (two links would nest one
// <a> in another). $defs/pmMarks says it under not: anyOf, one entry per
// mark type, "contains that type" with minContains 2. A mark type added to
// the enum without its entry could be repeated, so every type must have
// exactly one.
{
  const markTypes = enumOf((deref(defs.pmMark)?.properties as Obj | undefined)?.type) ?? [];
  const marks = deref(defs.pmMarks);
  const entries = isObject(marks) && isObject(marks.not) && Array.isArray(marks.not.anyOf) ? marks.not.anyOf : [];
  const guarded = new Map<unknown, number>();
  entries.forEach((entry: unknown, index: number) => {
    const at = `#/$defs/pmMarks/not/anyOf/${index}`;
    const contains = isObject(entry) && isObject(entry.contains) ? entry.contains : undefined;
    const type = contains && isObject(contains.properties) && isObject(contains.properties.type) ? contains.properties.type.const : undefined;
    if (!isObject(entry) || entry.minContains !== 2 || "maxContains" in entry || !contains || type === undefined
      || !Array.isArray(contains.required) || !contains.required.includes("type")) {
      problem("marks", `${at} is not: contains one mark type, with required ["type"], at least twice (minContains 2, no maxContains)`);
      return;
    }
    guarded.set(type, (guarded.get(type) ?? 0) + 1);
    if (!markTypes.includes(type)) problem("marks", `${at} guards ${JSON.stringify(type)}, which is not a mark type`);
  });
  for (const type of markTypes) {
    const n = guarded.get(type) ?? 0;
    if (n !== 1) problem("marks", `${JSON.stringify(type)} has ${n} entries in #/$defs/pmMarks/not/anyOf, so ${n === 0 ? "a run of text may carry it twice" : "its entry is repeated"}`);
  }
  report.push(`marks: ${markTypes.length} mark types, ${guarded.size} of them at most once on a node`);
}

// --- 4. hierarchy ------------------------------------------------------------------------
{
  const widgetTypes = enumOf(defs.widgetType) ?? [];
  const expectedWidgets = blockTypes.filter((t) => t !== "section" && t !== "column");
  if (!sameList(widgetTypes, expectedWidgets)) problem("hierarchy", `widgetType is not blockType without section and column: ${JSON.stringify(widgetTypes)}`);
  const childType = (def: string): unknown => {
    const children = deref((deref(defs[def])?.properties as Obj | undefined)?.children);
    return isObject(children?.items) ? (children.items.properties as Obj | undefined)?.type : undefined;
  };
  const rootItems = (schema.properties as Obj | undefined)?.sections;
  const rootType = isObject(rootItems) && isObject(rootItems.items) ? (rootItems.items.properties as Obj | undefined)?.type : undefined;
  if (deref(rootType)?.const !== "section") problem("hierarchy", "the page does not hold sections only");
  if (deref(childType("sectionBlock"))?.const !== "column") problem("hierarchy", "a section does not hold columns only");
  const sectionChildren = deref((deref(defs.sectionBlock)?.properties as Obj | undefined)?.children);
  if (sectionChildren?.minItems !== 1 || sectionChildren.maxItems !== 4) problem("hierarchy", "a section does not hold one to four columns");
  if (!sameList(enumOf(childType("columnBlock")) ?? [], widgetTypes)) problem("hierarchy", "a column does not hold exactly the widget types");
  let leaves = 0;
  for (const type of widgetTypes) {
    const def = deref(defs[`${String(type)}Block`]);
    const children = (def?.properties as Obj | undefined)?.children;
    if (isObject(children) && children.$ref === "#/$defs/noChildren") leaves++;
    else problem("hierarchy", `${String(type)}Block may hold children`);
  }
  if (deref(defs.noChildren)?.maxItems !== 0) problem("hierarchy", "noChildren allows children");
  report.push(`hierarchy: page > section (1-4 columns) > column > ${widgetTypes.length} widget types, ${leaves} of them with no children`);

  // Column widths: sectionBlock has one branch per column count, keyed on
  // the length of children, naming the presets for that count or none.
  // Every count from one to four has exactly one branch, every preset has
  // as many parts as its branch has columns, and the branches offer the
  // whole of columnWidthsToken between them. A part is a whole share from
  // 1 to 9, or fit (as wide as the column's content); at least one part is
  // a share, which takes what the fit columns leave.
  //
  // A section of one column has nothing to share or to stack: its branch
  // forbids both a preset and stack, under one not (directly, or each in an
  // entry of the not's anyOf).
  const notRequires = (schemaNot: unknown, key: string): boolean => {
    if (!isObject(schemaNot)) return false;
    const entries = Array.isArray(schemaNot.anyOf) ? schemaNot.anyOf : [schemaNot];
    return entries.some((entry: unknown) => isObject(entry) && Array.isArray(entry.required) && entry.required.includes(key));
  };
  const presetsFor = new Map<number, unknown[]>();
  const stackForbidden = new Set<number>();
  const section = deref(defs.sectionBlock);
  for (const [index, branch] of (Array.isArray(section?.allOf) ? section.allOf : []).entries()) {
    const at = `#/$defs/sectionBlock/allOf/${index}`;
    const children = isObject(branch) && isObject(branch.if) && isObject(branch.if.properties) ? branch.if.properties.children : undefined;
    if (!isObject(children) || !isObject(branch) || !Array.isArray((branch.if as Obj).required) || !((branch.if as Obj).required as unknown[]).includes("children")) {
      problem("column widths", `${at}: the branch is not keyed on the number of children (with required ["children"])`);
      continue;
    }
    const props = isObject(branch.then) && isObject(branch.then.properties) ? branch.then.properties.props : undefined;
    const offered = isObject(props) && isObject(props.properties) ? enumOf(props.properties.columnWidths) : undefined;
    const forbids = isObject(props) && notRequires(props.not, "columnWidths");
    if (!offered && !forbids) problem("column widths", `${at}: the branch neither lists presets nor forbids them`);
    const low = Math.max(typeof children.minItems === "number" ? children.minItems : 0, 1);
    const high = Math.min(typeof children.maxItems === "number" ? children.maxItems : 4, 4);
    for (let count = low; count <= high; count++) {
      if (presetsFor.has(count)) problem("column widths", `${count} column(s) have two branches`);
      presetsFor.set(count, offered ?? []);
      if (isObject(props) && notRequires(props.not, "stack")) stackForbidden.add(count);
    }
  }
  const allPresets = enumOf(defs.columnWidthsToken) ?? [];
  const offeredPresets = new Set<unknown>();
  for (let count = 1; count <= 4; count++) {
    if (!presetsFor.has(count)) problem("column widths", `no branch says which presets ${count} column(s) take`);
    for (const preset of presetsFor.get(count) ?? []) {
      offeredPresets.add(preset);
      const parts = typeof preset === "string" ? preset.split(":") : [];
      if (parts.length !== count) problem("column widths", `${JSON.stringify(preset)} is offered to ${count} column(s) and has ${parts.length} parts`);
      if (!parts.every((p) => /^(?:[1-9]|fit)$/.test(p))) problem("column widths", `${JSON.stringify(preset)} is not parts from 1 to 9, or fit, joined by colons`);
      if (!parts.some((p) => /^[1-9]$/.test(p))) problem("column widths", `${JSON.stringify(preset)} has no share: every column would be as wide as its content, and none would take the rest`);
      if (!allPresets.includes(preset)) problem("column widths", `${JSON.stringify(preset)} is not in $defs/columnWidthsToken`);
    }
  }
  for (const preset of allPresets) if (!offeredPresets.has(preset)) problem("column widths", `${JSON.stringify(preset)} is in $defs/columnWidthsToken but offered to no column count`);
  const stackOffered = isObject(deref((deref(defs.sectionBlock)?.properties as Obj | undefined)?.props)?.properties) &&
    "stack" in (deref((deref(defs.sectionBlock)?.properties as Obj | undefined)?.props)?.properties as Obj);
  if (!stackOffered) problem("column widths", "a section's props do not name stack");
  if (!stackForbidden.has(1)) problem("column widths", "a section of one column may name where its columns stack");
  for (const count of [2, 3, 4]) if (stackForbidden.has(count)) problem("column widths", `a section of ${count} columns may not name where they stack`);
  report.push(`column widths: ${[1, 2, 3, 4].map((n) => `${n} column${n > 1 ? "s" : ""}: ${(presetsFor.get(n) ?? []).length || "no"} preset(s)`).join(", ")}; ${offeredPresets.size}/${allPresets.length} presets offered; stack named from 2 columns`);
}

// --- 5. tokens ---------------------------------------------------------------------------
{
  const tokens = JSON.parse(readFileSync(join(SCHEMA_DIR, "tokens.json"), "utf8")) as Obj;
  const space = (tokens.space ?? {}) as Obj;
  const type = ((tokens.type ?? {}) as Obj).site as Obj | undefined;
  const steps = Object.entries(type ?? {}).filter(([, v]) => isObject(v) && Array.isArray(v.desktop)).map(([k]) => k);
  // The space above and below a section is a spacing step or a section
  // step: both lists, in that order.
  const checks: Array<[string, unknown[], string[]]> = [
    ["spaceToken", enumOf(defs.spaceToken) ?? [], Object.keys((space.site ?? {}) as Obj)],
    ["sectionSpaceToken", enumOf(defs.sectionSpaceToken) ?? [], [...Object.keys((space.site ?? {}) as Obj), ...Object.keys((space["site-section"] ?? {}) as Obj)]],
    ["typeStep", enumOf(defs.typeStep) ?? [], steps],
  ];
  // The crops: the schema's names are the keys of aspect.site, and each
  // value is the CSS aspect-ratio its name says ("16:9" is "16 / 9",
  // original is auto), so the stylesheet cannot crop to another shape.
  const aspects = (((tokens.aspect ?? {}) as Obj).site ?? {}) as Obj;
  checks.push(["aspectToken", enumOf(defs.aspectToken) ?? [], Object.keys(aspects)]);
  for (const [name, value] of Object.entries(aspects)) {
    const ratio = /^([1-9][0-9]?):([1-9][0-9]?)$/.exec(name);
    const want = name === "original" ? "auto" : ratio ? `${ratio[1]} / ${ratio[2]}` : undefined;
    if (want === undefined) problem("tokens", `aspect.site has the crop ${JSON.stringify(name)}, which is neither original nor width:height`);
    else if (value !== want) problem("tokens", `aspect.site/${name} is ${JSON.stringify(value)}, not ${JSON.stringify(want)}`);
  }
  // The palette slots: the schema's names are the keys of site-tones, and a
  // background is "none" or a slot. Each slot's tones are colours tokens.json
  // defines, and its default is one of its tones: the server reads the same
  // list to accept or refuse a site style.
  const siteTones = (tokens["site-tones"] ?? {}) as Obj;
  const slots = Object.keys(siteTones).filter((k) => !k.startsWith("$"));
  checks.push(["paletteSlot", enumOf(defs.paletteSlot) ?? [], slots]);
  checks.push(["backgroundToken", enumOf(defs.backgroundToken) ?? [], ["none", ...slots]]);
  const colors = (tokens.color ?? {}) as Obj;
  let tones = 0;
  for (const slot of slots) {
    const entry = siteTones[slot];
    const list = isObject(entry) && Array.isArray(entry.tones) ? entry.tones : [];
    if (list.length === 0) problem("tokens", `site-tones/${slot} has no tones`);
    const names = list.map((t) => (isObject(t) ? t.color : undefined));
    for (const name of names) {
      tones++;
      if (typeof name !== "string" || typeof colors[name] !== "string") problem("tokens", `site-tones/${slot} names the tone ${JSON.stringify(name)}, which is not a colour of tokens.json`);
    }
    if (!isObject(entry) || !names.includes(entry.default)) problem("tokens", `site-tones/${slot} has a default that is not one of its tones`);
  }
  const scale = (tokens["site-type-scale"] ?? {}) as Obj;
  const choices = Array.isArray(scale.choices) ? scale.choices.map((c) => (isObject(c) ? c.name : undefined)) : [];
  if (choices.length === 0) problem("tokens", "site-type-scale has no choices");
  if (!choices.includes(scale.default)) problem("tokens", "site-type-scale has a default that is not one of its choices");
  // Each choice draws a scale of its own under type: every step of
  // typeStep, on every device, each size smaller than the one above it,
  // and no two choices with the same size for a heading on any device:
  // a choice that changed nothing would be a name without sizes.
  const allTypes = (tokens.type ?? {}) as Obj;
  const stepOrder = (enumOf(defs.typeStep) ?? []) as string[];
  const drawn = new Map<string, Obj>();
  for (const choice of Array.isArray(scale.choices) ? scale.choices : []) {
    const name = isObject(choice) ? String(choice.name) : "?";
    const key = isObject(choice) ? choice.steps : undefined;
    const drawing = typeof key === "string" ? allTypes[key] : undefined;
    if (!isObject(drawing)) {
      problem("tokens", `site-type-scale/${name} names the scale ${JSON.stringify(key)}, which type does not have`);
      continue;
    }
    drawn.set(name, drawing);
    for (const device of ["desktop", "tablet", "phone"]) {
      const sizes = stepOrder.map((step) => {
        const entry = drawing[step];
        const pair = isObject(entry) ? entry[device] : undefined;
        return Array.isArray(pair) && typeof pair[0] === "number" && typeof pair[1] === "number" ? pair[0] : undefined;
      });
      stepOrder.forEach((step, k) => {
        if (sizes[k] === undefined) problem("tokens", `type.${String(key)} has no [size, line height] for ${step} on ${device}`);
        else if (k > 0 && sizes[k - 1] !== undefined && !((sizes[k - 1] as number) > (sizes[k] as number))) {
          problem("tokens", `type.${String(key)} on ${device}: ${step} (${sizes[k]}) is not smaller than ${stepOrder[k - 1]} (${sizes[k - 1]})`);
        }
      });
    }
  }
  for (const step of stepOrder.filter((s) => s.startsWith("heading") || s === "display")) {
    for (const device of ["desktop", "tablet", "phone"]) {
      const seen = new Map<number, string>();
      for (const [name, drawing] of drawn) {
        const pair = isObject(drawing[step]) ? (drawing[step] as Obj)[device] : undefined;
        const size = Array.isArray(pair) ? pair[0] : undefined;
        if (typeof size !== "number") continue;
        if (seen.has(size)) problem("tokens", `${name} and ${seen.get(size)} give ${step} the same size on ${device} (${size})`);
        seen.set(size, name);
      }
    }
  }
  // How wide the Headings typeface is drawn: a default among the choices,
  // and each of a choice's three widths a percentage on Archivo's width
  // axis, which tokens.css draws the faces at.
  const widths = (tokens["site-letter-width"] ?? {}) as Obj;
  const widthChoices = Array.isArray(widths.choices) ? widths.choices.filter(isObject) : [];
  if (widthChoices.length === 0) problem("tokens", "site-letter-width has no choices");
  if (!widthChoices.some((choice) => choice.name === widths.default)) problem("tokens", "site-letter-width has a default that is not one of its choices");
  for (const choice of widthChoices) {
    for (const part of ["display", "strong", "ui"]) {
      const value = choice[part];
      const percent = typeof value === "string" && /^\d+(\.\d+)?%$/.test(value) ? Number.parseFloat(value) : Number.NaN;
      if (!(percent >= 62 && percent <= 125)) problem("tokens", `site-letter-width/${String(choice.name)} gives ${part} ${JSON.stringify(value)}, not a width of Archivo's axis (62% to 125%)`);
    }
  }
  for (const [name, values, names] of checks) {
    if (names.length === 0) problem("tokens", `tokens.json has no names for $defs/${name}`);
    if (!sameList(values, names)) problem("tokens", `$defs/${name} is ${JSON.stringify(values)}, tokens.json has ${JSON.stringify(names)}`);
  }
  report.push(`tokens: ${checks.map(([name, , names]) => `${name} = ${names.length} names`).join(", ")} from tokens.json; ${tones} tones over ${slots.length} slots, ${choices.length} type-scale choices, ${drawn.size} of them drawn, ${widthChoices.length} letter widths`);
}

// --- 6. the schema in both engines, and the README example -------------------------------
{
  try {
    makeAjv().compile(schema);
  } catch (e) {
    problem("schema", `ajv refuses the schema: ${e instanceof Error ? e.message : String(e)}`);
  }
  for (const e of answer?.schemaErrors ?? []) problem("schema", `json_schemer: ${e}`);
  const readme = readFileSync(readmePath, "utf8");
  const block = /```json\r?\n([\s\S]*?)\r?\n```/.exec(readme);
  const canonical = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
    if (isObject(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
    return JSON.stringify(v);
  };
  if (!block) {
    problem("readme", "schema/README.md has no json example");
  } else {
    const fromReadme = canonical(JSON.parse(block[1] as string));
    const fromCorpus = canonical(JSON.parse(readFileSync(join(CORPUS, "valid", "readme-example.json"), "utf8")));
    if (fromReadme !== fromCorpus) problem("readme", "the example in schema/README.md is not valid/readme-example.json");
  }
  report.push(`schema: compiled by ajv, ${answer ? `${answer.schemaErrors.length} meta-schema error(s) from json_schemer` : "json_schemer did not answer"}; README example ${block ? "compared with the corpus" : "missing"}`);
}

// --- report ---------------------------------------------------------------------------------
console.log(`schema: ${schemaPath === SCHEMA ? "block-document.schema.json" : schemaPath}`);
for (const line of report) console.log(line);
if (problems.length > 0) {
  console.log(`RESULT: FAIL (${problems.length})`);
  for (const p of problems.slice(0, 60)) console.log(`  - ${p}`);
  if (problems.length > 60) console.log(`  ... and ${problems.length - 60} more`);
  process.exit(1);
}
console.log("RESULT: PASS");
