// node --test tools/start/footprint.test.ts
//
// The smoke run's measure of what changed outside the repository, shown
// able to fail: a launcher planted in a watched folder (a temporary one
// here, never a real folder on the PATH) and a service that appears are
// changes; a download cache that grows is reported and not failed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compare, listServices, snapshot, type Place, type Snapshot } from "./footprint.ts";

test("a launcher planted in a watched folder is a change, named", () => {
  const folder = mkdtempSync(join(tmpdir(), "pbc-launchers-"));
  const cache = mkdtempSync(join(tmpdir(), "pbc-cache-"));
  try {
    writeFileSync(join(folder, "node.exe"), "");
    const places: Place[] = [
      { label: "planted bin", path: folder, kind: "launchers" },
      { label: "planted cache", path: cache, kind: "cache" },
    ];
    const before = snapshot(places);
    const same = compare(before, snapshot(places));
    assert.equal(same.changed, false, same.lines.join("\n"));

    writeFileSync(join(cache, "index"), "x".repeat(2048));
    const grown = compare(before, snapshot(places));
    assert.equal(grown.changed, false, "a cache that grows is reported, not failed");
    assert.match(grown.lines[1]!, /0 files, 0\.0 MB before; 1 files, 0\.0 MB after/);

    writeFileSync(join(folder, "rails.bat"), "@ruby rails %*");
    const planted = compare(before, snapshot(places));
    assert.equal(planted.changed, true);
    assert.match(planted.lines[0]!, /^planted bin \(.+\): CHANGED: added rails\.bat$/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
  }
});

test("a launchers' folder that appears, and a service that appears, are changes", () => {
  const place: Place = { label: "bin", path: "/nowhere", kind: "launchers" };
  const before: Snapshot = { places: [{ place, contents: { kind: "absent" } }], services: ["a", "b"] };
  const after: Snapshot = { places: [{ place, contents: { kind: "launchers", entries: ["rake"] } }], services: ["a", "b", "pbc"] };
  const result = compare(before, after);
  assert.equal(result.changed, true);
  assert.deepEqual(result.lines, ["bin (/nowhere): CREATED", "services: CHANGED: added pbc"]);
});

test("this system's services can be listed, so their measure is not empty", { skip: process.platform === "darwin" && "no listing on macOS" }, () => {
  const services = listServices();
  assert.ok(services && services.length > 10, `listed ${services?.length ?? "nothing"}`);
});
