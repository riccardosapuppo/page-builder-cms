// The bundle check, on bundles made up for it: it must find each kind of
// forbidden call, ignore what only looks like one, and refuse a bundle in
// which what it inspects is missing. `npm run build` runs it on the real
// bundle.
import { describe, expect, test } from "vitest";
import { checkBundle, EXPECTED_FONTS, forbiddenCalls, VALIDATOR_MARKER } from "./bundle-check.ts";

const fonts = EXPECTED_FONTS.map((font) => ({ fileName: `assets/${font}-Ab12_c.woff2`, text: "" }));
const licences = ["LICENSE-Archivo.txt", "LICENSE-SourceSerif4.txt", "LICENSE-InstrumentSans.txt"].map((name) => ({ fileName: `assets/${name}`, text: "OFL" }));
const validator = { fileName: "assets/index-1.js", text: `const p={schemaPath:"${VALIDATOR_MARKER}"};export{p};` };

describe("the bundle check", () => {
  test("finds every way of building code from a string, and require()", () => {
    const code = [
      'eval("1");',
      'window.eval("2");',
      'globalThis["eval"]("3");',
      'new Function("return 4");',
      'Function("return 5")();',
      'new self.Function("return 6");',
      'require("seven");',
    ].join("\n");
    const { counts, found } = forbiddenCalls("planted.js", code);
    expect(counts).toEqual({ "eval()": 3, "Function()": 1, "new Function()": 2, "require()": 1 });
    expect(found).toHaveLength(7);
  });

  test("does not count what only looks like a call", () => {
    const code = [
      // ajv's runtime helpers describe themselves in a string.
      't.code = `require("ajv/dist/runtime/ucs2length").default`;',
      'const s = "eval(1) and new Function()";',
      "obj.eval(1); widget.require(2); thing.Function(3);",
      "function local(require) { return require; }",
    ].join("\n");
    expect(forbiddenCalls("lookalikes.js", code).found).toEqual([]);
  });

  test("passes a bundle with the validator, the four fonts and their licences", () => {
    const report = checkBundle([validator, ...fonts, ...licences]);
    expect(report.problems).toEqual([]);
    expect(report.summary).toContain("fonts with their licence: 4/4");
  });

  test("fails a bundle without the validator, without a font, or with a font and no licence", () => {
    expect(checkBundle([{ fileName: "assets/index-1.js", text: "export{};" }, ...fonts, ...licences]).problems)
      .toEqual(["the schema's validator is not in the bundle: the scan looked at no validator code"]);
    expect(checkBundle([validator, ...fonts.slice(1), ...licences]).problems).toEqual(["archivo-variable.woff2 is not in the bundle"]);
    expect(checkBundle([validator, ...fonts, ...licences.slice(0, 2)]).problems)
      .toEqual(["assets/instrument-sans-variable-Ab12_c.woff2 has no LICENSE-InstrumentSans.txt beside it"]);
    expect(checkBundle([]).problems).toContain("no JavaScript file in the bundle");
  });

  test("fails on a planted call in an otherwise good bundle", () => {
    const planted = { fileName: "assets/vendor-2.js", text: 'export const run = (s) => new Function(s);' };
    const report = checkBundle([validator, planted, ...fonts, ...licences]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toMatch(/^assets\/vendor-2\.js: new Function\(\) at /);
  });
});
