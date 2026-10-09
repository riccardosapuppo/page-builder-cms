// The site's header and footer as the Header and footer panel changes them
// (./HeaderFooterPanel.tsx): the four values a change sends, a step at a
// time, each step a new value, so the panel, the shell and their tests
// share them; the limits the panel says, which are the schema's
// ($defs/site, held to it by header-footer.test.ts); the words for a value
// refused; and where a link of the header can lead: the site's pages and
// the sections of a page that have an anchor.
import type { PageDocument } from "../shared/document.ts";
import type { FieldError, PageSummary, Site, SiteLink, SiteValues } from "../storage/adapter.ts";
import { explain, type FieldRules } from "./errors.ts";
import type { SectionTarget } from "./session.tsx";

// The lengths and the count $defs/site allows, in characters as a reader
// counts them. With them the header keeps to one row on a phone in words
// of average width; wider words wrap the row rather than leave the page.
export const SITE_LIMITS = { name: 28, links: 8, label: 24, button: 18, lead: 80, text: 160 } as const;

// Said when a save is refused for values the panel marks.
export const SITE_NOT_SAVED = "Not saved: every page keeps the header and footer it had. Put right what is marked below.";

export const siteValues = (site: Site): SiteValues => ({ name: site.name, menu: site.menu, action: site.action, footer: site.footer });

export const EMPTY_LINK: SiteLink = { label: "", href: "" };

export function setName(values: SiteValues, name: string): SiteValues {
  return { ...values, name };
}

// A new link at the end of the menu, while it holds fewer than the most.
export function addLink(values: SiteValues, link: SiteLink = EMPTY_LINK): SiteValues {
  if (values.menu.length >= SITE_LIMITS.links) return values;
  return { ...values, menu: [...values.menu, link] };
}

export function removeLink(values: SiteValues, index: number): SiteValues {
  if (index < 0 || index >= values.menu.length) return values;
  return { ...values, menu: values.menu.filter((_, k) => k !== index) };
}

// The link at index one place up (-1) or down (1); at an end it stays.
export function moveLink(values: SiteValues, index: number, by: -1 | 1): SiteValues {
  const to = index + by;
  if (index < 0 || index >= values.menu.length || to < 0 || to >= values.menu.length) return values;
  const menu = [...values.menu];
  [menu[index], menu[to]] = [menu[to]!, menu[index]!];
  return { ...values, menu };
}

export function setLink(values: SiteValues, index: number, part: keyof SiteLink, text: string): SiteValues {
  const link = values.menu[index];
  if (!link) return values;
  return { ...values, menu: values.menu.map((l, k) => (k === index ? { ...link, [part]: text } : l)) };
}

// The header's button: null takes it away.
export function setAction(values: SiteValues, action: SiteLink | null): SiteValues {
  return { ...values, action };
}

export function setActionPart(values: SiteValues, part: keyof SiteLink, text: string): SiteValues {
  return { ...values, action: { ...(values.action ?? EMPTY_LINK), [part]: text } };
}

export function setFooter(values: SiteValues, part: "lead" | "text", text: string): SiteValues {
  return { ...values, footer: { ...values.footer, [part]: text } };
}

// What kind of value a pointer names, for the sentence about a refusal.
export function rulesAt(pointer: string): FieldRules {
  if (pointer === "/name") return { kind: "line", maxLength: SITE_LIMITS.name };
  if (/^\/menu\/\d+\/label$/.test(pointer)) return { kind: "line", maxLength: SITE_LIMITS.label };
  if (pointer === "/action/label") return { kind: "line", maxLength: SITE_LIMITS.button };
  if (/^\/(menu\/\d+|action)\/href$/.test(pointer)) return { kind: "href", maxLength: 2048 };
  if (pointer === "/footer/lead") return { kind: "line", maxLength: SITE_LIMITS.lead };
  if (pointer === "/footer/text") return { kind: "line", maxLength: SITE_LIMITS.text };
  return {};
}

// The sentences for the problems at one value: an empty value says so,
// whatever rule it broke; a list too long says how many it takes.
export function sentencesAt(errors: readonly FieldError[], pointer: string, value?: string): string[] {
  const found = errors.filter((e) => e.pointer === pointer);
  const said = found.map((e) => {
    if (value !== undefined && value.trim() === "") return "This cannot be empty.";
    if (e.keyword === "maxItems") return `Up to ${SITE_LIMITS.links} links.`;
    return explain(e.keyword, e.message, rulesAt(pointer));
  });
  return [...new Set(said)];
}

// The sections of a page that a link can lead to: those with an anchor.
export function sectionTargets(document: PageDocument): SectionTarget[] {
  return document.sections.flatMap((section) => (section.props.anchor ? [{ anchor: section.props.anchor, label: section.props.label ?? null }] : []));
}

// Where a link of the header can lead, for its link field to offer: every
// page of the site, and the sections of the pages whose sections are
// known, each named by its page's title (and its label). The header is on
// every page, so a section is named with its page's address ("/#swims" on
// the home page), never by its anchor alone, which would lead to the page
// the visitor is on.
export function linkChoices(pages: readonly Pick<PageSummary, "id" | "title" | "slug" | "home">[], sections: ReadonlyMap<number, readonly SectionTarget[]>): Array<{ value: string; label: string }> {
  const choices: Array<{ value: string; label: string }> = [];
  for (const page of pages) {
    const address = page.home ? "/" : `/${page.slug}`;
    choices.push({ value: address, label: page.title });
    for (const target of sections.get(page.id) ?? []) {
      choices.push({ value: `${address}#${target.anchor}`, label: `${page.title}, ${target.label ?? `#${target.anchor}`} section` });
    }
  }
  return choices;
}
