// @vitest-environment node
// The upgrade of stored documents, the twin of the server's
// cms/app/models/block_document/upgrade.rb: the same cases as the server's
// own test (cms/test/models/block_document_upgrade_test.rb), the same
// current version and the same steps as the server's file, and every old
// document of the shared corpus (schema/corpus/upgrade/) upgraded and
// valid.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { page } from "../../test/document-page.ts";
import { CURRENT, openDocument, STEPS, upgrade, UnsupportedDocument, type UpgradeStep } from "./upgrade.ts";

// Two made-up steps standing for a schema that has moved on twice, as in
// the server's test: version 2 renamed "title" to "name", version 3 added
// a "language".
const FUTURE_STEPS: Record<number, UpgradeStep> = {
  1: ({ title, ...rest }) => ({ ...rest, schemaVersion: 2, name: title }),
  2: (doc) => ({ ...doc, schemaVersion: 3, language: "en" }),
};

describe("upgrading a stored document", () => {
  test("a document of the current version goes through unchanged", () => {
    const doc = page();
    expect(upgrade(doc)).toBe(doc);
    expect(CURRENT).toBe(1);
  });

  test("an older document goes through every step up to the current version", () => {
    const upgraded = upgrade({ ...page(), title: "Tides" }, { steps: FUTURE_STEPS, current: 3 }) as Record<string, unknown>;
    expect(upgraded.schemaVersion).toBe(3);
    expect(upgraded.name).toBe("Tides");
    expect(upgraded.language).toBe("en");
    expect(Object.hasOwn(upgraded, "title")).toBe(false);
  });

  test("a document newer than the editor is refused, not guessed at", () => {
    expect(() => upgrade({ ...page(), schemaVersion: 2 })).toThrow(new UnsupportedDocument("The document is of schemaVersion 2, newer than this server's 1."));
  });

  test("a version with no step to the next is refused", () => {
    expect(() => upgrade(page(), { steps: { 2: FUTURE_STEPS[2] as UpgradeStep }, current: 3 })).toThrow("There is no upgrade from schemaVersion 1.");
  });

  test("a step that does not move the version on is refused instead of looping", () => {
    expect(() => upgrade(page(), { steps: { 1: (doc) => doc }, current: 2 })).toThrow("The upgrade from schemaVersion 1 gave 1, not 2.");
  });

  test("a document without a schemaVersion is refused", () => {
    const { schemaVersion: _, ...without } = page();
    expect(() => upgrade(without)).toThrow("The document has no integer schemaVersion.");
    expect(() => upgrade({ ...page(), schemaVersion: "1" })).toThrow(UnsupportedDocument);
  });

  test("opening: upgraded, then checked as the server checks, with the server's pointer for the version", () => {
    expect(openDocument(page())).toEqual({ ok: true, document: page() });
    expect(openDocument({ ...page(), schemaVersion: 7 })).toEqual({
      ok: false,
      errors: [{ pointer: "/schemaVersion", keyword: "upgrade", message: "The document is of schemaVersion 7, newer than this server's 1.", layer: "rules" }],
    });
    const broken = openDocument({ ...page(), title: "" });
    expect(broken.ok ? [] : broken.errors.map((e) => e.pointer)).toContain("/title");
  });
});

// The server's file, read for its current version and its steps: when the
// server's schema moves on and this twin does not, this fails.
const RUBY = fileURLToPath(new URL("../../../cms/app/models/block_document/upgrade.rb", import.meta.url));

function rubyTwin(text: string): { current: number; steps: number } {
  const current = [...text.matchAll(/^\s*CURRENT = ([0-9]+)$/gm)];
  const steps = [...text.matchAll(/^\s*STEPS = \{(.*?)\}\.freeze$/gms)];
  if (current.length !== 1 || steps.length !== 1) throw new Error(`upgrade.rb has ${current.length} CURRENT and ${steps.length} STEPS, not one of each`);
  // One step per line that starts with its version: `1 => ->(doc) { ... }`.
  const body = steps[0]?.[1] ?? "";
  return { current: Number(current[0]?.[1]), steps: [...body.matchAll(/^\s*[0-9]+\s*=>/gm)].length };
}

describe("the twin of the server's upgrade", () => {
  test("has the server's current version and as many steps", () => {
    expect(rubyTwin(readFileSync(RUBY, "utf8"))).toEqual({ current: CURRENT, steps: Object.keys(STEPS).length });
  });

  test("would see the server move on", () => {
    const moved = readFileSync(RUBY, "utf8")
      .replace("CURRENT = 1", "CURRENT = 2")
      .replace("STEPS = {}.freeze", "STEPS = {\n      1 => ->(doc) { doc.merge(\"schemaVersion\" => 2) }\n    }.freeze");
    expect(rubyTwin(moved)).toEqual({ current: 2, steps: 1 });
    expect(() => rubyTwin("module Upgrade\nend\n")).toThrow(/0 CURRENT and 0 STEPS/);
  });
});

// Every document in an upgrade corpus folder must open: upgraded by STEPS
// and valid. A document there with no step to run on it is a case nobody
// tests, which the schema's comparator refuses too.
function corpusProblems(folder: string, steps = STEPS): string[] {
  const problems: string[] = [];
  for (const name of readdirSync(folder).filter((f) => f.endsWith(".json"))) {
    const opened = openDocument(JSON.parse(readFileSync(join(folder, name), "utf8")), { steps });
    if (!opened.ok) problems.push(`${name}: ${opened.errors.map((e) => `${e.keyword} at ${e.pointer}: ${e.message}`).join("; ")}`);
  }
  return problems;
}

describe("the upgrade corpus", () => {
  const folder = fileURLToPath(new URL("../../../schema/corpus/upgrade", import.meta.url));

  test("every old document opens; today the folder holds only its README, as there is nothing older than version 1", () => {
    const files = readdirSync(folder);
    expect(files).toContain("README.md");
    // With no step yet, a document here could only be refused; the
    // comparator says the same. With steps, each one must open.
    if (Object.keys(STEPS).length === 0) expect(files.filter((f) => f.endsWith(".json"))).toEqual([]);
    expect(corpusProblems(folder)).toEqual([]);
  });

  test("a document of an older version with no step to upgrade it is reported", () => {
    const planted = mkdtempSync(join(tmpdir(), "pbc-upgrade-"));
    try {
      writeFileSync(join(planted, "v0-page.json"), JSON.stringify({ ...page(), schemaVersion: 0 }));
      expect(corpusProblems(planted)).toEqual(["v0-page.json: upgrade at /schemaVersion: There is no upgrade from schemaVersion 0."]);
      // With a step for it, the same document opens.
      expect(corpusProblems(planted, { 0: (doc) => ({ ...doc, schemaVersion: 1 }) })).toEqual([]);
    } finally {
      rmSync(planted, { recursive: true, force: true });
    }
  });
});
