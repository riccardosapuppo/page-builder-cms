// The bundle check, on bundles made up for it: it must find each kind of
// forbidden call, ignore what only looks like one, and refuse a bundle in
// which what it inspects is missing. `npm run build` runs it on the real
// bundle.
import { describe, expect, test } from "vitest";
import { checkBundle, EXPECTED_FONTS, forbiddenCalls, MARKS, VALIDATOR_MARKER } from "./bundle-check.ts";

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

  test("holds each build to its own storage: its mark there, the other's and the CMS's address not", () => {
    const rails = { fileName: "assets/rails-3.js", text: `const r={startUpload:{path:"${MARKS.rails}"}},o="http://${MARKS.cmsAddress}";export{r,o};` };
    const browser = { fileName: "assets/browser-4.js", text: `const b=\`${MARKS.browser}/\${1}\`,l="${MARKS.demo} The full CMS runs on Rails 8.";export{b,l};` };
    const good = [validator, ...fonts, ...licences];
    expect(checkBundle([...good, rails], "rails").problems).toEqual([]);
    expect(checkBundle([...good, browser], "browser").problems).toEqual([]);
    expect(checkBundle([...good, browser], "browser").summary).toContain(`storage browser, with ${MARKS.browser} and ${MARKS.demo}`);
    // Both adapters in one bundle, as a choice made at run time leaves them.
    expect(checkBundle([...good, rails, browser], "rails").problems).toEqual([
      `the rails build holds "${MARKS.browser}", which only the other storage's build may, in assets/browser-4.js`,
      `the rails build holds "${MARKS.demo}", which only the other storage's build may, in assets/browser-4.js`,
    ]);
    expect(checkBundle([...good, rails, browser], "browser").problems).toEqual([
      `the browser build holds "${MARKS.rails}", which only the other storage's build may, in assets/rails-3.js`,
      `the browser build holds "${MARKS.cmsAddress}", which only the other storage's build may, in assets/rails-3.js`,
    ]);
    // The CMS's address alone, without its adapter, is still refused in the demo.
    expect(checkBundle([...good, browser, { fileName: "assets/config-5.js", text: `const d="http://${MARKS.cmsAddress}";export{d};` }], "browser").problems)
      .toEqual([`the browser build holds "${MARKS.cmsAddress}", which only the other storage's build may, in assets/config-5.js`]);
    // A build without its own storage's code looked at nothing.
    expect(checkBundle(good, "rails").problems).toEqual([`the rails build has no "${MARKS.rails}": its own storage's code is not in the bundle`]);
    expect(checkBundle([...good, { fileName: "assets/b.js", text: `const b="${MARKS.browser}";export{b};` }], "browser").problems)
      .toEqual([`the browser build has no "${MARKS.demo}": its own storage's code is not in the bundle`]);
  });

  test("fails on a planted call in an otherwise good bundle", () => {
    const planted = { fileName: "assets/vendor-2.js", text: 'export const run = (s) => new Function(s);' };
    const report = checkBundle([validator, planted, ...fonts, ...licences]);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toMatch(/^assets\/vendor-2\.js: new Function\(\) at /);
  });
});
