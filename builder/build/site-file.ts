// The site's own files, read as the CMS reads them: cms/config/site.yml
// (config/application.rb, config_for), whose time zone is the CMS's own
// setting, and the header's and footer's starters, cms/config/parts/
// <kind>.json (config/initializers/site_parts.rb), the documents a site
// draws until it publishes its own parts and the first draft of a part.
// The build serves them to the browser's storage (./site-theme.ts, once the
// starters pass the CMS's check of them), and the tests read them here for
// what a new store has. Plain reading, with nothing of the schema's
// validator, so a test of the editor's own code can import it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { repoRoot } from "./paths.ts";

export const siteFile = join(repoRoot, "cms", "config", "site.yml");
export const partsDir = join(repoRoot, "cms", "config", "parts");
export const PART_KINDS = ["header", "footer"] as const;

export interface RawSiteTheme {
  parts: { header: unknown; footer: unknown };
  timeZone: string;
}

export const partFile = (kind: (typeof PART_KINDS)[number]): string => join(partsDir, `${kind}.json`);

// The time zone of the file's `shared` section, the one every Rails
// environment reads (the file has no other), and the starters as JSON. A
// file without either stops the build, as it stops the CMS from starting.
export function readSiteTheme(text: string = readFileSync(siteFile, "utf8"), readPart: (kind: (typeof PART_KINDS)[number]) => string = (kind) => readFileSync(partFile(kind), "utf8")): RawSiteTheme {
  const file = parse(text) as { shared?: Record<string, unknown> } | null;
  const shared = file?.shared;
  if (!shared || typeof shared !== "object") throw new Error(`${siteFile} has no shared section`);
  if (typeof shared.time_zone !== "string") throw new Error(`${siteFile} names no time_zone`);
  const read = (kind: (typeof PART_KINDS)[number]): unknown => {
    try {
      return JSON.parse(readPart(kind));
    } catch (error) {
      throw new Error(`${partFile(kind)} is not JSON: ${(error as Error).message}`);
    }
  };
  return { parts: { header: read("header"), footer: read("footer") }, timeZone: shared.time_zone };
}
