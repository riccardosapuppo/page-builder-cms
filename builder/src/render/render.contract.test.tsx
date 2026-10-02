// The render contract, the editor's half (contract/README.md): every
// fixture in contract/fixtures, drawn by the React renderer the canvas and
// the preview use, gives the tree of the server's golden for it, under the
// normalization ../../test/html-compare.ts defines and nothing else; and
// what React draws passes the safety check. Before comparing, the goldens
// must be there and current against contract/rendered/manifest.json.
//
// Runs in Node with React's production build (the "contract" project of
// ../../vite.config.ts): the development build checks every element as it
// is made, and is many times slower on the 500-block page.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { compareHtml } from "../../test/html-compare.ts";
import { goldenName, readContractFiles } from "../../test/contract-files.ts";
import { safetyProblems } from "../../test/render-safety.ts";
import { BLOCK_TYPES } from "../shared/document.ts";
import { WIDGETS } from "../widgets/registry.ts";
import { PageSections } from "./blocks.tsx";
import { contractMedia } from "./media.tsx";

const contract = readContractFiles(repoRoot);
const fixtureText = (name: string) => readFileSync(join(repoRoot, "contract", "fixtures", name), "utf8");
const golden = (name: string) => readFileSync(join(repoRoot, "contract", "rendered", goldenName(name)), "utf8");
const ctx = { media: contractMedia };

export function renderFixture(document: unknown): string {
  return renderToStaticMarkup(<PageSections document={document} ctx={ctx} />);
}

test("the goldens are there, one per fixture, and current against the manifest", () => {
  expect(contract.problems).toEqual([]);
  expect(contract.fixtures.length).toBeGreaterThanOrEqual(6);
});

test("React's production build runs the contract", async () => {
  // The development build has React.act; the production build has none.
  const react = await import("react");
  expect(process.env.NODE_ENV).toBe("production");
  expect("act" in react && typeof react.act === "function" ? "development" : "production").toBe("production");
});

describe.each(contract.fixtures)("%s", (name) => {
  const document: unknown = JSON.parse(fixtureText(name));
  const html = renderFixture(document);

  test("React draws the tree of the server's golden", () => {
    const result = compareHtml(golden(name), html, name);
    expect(result.message ?? "").toBe("");
    expect(result.equal).toBe(true);
    // An empty page is the one golden with nothing to compare.
    if (name !== "empty.json") expect(result.nodes.react).toBeGreaterThan(0);
  });

  test("what React draws passes the safety check", () => {
    expect(safetyProblems(html)).toEqual([]);
  });

  test("the server's golden passes the safety check", () => {
    expect(safetyProblems(golden(name))).toEqual([]);
  });
});

test("the fixtures hold every block type, and every widget's traps, of that widget's type", () => {
  const types = new Map<string, string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === "object" && node !== null) {
      const { id, type } = node as { id?: unknown; type?: unknown };
      if (typeof id === "string" && typeof type === "string" && (BLOCK_TYPES as readonly string[]).includes(type)) types.set(id, type);
      Object.values(node).forEach(walk);
    }
  };
  for (const name of contract.fixtures) walk(JSON.parse(fixtureText(name)));
  expect([...new Set(types.values())].sort()).toEqual([...BLOCK_TYPES].sort());
  for (const widget of WIDGETS) {
    expect(widget.traps.length, widget.type).toBeGreaterThan(0);
    for (const id of widget.traps) expect(types.get(id), `${widget.type}: trap ${id}`).toBe(widget.type);
  }
});

// The probe the plan moved from stage 1 ("ActionView parity on 500
// blocks"): the 500-block page, through the same comparison, and how long
// React takes to draw it.
// It renders the page 35 times: 1.9 s in one run, and 7.8 s in another
// with other work keeping the CPU fully busy, past Vitest's 5 s. The time
// is printed, never asserted, so the test gets room for a busy machine.
test("the 500-block page: React matches the server's render, and its time", { timeout: 120_000 }, () => {
  const document: unknown = JSON.parse(fixtureText("large-500.json"));
  const rounds = 30;
  for (let i = 0; i < 5; i += 1) renderFixture(document);
  const times: number[] = [];
  let html = "";
  for (let i = 0; i < rounds; i += 1) {
    const started = performance.now();
    html = renderFixture(document);
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  const median = (times[rounds / 2 - 1]! + times[rounds / 2]!) / 2;
  const compareStarted = performance.now();
  const result = compareHtml(golden("large-500.json"), html, "large-500.json");
  const compareMs = performance.now() - compareStarted;
  console.log(
    `contract: large-500.json, ${result.nodes.react} nodes, ${html.length} characters of HTML: React render median ${median.toFixed(1)} ms ` +
      `(min ${times[0]!.toFixed(1)}, max ${times[rounds - 1]!.toFixed(1)}, ${rounds} renders after 5 warm-ups, NODE_ENV=${process.env.NODE_ENV}); ` +
      `parse and compare ${compareMs.toFixed(0)} ms; ${result.equal ? "the trees are the same" : "the trees differ"}`,
  );
  expect(result.message ?? "").toBe("");
});
