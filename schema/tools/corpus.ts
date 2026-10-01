// What the runners and the comparator share: where things are, how the
// corpus is listed, and the shape of one result line.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TOOLS = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_DIR = resolve(TOOLS, "..");
export const REPO = resolve(SCHEMA_DIR, "..");
export const SCHEMA = join(SCHEMA_DIR, "block-document.schema.json");
export const CORPUS = join(SCHEMA_DIR, "corpus");
export const CMS_GEMFILE = join(REPO, "cms", "Gemfile");

// valid/ and invalid/ hold documents; upgrade/ holds documents of an older
// schemaVersion (none exist for version 1).
export const CORPUS_FOLDERS = ["valid", "invalid", "upgrade"] as const;

export function listCorpus(corpus: string): string[] {
  const out: string[] = [];
  for (const folder of CORPUS_FOLDERS) {
    const dir = join(corpus, folder);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) out.push(`${folder}/${name}`);
  }
  return out;
}

export interface ManifestEntry {
  rule: string;
  pointer?: string;
  keyword?: string;
  layer?: "rules" | "schema";
}

export function readManifest(corpus: string): Record<string, ManifestEntry> {
  return JSON.parse(readFileSync(join(corpus, "manifest.json"), "utf8")) as Record<string, ManifestEntry>;
}

// One error as a runner reports it. property is ajv's params.additionalProperty
// or params.missingProperty, which the comparator needs to normalise.
export interface ReportedError {
  pointer: string;
  keyword: string;
  property?: string;
}

// One line of runner output, one per corpus file.
export interface ResultLine {
  file: string;
  valid?: boolean;
  layer?: "rules" | "schema";
  errors?: ReportedError[];
  // The document after the rules' normalisation, as the runner's language
  // serialises it; null when the rules refused the document.
  normalized?: string | null;
  // Set when the runner could not give a verdict. Never a verdict itself.
  exception?: string;
}

export function argValue(argv: readonly string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  const value = i >= 0 ? argv[i + 1] : undefined;
  return value ?? fallback;
}
