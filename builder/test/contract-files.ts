// The server's half of the render contract, as files: contract/fixtures,
// the goldens in contract/rendered and its manifest.json, which records the
// sha256 of every fixture, every golden and every source file of the
// server's renderer (cms/test/contract/goldens_test.rb writes it).
//
// Before the editor compares anything with a golden it checks the golden is
// there and current: a golden that is missing, has no fixture, or whose
// hash, its fixture's or a renderer source's differs from the manifest was
// not written by the server's renderer as it is now, and comparing with it
// would prove nothing.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// What decides the bytes of a golden besides the fixture: the server's list
// (RENDERER_SOURCES in goldens_test.rb), as paths from the repository root.
export const RENDERER_SOURCES = [
  "cms/app/views/blocks/*.html.erb",
  "cms/app/helpers/blocks_helper.rb",
  "cms/app/helpers/rich_text_helper.rb",
  "cms/app/models/add_to_cart.rb",
  "cms/app/models/block_style.rb",
  "cms/app/models/collection_list.rb",
  "cms/app/models/entry_field.rb",
  "cms/app/models/entry_order.rb",
  "cms/app/models/entry_words.rb",
  "cms/app/models/form_block.rb",
  "cms/app/models/free_colors.rb",
  "cms/app/models/free_type.rb",
  "cms/app/models/render_policy.rb",
  "cms/app/models/shop_rules.rb",
  "cms/app/models/shop_words.rb",
  "cms/app/models/site_icons.rb",
  "cms/lib/block_document/rules.rb",
  "cms/lib/collection_document/rules.rb",
  "cms/lib/site_theme/token_css.rb",
  "cms/test/support/contract_content.rb",
  "cms/test/support/contract_media.rb",
  "schema/icons.svg",
  "schema/block-document.schema.json",
] as const;

// The server's own floor (goldens_test.rb).
export const MIN_FIXTURES = 6;

export interface ContractFiles {
  // The fixtures' names ("edge.json"), sorted.
  fixtures: string[];
  // Everything that makes the goldens unusable; empty when they are current.
  problems: string[];
}

const sha256 = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
export const goldenName = (fixture: string): string => `${fixture.slice(0, -".json".length)}.html`;

function rendererFiles(repo: string): string[] {
  return RENDERER_SOURCES.flatMap((pattern) => {
    const star = pattern.lastIndexOf("*");
    if (star === -1) return existsSync(join(repo, pattern)) ? [pattern] : [];
    const slash = pattern.lastIndexOf("/");
    const folder = pattern.slice(0, slash);
    const suffix = pattern.slice(star + 1);
    return readdirSync(join(repo, folder)).filter((name) => name.endsWith(suffix)).map((name) => `${folder}/${name}`);
  }).sort();
}

function compareHashes(part: string, stored: unknown, current: Record<string, string>, problems: string[]): void {
  const recorded = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  for (const [name, hash] of Object.entries(current)) {
    if (!(name in recorded)) problems.push(`manifest.json (${part}) does not list ${name}`);
    else if (recorded[name] !== hash) problems.push(`manifest.json (${part}) is stale for ${name}: ${String(recorded[name]).slice(0, 12)}… recorded, ${hash.slice(0, 12)}… on disk`);
  }
  for (const name of Object.keys(recorded)) if (!(name in current)) problems.push(`manifest.json (${part}) lists ${name}, which is not there`);
}

// Reads contract/ under a repository root (the real one, or a copy with a
// fault planted in it).
export function readContractFiles(repo: string): ContractFiles {
  const fixturesDir = join(repo, "contract", "fixtures");
  const renderedDir = join(repo, "contract", "rendered");
  const manifestFile = join(renderedDir, "manifest.json");
  const problems: string[] = [];

  const fixtures = existsSync(fixturesDir) ? readdirSync(fixturesDir).filter((name) => name.endsWith(".json")).sort() : [];
  if (fixtures.length < MIN_FIXTURES) problems.push(`only ${fixtures.length} fixture(s) in contract/fixtures, fewer than ${MIN_FIXTURES}`);
  const goldens = existsSync(renderedDir) ? readdirSync(renderedDir).filter((name) => name !== "manifest.json").sort() : [];
  for (const fixture of fixtures) if (!goldens.includes(goldenName(fixture))) problems.push(`contract/rendered/${goldenName(fixture)} is missing`);
  for (const golden of goldens) if (!fixtures.some((f) => goldenName(f) === golden)) problems.push(`contract/rendered/${golden} has no fixture`);

  if (!existsSync(manifestFile)) {
    problems.push("contract/rendered/manifest.json is missing");
    return { fixtures, problems };
  }
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as Record<string, unknown>;
  compareHashes("fixtures", manifest.fixtures, Object.fromEntries(fixtures.map((f) => [f, sha256(join(fixturesDir, f))])), problems);
  compareHashes(
    "rendered",
    manifest.rendered,
    Object.fromEntries(goldens.filter((g) => existsSync(join(renderedDir, g))).map((g) => [g, sha256(join(renderedDir, g))])),
    problems,
  );
  compareHashes("renderer", manifest.renderer, Object.fromEntries(rendererFiles(repo).map((path) => [path, sha256(join(repo, path))])), problems);
  return { fixtures, problems };
}
