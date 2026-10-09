// Runs both validators over the corpus and compares them:
//   validate.ts  ajv, after rules.ts                  (the editor)
//   validate.rb  json_schemer, after rules.rb, through the app's bundle (the server)
//
// It fails (exit 1) on:
//   - a verdict the two engines disagree on;
//   - an exception in either runner: an exception is never a verdict;
//   - a missing, repeated or unknown result, or a runner that exits non-zero;
//   - fewer corpus files than the manifest lists, a file the manifest does
//     not list, or fewer than --min-files files in all;
//   - a verdict against the folder (valid/ must pass, invalid/ must fail);
//   - an invalid file where either engine does not report the manifest's
//     {pointer, keyword}: a trap must be refused for its own reason;
//   - a document the two languages normalise differently (2.0 must be the
//     integer 2 on both sides);
//   - a file in upgrade/ while schemaVersion 1 has no upgrade step.
// It reports, without failing, how many invalid files get identical error
// sets from both engines.
//
//   node compare.ts [--corpus DIR] [--schema PATH] [--def NAME] [--min-files N]
//                   [--rules off] [--regexp ruby] [--drop-ruby FILE]
//                   [--ruby-normalize off]
//
// --def holds both engines to $defs/NAME instead of the root: the site's
// header and footer, $defs/site, with its own corpus (npm run compare:site).
// The last four exist to show the comparator failing; see README.md.
import { spawnSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { CMS_GEMFILE, CORPUS, SCHEMA, TOOLS, argValue, listCorpus, readManifest, type ReportedError, type ResultLine } from "./corpus.ts";
import { escapePointer } from "./rules.ts";

const argv = process.argv.slice(2);
const corpus = argValue(argv, "--corpus", CORPUS);
const schema = argValue(argv, "--schema", SCHEMA);
const def = argValue(argv, "--def", "");
const minFiles = Number(argValue(argv, "--min-files", "60"));
const rules = argValue(argv, "--rules", "on");
const regexp = argValue(argv, "--regexp", "ecma");
const dropRuby = argValue(argv, "--drop-ruby", "");
const rubyNormalize = argValue(argv, "--ruby-normalize", "on");
const timeout = 600_000;

const failures: string[] = [];
const fail = (message: string): void => {
  failures.push(message);
};

// --- the corpus and its manifest ---------------------------------------------------
const files = listCorpus(corpus);
const manifest = readManifest(corpus);
const listed = Object.keys(manifest);
for (const name of listed) if (!files.includes(name)) fail(`the manifest lists ${name}, which is not in the corpus`);
for (const name of files) if (!(name in manifest)) fail(`${name} is in the corpus but not in the manifest`);
if (files.length < listed.length) fail(`${files.length} files in the corpus, fewer than the ${listed.length} the manifest lists`);
if (files.length < minFiles) fail(`only ${files.length} files in the corpus (at least ${minFiles} required)`);
const upgrade = files.filter((f) => f.startsWith("upgrade/"));
if (upgrade.length > 0) fail(`upgrade/ holds ${upgrade.length} file(s), but schemaVersion 1 has no upgrade step to run on them`);

// --- the two runners -------------------------------------------------------------------
interface Run {
  label: string;
  header: Record<string, unknown>;
  results: Map<string, ResultLine>;
  seconds: number;
}

function run(label: string, command: string, args: string[], env: NodeJS.ProcessEnv): Run {
  const started = Date.now();
  const r = spawnSync(command, args, { cwd: TOOLS, env, encoding: "utf8", maxBuffer: 1 << 30, timeout, killSignal: "SIGKILL" });
  const seconds = (Date.now() - started) / 1000;
  const out: Run = { label, header: {}, results: new Map(), seconds };
  if (r.error) {
    fail(`${label}: could not run ${command}: ${r.error.message}`);
    return out;
  }
  if (r.status !== 0) fail(`${label}: exited with status ${r.status}${r.signal ? ` (${r.signal})` : ""}: ${r.stderr.trim().slice(0, 600)}`);
  else if (r.stderr.trim()) console.log(`[${label} stderr] ${r.stderr.trim().slice(0, 600)}`);
  for (const raw of r.stdout.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let parsed: ResultLine & Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as ResultLine & Record<string, unknown>;
    } catch {
      fail(`${label}: unreadable output line: ${raw.slice(0, 120)}`);
      continue;
    }
    if (typeof parsed.file !== "string") {
      out.header = parsed;
      continue;
    }
    if (out.results.has(parsed.file)) fail(`${label}: two results for ${parsed.file}`);
    if (!files.includes(parsed.file)) fail(`${label}: a result for ${parsed.file}, which is not in the corpus`);
    out.results.set(parsed.file, parsed);
  }
  for (const name of files) if (!out.results.has(name)) fail(`${label}: no result for ${name}`);
  return out;
}

const common = ["--corpus", corpus, "--schema", schema, "--rules", rules, ...(def ? ["--def", def] : [])];
const ajv = run("ajv", process.execPath, [join(TOOLS, "validate.ts"), ...common], process.env);
const rubyArgs = [
  join(TOOLS, "validate.rb"), ...common, "--regexp", regexp, "--normalize", rubyNormalize,
  ...(dropRuby ? ["--skip-file", dropRuby] : []),
];
const schemer = run("json_schemer", process.env.RUBY ?? "ruby", rubyArgs, { ...process.env, BUNDLE_GEMFILE: CMS_GEMFILE });

// --- error sets, normalised as the prototype found necessary ---------------------------
// 1. ajv reports additionalProperties at the object, json_schemer at the
//    property: append the property to ajv's pointer.
// 2. ajv adds an "if" error at every block whose then-branch failed: drop it.
// 3. ajv reports required once per missing key, json_schemer once per
//    object: compare sets, not lists.
// How often each normalisation applied, counted on the invalid files, so a
// normalisation that never fires is visible.
const applied = {
  errors: { ajv: 0, json_schemer: 0 },
  ifDropped: 0,
  pointerExtended: 0,
  merged: { ajv: 0, json_schemer: 0 },
};
function errorSet(errors: readonly ReportedError[] | undefined, engine: "ajv" | "json_schemer", count = false): Set<string> {
  const set = new Set<string>();
  for (const e of errors ?? []) {
    if (count) applied.errors[engine]++;
    if (engine === "ajv" && e.keyword === "if") {
      if (count) applied.ifDropped++;
      continue;
    }
    const extend = engine === "ajv" && e.keyword === "additionalProperties" && e.property !== undefined;
    if (extend && count) applied.pointerExtended++;
    const entry = `${extend ? `${e.pointer}/${escapePointer(e.property as string)}` : e.pointer} ${e.keyword}`;
    if (set.has(entry) && count) applied.merged[engine]++;
    set.add(entry);
  }
  return set;
}
const sameSet = (a: Set<string>, b: Set<string>): boolean => a.size === b.size && [...a].every((x) => b.has(x));

// --- normalised documents, compared with their number types ----------------------------
// JSON.parse loses the difference between 2 and 2.0, which is the point of
// the comparison, so numbers are read from their source text.
class NumberText {
  source: string;
  constructor(source: string) {
    this.source = source;
  }
}
function typedForm(text: string): string {
  const value: unknown = JSON.parse(text, (_key: string, v: unknown, context?: { source?: string }) => {
    if (typeof v !== "number") return v;
    if (context?.source === undefined) throw new Error("this Node has no JSON.parse source text access");
    return new NumberText(context.source);
  });
  const canonical = (v: unknown): string => {
    if (v instanceof NumberText) return /^-?[0-9]+$/.test(v.source) ? `int:${BigInt(v.source)}` : `float:${Number(v.source)}`;
    if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
    if (v !== null && typeof v === "object") {
      const entries = Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
    }
    return JSON.stringify(v);
  };
  return canonical(value);
}

// --- comparison ---------------------------------------------------------------------------
let compared = 0;
let disagreements = 0;
let againstFolder = 0;
let exceptions = 0;
let invalidCompared = 0;
const expectedHit = { ajv: 0, json_schemer: 0 };
const identical = { all: 0, rules: 0, rulesOf: 0, schema: 0, schemaOf: 0 };
const differingSets: string[] = [];
let normalisedCompared = 0;

for (const file of files) {
  const a = ajv.results.get(file);
  const b = schemer.results.get(file);
  if (!a || !b) continue;
  if (a.exception !== undefined || b.exception !== undefined) {
    // The runner, not only the engine: the exception may come from the
    // parser, the rules or the serialiser around it.
    if (a.exception !== undefined) fail(`the ajv side raised on ${file}: ${a.exception}`);
    if (b.exception !== undefined) fail(`the json_schemer side raised on ${file}: ${b.exception}`);
    exceptions += (a.exception !== undefined ? 1 : 0) + (b.exception !== undefined ? 1 : 0);
    continue;
  }
  compared++;
  if (a.valid !== b.valid) {
    disagreements++;
    fail(`verdicts differ on ${file}: ajv ${a.valid ? "valid" : "invalid"}, json_schemer ${b.valid ? "valid" : "invalid"}`
      + `\n      ajv:          ${[...errorSet(a.errors, "ajv")].slice(0, 4).join("; ")}`
      + `\n      json_schemer: ${[...errorSet(b.errors, "json_schemer")].slice(0, 4).join("; ")}`);
  }
  const expectValid = file.startsWith("valid/");
  for (const [label, r] of [["ajv", a], ["json_schemer", b]] as const) {
    if (r.valid !== expectValid) {
      againstFolder++;
      fail(`${label} calls ${file} ${r.valid ? "valid" : "invalid"}, against its folder`);
    }
  }

  // Both languages must hand the schema the same document.
  if ((a.normalized === null) !== (b.normalized === null)) {
    fail(`only one side's rules accepted ${file}`);
  } else if (typeof a.normalized === "string" && typeof b.normalized === "string") {
    normalisedCompared++;
    if (typedForm(a.normalized) !== typedForm(b.normalized)) fail(`the normalised documents differ on ${file}`);
  }

  if (expectValid || a.valid || b.valid) continue;
  invalidCompared++;
  const sa = errorSet(a.errors, "ajv", true);
  const sb = errorSet(b.errors, "json_schemer", true);
  const entry = manifest[file];
  if (entry?.pointer !== undefined && entry.keyword !== undefined) {
    const want = `${entry.pointer} ${entry.keyword}`;
    if (sa.has(want)) expectedHit.ajv++;
    else fail(`ajv does not report ${entry.keyword} at "${entry.pointer}" on ${file}`);
    if (sb.has(want)) expectedHit.json_schemer++;
    else fail(`json_schemer does not report ${entry.keyword} at "${entry.pointer}" on ${file}`);
  } else {
    fail(`the manifest gives no pointer and keyword for ${file}`);
  }
  const same = sameSet(sa, sb);
  const layer = a.layer === "rules" && b.layer === "rules" ? "rules" : "schema";
  if (layer === "rules") identical.rulesOf++;
  else identical.schemaOf++;
  if (same) {
    identical.all++;
    if (layer === "rules") identical.rules++;
    else identical.schema++;
  } else {
    const onlyA = [...sa].filter((x) => !sb.has(x));
    const onlyB = [...sb].filter((x) => !sa.has(x));
    differingSets.push(`${file}\n      only ajv:          ${onlyA.join("; ") || "-"}\n      only json_schemer: ${onlyB.join("; ") || "-"}`);
  }
}

// --- report -----------------------------------------------------------------------------
const count = (prefix: string): number => files.filter((f) => f.startsWith(prefix)).length;
const describe = (r: Run): string =>
  [r.header.engine, r.header.parser, r.header.runtime, typeof r.header.bundle === "string" ? `bundle ${r.header.bundle}` : undefined]
    .filter((x) => typeof x === "string").join(", ") || "(no header)";
const shown = (path: string): string => relative(TOOLS, path).split(sep).join("/");
console.log(`schema:  ${shown(schema)}${def ? `#/$defs/${def}` : ""}`);
// Each runner says what it validated against: a runner that ignored --def
// would check the wrong schema and could still agree with the other.
for (const r of [ajv, schemer]) if ((r.header.def ?? "") !== def) fail(`${r.label} validated against ${r.header.def ? `$defs/${String(r.header.def)}` : "the root"}, not ${def ? `$defs/${def}` : "the root"}`);
console.log(`corpus:  ${shown(corpus)}: ${files.length} files (${count("valid/")} valid, ${count("invalid/")} invalid, ${count("upgrade/")} upgrade); the manifest lists ${listed.length}`);
console.log(`ajv:          ${describe(ajv)}; ${ajv.results.size} results in ${ajv.seconds.toFixed(1)} s`);
console.log(`json_schemer: ${describe(schemer)}, regexp resolver ${regexp}; ${schemer.results.size} results in ${schemer.seconds.toFixed(1)} s`);
console.log(`rules:   ${rules}; Ruby normalisation: ${rubyNormalize}`);
console.log(`verdicts compared: ${compared}; disagreements: ${disagreements}; against the folder: ${againstFolder}; exceptions: ${exceptions}`);
console.log(`expected {pointer, keyword} reported: ajv ${expectedHit.ajv}/${invalidCompared}, json_schemer ${expectedHit.json_schemer}/${invalidCompared}`);
console.log(`identical {pointer, keyword} sets: ${identical.all}/${invalidCompared} invalid files`
  + ` (refused by the rules: ${identical.rules}/${identical.rulesOf}; by the schema: ${identical.schema}/${identical.schemaOf})`);
console.log(`errors on the invalid files: ajv ${applied.errors.ajv}, json_schemer ${applied.errors.json_schemer};`
  + ` normalised: ${applied.ifDropped} ajv "if" errors dropped, ${applied.pointerExtended} ajv additionalProperties pointers extended,`
  + ` repeated {pointer, keyword} merged: ajv ${applied.merged.ajv}, json_schemer ${applied.merged.json_schemer}`);
for (const d of differingSets) console.log(`  DIFFERENT SET ${d}`);
console.log(`normalised documents with the same numbers and values: ${normalisedCompared - failures.filter((f) => f.startsWith("the normalised")).length}/${normalisedCompared}`);

if (failures.length > 0) {
  console.log(`RESULT: FAIL (${failures.length})`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`RESULT: PASS (${compared} files, 0 disagreements, 0 exceptions)`);
