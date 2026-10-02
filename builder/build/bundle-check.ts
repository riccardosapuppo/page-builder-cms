// Reads the bundle `vite build` wrote and fails the build when it holds
// what a browser bundle of this project must not:
// - eval, new Function or a bare Function() call: code built from strings
//   at run time, which a Content-Security-Policy without 'unsafe-eval'
//   refuses (ajv does it unless its validator is compiled ahead of time);
// - require(), which a browser cannot run (ajv's standalone output leaves
//   some unless build/validator.ts replaces them);
// - a font without its licence file beside it.
// The JavaScript is parsed, not searched as text, so a string that merely
// spells require(...) (ajv's runtime helpers carry one, describing
// themselves) is not a call, and obj.eval() is not eval.
// It also fails when what it inspects is not there: the schema's validator
// missing from the JavaScript, or one of the four fonts missing, would make
// the other checks pass by looking at nothing.
import { parseSync, Visitor, type Plugin, type Rolldown } from "vite";

export interface BundleFile {
  fileName: string;
  text: string;
}

export interface BundleReport {
  problems: string[];
  summary: string;
}

// A path of the compiled validator's error objects: in the bundle exactly
// when the schema's validator is.
export const VALIDATOR_MARKER = "#/$defs/blockId/pattern";
export const EXPECTED_FONTS = [
  "archivo-variable",
  "source-serif-4-variable",
  "source-serif-4-variable-italic",
  "instrument-sans-variable",
] as const;
const LICENCE_OF: Record<(typeof EXPECTED_FONTS)[number], string> = {
  "archivo-variable": "LICENSE-Archivo.txt",
  "source-serif-4-variable": "LICENSE-SourceSerif4.txt",
  "source-serif-4-variable-italic": "LICENSE-SourceSerif4.txt",
  "instrument-sans-variable": "LICENSE-InstrumentSans.txt",
};

const GLOBAL_OBJECTS = new Set(["window", "globalThis", "self"]);
type Counts = Record<"eval()" | "Function()" | "new Function()" | "require()", number>;

interface Callee {
  type: string;
  name?: string;
  computed?: boolean;
  object?: { type: string; name?: string };
  property?: { type: string; name?: string; value?: unknown };
}

// eval(...), window.eval(...), globalThis["eval"](...): the name called, or undefined.
function calledName(callee: Callee): string | undefined {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.object?.type === "Identifier" && GLOBAL_OBJECTS.has(callee.object.name ?? "")) {
    const property = callee.property;
    if (!callee.computed && property?.type === "Identifier") return property.name;
    if (callee.computed && property?.type === "Literal" && typeof property.value === "string") return property.value;
  }
  return undefined;
}

// Every call of eval, Function and require in one JavaScript file.
export function forbiddenCalls(fileName: string, code: string): { counts: Counts; found: string[] } {
  const counts: Counts = { "eval()": 0, "Function()": 0, "new Function()": 0, "require()": 0 };
  const found: string[] = [];
  const parsed = parseSync(fileName, code);
  if (parsed.errors.length > 0) {
    found.push(`${fileName}: cannot be parsed, so it cannot be checked: ${parsed.errors[0]?.message}`);
    return { counts, found };
  }
  const record = (label: keyof Counts, start: number) => {
    counts[label] += 1;
    found.push(`${fileName}: ${label} at ${start}: ${code.slice(Math.max(0, start - 30), start + 50)}`);
  };
  new Visitor({
    CallExpression(node) {
      const name = calledName(node.callee as Callee);
      if (name === "eval") record("eval()", node.start);
      if (name === "Function") record("Function()", node.start);
      if (name === "require") record("require()", node.start);
    },
    NewExpression(node) {
      if (calledName(node.callee as Callee) === "Function") record("new Function()", node.start);
    },
  }).visit(parsed.program);
  return { counts, found };
}

export function checkBundle(files: BundleFile[]): BundleReport {
  const problems: string[] = [];
  const scripts = files.filter((f) => f.fileName.endsWith(".js"));
  const bytes = scripts.reduce((sum, f) => sum + Buffer.byteLength(f.text), 0);
  const total: Counts = { "eval()": 0, "Function()": 0, "new Function()": 0, "require()": 0 };
  for (const file of scripts) {
    const { counts, found } = forbiddenCalls(file.fileName, file.text);
    for (const label of Object.keys(total) as Array<keyof Counts>) total[label] += counts[label];
    problems.push(...found);
  }
  if (scripts.length === 0) problems.push("no JavaScript file in the bundle");
  const validatorIn = scripts.filter((f) => f.text.includes(VALIDATOR_MARKER)).map((f) => f.fileName);
  if (validatorIn.length === 0) problems.push("the schema's validator is not in the bundle: the scan looked at no validator code");

  const names = files.map((f) => f.fileName);
  let licensed = 0;
  for (const font of EXPECTED_FONTS) {
    const file = names.find((name) => new RegExp(`(^|/)${font}-[A-Za-z0-9_-]+\\.woff2$`).test(name));
    if (!file) {
      problems.push(`${font}.woff2 is not in the bundle`);
      continue;
    }
    const folder = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
    if (names.includes(folder + LICENCE_OF[font])) licensed += 1;
    else problems.push(`${file} has no ${LICENCE_OF[font]} beside it`);
  }

  const summary = `bundle check: ${scripts.length} JavaScript file(s), ${(bytes / 1024).toFixed(1)} KiB, parsed; `
    + Object.entries(total).map(([label, count]) => `${label} ${count}`).join(", ")
    + `; validator in ${validatorIn.join(", ") || "none"}; fonts with their licence: ${licensed}/${EXPECTED_FONTS.length}`;
  return { problems, summary };
}

export function filesOf(bundle: Rolldown.OutputBundle): BundleFile[] {
  return Object.values(bundle).map((output) => ({
    fileName: output.fileName,
    text: output.type === "chunk" ? output.code : typeof output.source === "string" ? output.source : "",
  }));
}

export function bundleCheck(): Plugin {
  return {
    name: "page-builder-cms:bundle-check",
    apply: "build",
    // After every other plugin has added its files, the CSS and the
    // licences included.
    writeBundle(_options, bundle) {
      const report = checkBundle(filesOf(bundle));
      this.info(report.summary);
      if (report.problems.length > 0) this.error(`the bundle failed its check:\n  ${report.problems.join("\n  ")}`);
    },
  };
}
