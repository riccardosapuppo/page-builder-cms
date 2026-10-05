// The goldens' freshness check (contract-files.ts) on the real contract
// folder, and on copies of it with a fault planted: each fault is reported,
// so the contract never compares the editor's render with a golden the
// server's renderer did not write as it is now.
// @vitest-environment node
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { repoRoot } from "../build/paths.ts";
import { readContractFiles, RENDERER_SOURCES } from "./contract-files.ts";

test("the real goldens are current: six fixtures or more, each with its golden, every hash as recorded", () => {
  const files = readContractFiles(repoRoot);
  expect(files.problems).toEqual([]);
  expect(files.fixtures).toEqual(["edge.json", "empty.json", "large-500.json", "traps-form.json", "traps-media.json", "traps-structure.json", "traps-text.json"]);
});

// A repository of the files the check reads, copied from the real one.
const copies: string[] = [];
afterAll(() => {
  for (const copy of copies) rmSync(copy, { recursive: true, force: true });
});
function copyOfContract(): string {
  const root = mkdtempSync(join(tmpdir(), "contract-plant-"));
  copies.push(root);
  cpSync(join(repoRoot, "contract"), join(root, "contract"), { recursive: true });
  for (const pattern of RENDERER_SOURCES) {
    const from = pattern.includes("*") ? dirname(pattern) : pattern;
    mkdirSync(dirname(join(root, from)), { recursive: true });
    cpSync(join(repoRoot, from), join(root, from), { recursive: true });
  }
  return root;
}

describe("a planted fault makes the goldens unusable", () => {
  test("the copy without a fault is current", () => {
    expect(readContractFiles(copyOfContract()).problems).toEqual([]);
  });

  test("a stale golden: one byte changed after the manifest was written", () => {
    const root = copyOfContract();
    appendFileSync(join(root, "contract", "rendered", "edge.html"), " ");
    expect(readContractFiles(root).problems).toEqual([expect.stringMatching(/^manifest\.json \(rendered\) is stale for edge\.html: /)]);
  });

  test("a missing golden", () => {
    const root = copyOfContract();
    unlinkSync(join(root, "contract", "rendered", "traps-text.html"));
    expect(readContractFiles(root).problems).toEqual(["contract/rendered/traps-text.html is missing", "manifest.json (rendered) lists traps-text.html, which is not there"]);
  });

  test("a golden with no fixture", () => {
    const root = copyOfContract();
    writeFileSync(join(root, "contract", "rendered", "orphan.html"), "<section></section>");
    expect(readContractFiles(root).problems).toEqual(["contract/rendered/orphan.html has no fixture", "manifest.json (rendered) does not list orphan.html"]);
  });

  test("a fixture changed and its golden not written again", () => {
    const root = copyOfContract();
    appendFileSync(join(root, "contract", "fixtures", "edge.json"), "\n");
    expect(readContractFiles(root).problems).toEqual([expect.stringMatching(/^manifest\.json \(fixtures\) is stale for edge\.json: /)]);
  });

  test("a renderer source changed, or a partial added, and the goldens not written again", () => {
    const root = copyOfContract();
    appendFileSync(join(root, "cms", "app", "views", "blocks", "_heading.html.erb"), "\n");
    writeFileSync(join(root, "cms", "app", "views", "blocks", "_carousel.html.erb"), "<div></div>\n");
    expect(readContractFiles(root).problems).toEqual([
      "manifest.json (renderer) does not list cms/app/views/blocks/_carousel.html.erb",
      expect.stringMatching(/^manifest\.json \(renderer\) is stale for cms\/app\/views\/blocks\/_heading\.html\.erb: /),
    ]);
  });

  test("no manifest, and too few fixtures", () => {
    const root = copyOfContract();
    unlinkSync(join(root, "contract", "rendered", "manifest.json"));
    for (const name of ["edge", "empty", "traps-form"]) {
      unlinkSync(join(root, "contract", "fixtures", `${name}.json`));
      unlinkSync(join(root, "contract", "rendered", `${name}.html`));
    }
    expect(readContractFiles(root).problems).toEqual(["only 4 fixture(s) in contract/fixtures, fewer than 6", "contract/rendered/manifest.json is missing"]);
  });
});
