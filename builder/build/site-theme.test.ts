// The theme's file as the build reads it for the browser's storage: the
// shared section the CMS reads, with the time zone under the name the API
// gives it; a file the CMS could not start with stops the build, and so do
// a header and footer the editor could not save back, each value named, as
// they stop the CMS.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parse, stringify } from "yaml";
import { repoRoot } from "./paths.ts";
import { readSiteTheme, siteFile } from "./site-file.ts";
import { siteDefaultsProblems, siteThemeSource } from "./site-theme.ts";

// The repository's file, read as the build reads it.
const shared = (parse(readFileSync(siteFile, "utf8")) as { shared: Record<string, unknown> }).shared;
const footer = shared.footer as { lead: string; text: string };

// The module's value, as the bundle gets it.
function served(text?: string): Record<string, unknown> {
  const source = siteThemeSource(text);
  const json = /^export const SITE_THEME = (.*);$/m.exec(source);
  if (!json) throw new Error(`no SITE_THEME in ${source}`);
  return JSON.parse(json[1]!) as Record<string, unknown>;
}

test("the repository's file gives the site's name, menu, button, footer and time zone", () => {
  const theme = readSiteTheme();
  expect(typeof theme.name).toBe("string");
  expect(Array.isArray(theme.menu)).toBe(true);
  expect(theme.timeZone).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+$/);
  expect(served()).toEqual({ name: shared.name, menu: shared.menu, action: shared.action, footer: shared.footer, timeZone: shared.time_zone });
});

test("a file without the shared section, or without a time zone, stops the build", () => {
  expect(() => readSiteTheme("development:\n  name: Elsewhere\n")).toThrow(/has no shared section/);
  expect(() => readSiteTheme("shared:\n  name: No zone\n")).toThrow(/names no time_zone/);
  expect(readSiteTheme("shared:\n  name: Tide club\n  time_zone: Europe/Rome\n")).toEqual({ name: "Tide club", menu: undefined, action: undefined, footer: undefined, timeZone: "Europe/Rome" });
});

test("a header and footer the editor could not save back stop the build, each value named in the CMS's words", () => {
  const broken = stringify({ shared: { ...shared, name: "N".repeat(29), menu: [{ label: "Run", href: "javascript:alert(1)" }], footer: { lead: "Two\nlines", text: footer.text } } });
  let said = "";
  try {
    siteThemeSource(broken);
  } catch (error) {
    said = (error as Error).message;
  }
  for (const value of ["/name (maxLength)", "/menu/0/href (pattern)", "/footer/lead (not)"]) expect(said, value).toContain(value);
  // The CMS stops with the same sentence (config/initializers/site.rb).
  const sentence = "the header and footer break the rules a change from the editor is held to";
  expect(said).toContain(sentence);
  expect(readFileSync(join(repoRoot, "cms", "config", "initializers", "site.rb"), "utf8")).toContain(sentence);
});

test("a button the file leaves out is none, as Ruby reads a missing key; a menu left out is no list, and stops the build", () => {
  const without = (key: string) => stringify({ shared: Object.fromEntries(Object.entries(shared).filter(([name]) => name !== key)) });
  expect(served(without("action")).action).toBe(null);
  expect(() => siteThemeSource(without("menu"))).toThrow(/\/menu \(type\)/);
});

test("the application rules come before the schema, as the CMS runs them", () => {
  const values = { name: `\ud800${"N".repeat(40)}`, menu: [], action: null, footer };
  expect(siteDefaultsProblems(values)).toEqual(["/name (wellFormed): A string holds half of a surrogate pair."]);
  expect(siteDefaultsProblems({ ...values, name: "N".repeat(40) })).toEqual(["/name (maxLength): must NOT have more than 28 characters"]);
});
