// The site's own files as the build reads them for the browser's storage:
// the header's and footer's starters (cms/config/parts), as JSON, and the
// time zone of cms/config/site.yml's shared section, under the name the API
// gives it. A file the CMS could not start with stops the build, and so
// does a starter the editor could not save back, each value named, as it
// stops the CMS.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parse } from "yaml";
import { repoRoot } from "./paths.ts";
import { partFile, PART_KINDS, readSiteTheme, siteFile } from "./site-file.ts";
import { siteThemeSource, starterProblems } from "./site-theme.ts";

type Kind = (typeof PART_KINDS)[number];
type Block = { id: string; type: string; props: Record<string, unknown>; children: Block[]; style: { base: Record<string, unknown> } };
type Doc = { sections: Block[] };

// The repository's files, read as the build reads them.
const shared = (parse(readFileSync(siteFile, "utf8")) as { shared: Record<string, unknown> }).shared;
const starter = (kind: Kind): Doc => JSON.parse(readFileSync(partFile(kind), "utf8")) as Doc;

// The module's value, as the bundle gets it.
function served(text?: string, readPart?: (kind: Kind) => string): Record<string, unknown> {
  const source = siteThemeSource(text, readPart);
  const json = /^export const SITE_THEME = (.*);$/m.exec(source);
  if (!json) throw new Error(`no SITE_THEME in ${source}`);
  return JSON.parse(json[1]!) as Record<string, unknown>;
}

// The module made from the repository's site.yml and these starters; what
// it throws, or "" when it is made.
function stopped(parts: Partial<Record<Kind, unknown>>): string {
  try {
    siteThemeSource(undefined, (kind) => JSON.stringify(parts[kind] ?? starter(kind)));
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

const SENTENCE = "the starters break the rules a header's or footer's draft is held to";

test("the repository's files give the starters, each a part's draft the editor could save back, and the time zone", () => {
  const theme = readSiteTheme();
  expect(theme.timeZone).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+$/);
  expect(served()).toEqual({ parts: { header: starter("header"), footer: starter("footer") }, timeZone: shared.time_zone });
  for (const kind of PART_KINDS) expect(starterProblems(theme.parts[kind]), kind).toEqual([]);
});

test("a file without the shared section or a time zone, or a starter that is no JSON, stops the build", () => {
  expect(() => readSiteTheme("development:\n  time_zone: Europe/Rome\n")).toThrow(/has no shared section/);
  expect(() => readSiteTheme("shared:\n  name: No zone\n")).toThrow(/names no time_zone/);
  expect(() => readSiteTheme("shared:\n  time_zone: Europe/Rome\n", (kind) => (kind === "footer" ? "{" : "{}"))).toThrow(/footer\.json is not JSON/);
  expect(readSiteTheme("shared:\n  time_zone: Europe/Rome\n", () => "{}")).toEqual({ parts: { header: {}, footer: {} }, timeZone: "Europe/Rome" });
});

test("a starter the editor could not save back stops the build, each value named in the CMS's words and its file's name", () => {
  const header = starter("header");
  const menu = header.sections[0]!.children[1]!.children[0]!;
  (menu.props.items as Array<{ href: string }>)[0]!.href = "javascript:alert(1)";
  const said = stopped({ header });
  expect(said).toContain(SENTENCE);
  expect(said).toContain("header.json: /sections/0/children/1/children/0/props/items/0/href (pattern)");
  expect(said).not.toContain("footer.json");
  // The CMS stops with the same sentence (config/initializers/site_parts.rb).
  expect(readFileSync(join(repoRoot, "cms", "config", "initializers", "site_parts.rb"), "utf8")).toContain(SENTENCE);
});

test("a form in a starter stops the build at the form, by the part's own rule, once the schema passes", () => {
  const footer = starter("footer");
  const form: Block = {
    id: "footer-form",
    type: "form",
    props: { items: [{ name: "email", kind: "email", label: "Email", required: true }], submitLabel: "Send", confirmation: "Sent." },
    children: [],
    style: { base: {} },
  };
  footer.sections[0]!.children[0]!.children.push(form);
  const at = `/sections/0/children/0/children/${footer.sections[0]!.children[0]!.children.length - 1}`;
  expect(starterProblems(footer)).toEqual([`${at} (part): A header or footer holds no form: a form's answers belong to the page it is on.`]);
  expect(stopped({ footer })).toContain(`footer.json: ${at} (part)`);
});

test("an anchor on a starter's section stops the build at the anchor, by the part's own rule", () => {
  const header = starter("header");
  header.sections[0]!.props = { ...header.sections[0]!.props, anchor: "top" };
  expect(starterProblems(header)).toEqual(["/sections/0/props/anchor (part): A header or footer block takes no anchor: it would be on every page, where the page's own blocks have theirs."]);
  expect(stopped({ header })).toContain("header.json: /sections/0/props/anchor (part)");
});

test("the application rules come before the schema, as the CMS runs them", () => {
  const header = starter("header");
  const logo = header.sections[0]!.children[0]!.children[0]!;
  logo.props.name = `\ud800${"N".repeat(60)}`;
  expect(starterProblems(header)).toEqual(["/sections/0/children/0/children/0/props/name (wellFormed): A string holds half of a surrogate pair."]);
  logo.props.name = "N".repeat(60);
  expect(starterProblems(header)).toEqual(["/sections/0/children/0/children/0/props/name (maxLength): must NOT have more than 40 characters"]);
});
