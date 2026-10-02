// The fence of .oxlintrc.json, shown firing. It lints, with the real
// configuration, a temporary copy of the editor's layout holding a planted
// violation of every kind the fence forbids, in three folders outside
// src/storage/, and the same calls in a file inside src/storage/, where
// they are allowed. Each planted line must be reported, by the rule meant
// to catch it, and the storage file must pass. Then the real tree must
// lint clean. The copy is removed afterwards.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { builderRoot } from "./paths.ts";

const oxlint = join(builderRoot, "node_modules", "oxlint", "bin", "oxlint");

// file -> [line, rule] for every line that must be reported.
const PLANTS: Record<string, { source: string; expected: Array<[number, string]> }> = {
  "src/editor/planted-fetch.ts": {
    source: [
      'export const a = fetch("/api/pages");',
      'export const b = window.fetch("/api/pages");',
      'export const c = globalThis.fetch("/api/pages");',
    ].join("\n"),
    expected: [[1, "no-restricted-globals"], [2, "no-restricted-properties"], [3, "no-restricted-properties"]],
  },
  "src/render/planted-requests.ts": {
    source: [
      "export const a = new XMLHttpRequest();",
      'export const b = new EventSource("/api/events");',
      "export const c = new window.XMLHttpRequest();",
    ].join("\n"),
    expected: [[1, "no-restricted-globals"], [2, "no-restricted-globals"], [3, "no-restricted-properties"]],
  },
  "src/widgets/image/planted-upload.ts": {
    source: [
      'import { DirectUpload } from "@rails/activestorage";',
      "export const upload = DirectUpload;",
      'export const later = () => import("@rails/activestorage/src/direct_upload");',
    ].join("\n"),
    expected: [[1, "no-restricted-imports"], [3, "no-restricted-imports"]],
  },
};
// The same calls where they belong: not one may be reported.
const ALLOWED = "src/storage/allowed.ts";
const ALLOWED_SOURCE = [
  'import { DirectUpload } from "@rails/activestorage";',
  "export const upload = DirectUpload;",
  'export const a = fetch("/api/pages");',
  'export const b = window.fetch("/api/pages");',
  "export const c = new XMLHttpRequest();",
  'export const d = new EventSource("/api/events");',
].join("\n");

interface Diagnostic {
  filename: string;
  code: string;
  severity: string;
  labels: Array<{ span: { line: number } }>;
}

function lint(cwd: string, paths: string[]): { status: number | null; diagnostics: Diagnostic[]; files: number; output: string } {
  const run = spawnSync(process.execPath, [oxlint, "-c", ".oxlintrc.json", "-f", "json", ...paths], { cwd, encoding: "utf8" });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const parsed = JSON.parse(run.stdout || "{}") as { diagnostics?: Diagnostic[]; number_of_files?: number };
  return { status: run.status, diagnostics: parsed.diagnostics ?? [], files: parsed.number_of_files ?? 0, output };
}

const copy = mkdtempSync(join(tmpdir(), "pbc-lint-fence-"));
afterAll(() => rmSync(copy, { recursive: true, force: true }));

// Each test starts oxlint: well under a second idle, more on a busy machine.
describe("the fence around src/storage/", { timeout: 30_000 }, () => {
  test("catches every planted call outside src/storage/ and lets the same calls through inside it", () => {
    copyFileSync(join(builderRoot, ".oxlintrc.json"), join(copy, ".oxlintrc.json"));
    for (const [file, plant] of Object.entries({ ...PLANTS, [ALLOWED]: { source: ALLOWED_SOURCE, expected: [] } })) {
      mkdirSync(dirname(join(copy, file)), { recursive: true });
      writeFileSync(join(copy, file), `${plant.source}\n`);
    }

    const { status, diagnostics, files, output } = lint(copy, ["src"]);
    expect(files, output).toBe(4);
    const found = diagnostics.map((d) => `${d.filename.replaceAll("\\", "/")}:${d.labels[0]?.span.line} ${d.code.replace(/^eslint\(|\)$/g, "")}`).sort();
    const expected = Object.entries(PLANTS).flatMap(([file, plant]) => plant.expected.map(([line, rule]) => `${file}:${line} ${rule}`)).sort();

    expect(status, output).toBe(1);
    expect(expected.length).toBe(8);
    expect(found).toEqual(expected);
    expect(diagnostics.every((d) => d.severity === "error")).toBe(true);
  });

  test("passes on the real tree", () => {
    const { status, diagnostics, files, output } = lint(builderRoot, ["src", "e2e", "build", "test", "vite.config.ts"]);
    expect(files, output).toBeGreaterThan(10);
    expect(diagnostics, output).toEqual([]);
    expect(status, output).toBe(0);
  });
});
