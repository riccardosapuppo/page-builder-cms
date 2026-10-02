// The versions the editor is built and tested with, as installed: exact
// pins, one copy of the packages that must not come twice, and Node
// versions every installed package accepts.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import semver from "semver";
import { describe, expect, test } from "vitest";
import { builderRoot, repoRoot } from "./paths.ts";

interface Manifest {
  name: string;
  version: string;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Manifest;
const builder = read(join(builderRoot, "package.json"));
const root = read(join(repoRoot, "package.json"));

// Every package.json under node_modules, nested ones included.
function installed(dir = join(builderRoot, "node_modules")): Array<Manifest & { path: string }> {
  const found: Array<Manifest & { path: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const folders = entry.name.startsWith("@")
      ? readdirSync(join(dir, entry.name), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(dir, entry.name, e.name))
      : [join(dir, entry.name)];
    for (const folder of folders) {
      if (existsSync(join(folder, "package.json"))) found.push({ ...read(join(folder, "package.json")), path: folder });
      if (existsSync(join(folder, "node_modules"))) found.push(...installed(join(folder, "node_modules")));
    }
  }
  return found;
}
const packages = installed();

// The lowest version of each alternative of a range: "^22.13.0 || ^24.0.0" -> 22.13.0, 24.0.0.
function floors(range: string): string[] {
  return range.split("||").map((part) => semver.minVersion(part.trim())?.version).filter((v): v is string => v !== undefined);
}

describe("the editor's packages", () => {
  test("every dependency is pinned to one version", () => {
    const pins = { ...builder.dependencies, ...builder.devDependencies };
    expect(Object.keys(pins).length).toBeGreaterThan(30);
    expect(Object.entries(pins).filter(([, version]) => semver.valid(version) === null)).toEqual([]);
  });

  test("playwright-core is installed once, at the version @playwright/test was built with", () => {
    const copies = packages.filter((p) => p.name === "playwright-core").map((p) => p.version);
    expect(copies).toEqual(["1.62.1"]);
    expect(packages.filter((p) => p.name === "@playwright/test").map((p) => p.version)).toEqual(["1.62.1"]);
  });

  test("every @tiptap package is at the same patch, and every @dnd-kit one at the same version", () => {
    const tiptap = packages.filter((p) => p.name.startsWith("@tiptap/"));
    expect(tiptap.length).toBeGreaterThanOrEqual(13);
    expect(new Set(tiptap.map((p) => p.version))).toEqual(new Set(["3.31.3"]));
    const dndKit = packages.filter((p) => p.name.startsWith("@dnd-kit/"));
    expect(dndKit.length).toBe(6);
    expect(new Set(dndKit.map((p) => p.version))).toEqual(new Set(["0.5.0"]));
  });

  test("the Node versions the editor declares are ones every installed package accepts", () => {
    const declared = builder.engines?.node ?? "";
    const ours = floors(declared);
    expect(ours).toEqual(["22.13.0", "24.0.0", "26.0.0"]);
    const refusing = packages
      .filter((p) => p.engines?.node !== undefined && semver.validRange(p.engines.node) !== null)
      .flatMap((p) => ours.filter((version) => !semver.satisfies(version, p.engines!.node!)).map((version) => `${p.name}@${p.version} (${p.engines!.node}) refuses Node ${version}`));
    expect(refusing).toEqual([]);
    // Checked over more than a handful, so an empty list means something.
    expect(packages.filter((p) => p.engines?.node !== undefined).length).toBeGreaterThan(20);
  });

  test("the root's lowest Node runs the editor too, since the root's scripts delegate to it", () => {
    const rootFloor = semver.minVersion(root.engines?.node ?? "")?.version;
    expect(rootFloor).toBe("24.0.0");
    expect(semver.satisfies(rootFloor!, builder.engines?.node ?? "")).toBe(true);
  });
});
