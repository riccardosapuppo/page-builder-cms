// cms/config/site.yml, read as the CMS reads it (config/application.rb,
// config_for): the header and footer's defaults, which apply until the
// editor first changes them, and the site's time zone, the CMS's own
// setting. The build serves them to the browser's storage
// (./site-theme.ts, once they pass the CMS's check of them), and the tests
// read them here for what a new store has. Plain reading, with nothing of
// the schema's validator, so a test of the editor's own code can import it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { repoRoot } from "./paths.ts";

export const siteFile = join(repoRoot, "cms", "config", "site.yml");

export interface RawSiteTheme {
  name: unknown;
  menu: unknown;
  action: unknown;
  footer: unknown;
  timeZone: unknown;
}

// The file's `shared` section, the one every Rails environment reads (the
// file has no other). A file without it stops the build, as it stops the
// CMS from starting.
export function readSiteTheme(text: string = readFileSync(siteFile, "utf8")): RawSiteTheme {
  const file = parse(text) as { shared?: Record<string, unknown> } | null;
  const shared = file?.shared;
  if (!shared || typeof shared !== "object") throw new Error(`${siteFile} has no shared section`);
  if (typeof shared.time_zone !== "string") throw new Error(`${siteFile} names no time_zone`);
  return { name: shared.name, menu: shared.menu, action: shared.action, footer: shared.footer, timeZone: shared.time_zone };
}

// The header and footer of the file as the CMS takes them for its
// defaults (Site.defaults): the four values a change from the editor
// sends, as JSON writes them, a value the file leaves out read as null,
// as Ruby reads a missing key.
export function siteDefaults(theme: RawSiteTheme): { name: unknown; menu: unknown; action: unknown; footer: unknown } {
  const { name, menu, action, footer } = theme;
  return JSON.parse(JSON.stringify({ name: name ?? null, menu: menu ?? null, action: action ?? null, footer: footer ?? null })) as ReturnType<typeof siteDefaults>;
}
