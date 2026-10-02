// The editor's validation on the schema's corpus, the files both of the
// project's validators are held to: every valid file passes, every invalid
// one fails, at the pointer and with the keyword the manifest names, refused
// by the layer it names (the application rules or the schema). The server
// points at the same place: the comparator in schema/tools checks that.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parseAndValidate, validateDocument } from "./validate.ts";

const corpus = fileURLToPath(new URL("../../../schema/corpus", import.meta.url));
interface Entry {
  rule: string;
  pointer?: string;
  keyword?: string;
  layer?: "rules" | "schema";
}
const manifest = JSON.parse(readFileSync(join(corpus, "manifest.json"), "utf8")) as Record<string, Entry>;
// 214 files, a page of 500 blocks among them: about a second on an idle
// machine, five times that on a busy one.
const CORPUS_TIMEOUT = 60_000;

describe("validation in the editor", () => {
  test("agrees with the corpus manifest on every file", { timeout: CORPUS_TIMEOUT }, () => {
    const files = Object.keys(manifest).filter((file) => !file.startsWith("upgrade/"));
    expect(files.length).toBeGreaterThanOrEqual(200);
    const wrong: string[] = [];
    for (const file of files) {
      const entry = manifest[file]!;
      const result = parseAndValidate(new Uint8Array(readFileSync(join(corpus, file))));
      if (file.startsWith("valid/")) {
        if (!result.valid) wrong.push(`${file}: refused, ${JSON.stringify(result.errors.slice(0, 2))}`);
        continue;
      }
      if (result.valid) {
        wrong.push(`${file}: accepted (${entry.rule})`);
        continue;
      }
      const hit = result.errors.find((e) => e.pointer === entry.pointer && e.keyword === entry.keyword);
      if (!hit) wrong.push(`${file}: no ${entry.keyword} at "${entry.pointer}"; got ${result.errors.slice(0, 3).map((e) => `${e.keyword} at "${e.pointer}"`).join(", ")}`);
      else if (hit.layer !== entry.layer) wrong.push(`${file}: refused by the ${hit.layer}, not the ${entry.layer}`);
    }
    expect(wrong).toEqual([]);
  });

  test("a document in memory goes through the same rules: a duplicate id is refused before the schema runs", () => {
    const heading = (id: string) => ({ id, type: "heading", props: { level: 2, text: "Twice" }, children: [], style: { base: {} } });
    const document = {
      schemaVersion: 1,
      title: "Ids",
      sections: [{
        id: "s1", type: "section", props: {}, style: { base: {} },
        children: [{ id: "c1", type: "column", props: {}, style: { base: {} }, children: [heading("h1"), heading("h1")] }],
      }],
    };
    const result = validateDocument(document);
    expect(result.valid).toBe(false);
    expect(result.valid ? [] : result.errors).toEqual([
      expect.objectContaining({ pointer: "/sections/0/children/0/children/1/id", keyword: "uniqueId", layer: "rules" }),
    ]);
  });

  test("an empty page is valid, and 2.0 comes back as the integer 2", () => {
    expect(validateDocument({ schemaVersion: 1, title: "Untitled page", sections: [] })).toEqual({
      valid: true,
      document: { schemaVersion: 1, title: "Untitled page", sections: [] },
    });
    const result = parseAndValidate('{"schemaVersion": 1.0, "title": "Floats", "sections": []}');
    expect(result.valid && Number.isInteger(result.document.schemaVersion)).toBe(true);
  });
});
