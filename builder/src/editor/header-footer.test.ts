// The header and footer's values as their panel changes them
// (./header-footer.ts): the limits it says are the schema's own, a link is
// added up to the most, taken away and moved without changing the others,
// a refusal is said in words about the value, and a link of the header is
// offered the site's pages and sections, each named with its page's
// address.
// @vitest-environment node
import { expect, test } from "vitest";
import schema from "../../../schema/block-document.schema.json";
import type { SiteValues } from "../storage/adapter.ts";
import { addLink, linkChoices, moveLink, removeLink, sectionTargets, sentencesAt, setActionPart, setLink, SITE_LIMITS } from "./header-footer.ts";
import type { PageDocument } from "../shared/document.ts";

const site: SiteValues = {
  name: "Slack Water",
  menu: [{ label: "Swims", href: "/#swims" }, { label: "Gallery", href: "/#gallery" }, { label: "Meet us", href: "/#meet" }],
  action: { label: "Join", href: "/#join" },
  footer: { lead: "Slack Water swimming club.", text: "Tide times are a guide, not a promise." },
};

test("the limits the panel says are $defs/site's", () => {
  const def = schema.$defs.site.properties;
  expect(SITE_LIMITS).toEqual({
    name: def.name.maxLength,
    links: def.menu.maxItems,
    label: def.menu.items.properties.label.maxLength,
    button: def.action.properties.label.maxLength,
    lead: def.footer.properties.lead.maxLength,
    text: def.footer.properties.text.maxLength,
  });
});

test("a link is added at the end up to the most, taken away, and moved one place, the others as they were", () => {
  const added = addLink(site);
  expect(added.menu.map((l) => l.label)).toEqual(["Swims", "Gallery", "Meet us", ""]);
  let full = site;
  for (let i = 0; i < 10; i += 1) full = addLink(full);
  expect(full.menu).toHaveLength(SITE_LIMITS.links);
  expect(removeLink(site, 1).menu.map((l) => l.label)).toEqual(["Swims", "Meet us"]);
  expect(moveLink(site, 2, -1).menu.map((l) => l.label)).toEqual(["Swims", "Meet us", "Gallery"]);
  expect(moveLink(site, 0, 1).menu.map((l) => l.label)).toEqual(["Gallery", "Swims", "Meet us"]);
  // At an end, a move changes nothing.
  expect(moveLink(site, 0, -1)).toBe(site);
  expect(moveLink(site, 2, 1)).toBe(site);
  expect(setLink(site, 1, "href", "/gallery").menu[1]).toEqual({ label: "Gallery", href: "/gallery" });
  expect(setActionPart({ ...site, action: null }, "label", "Swim")).toMatchObject({ action: { label: "Swim", href: "" } });
  // The value given is never changed in place.
  expect(site.menu.map((l) => l.label)).toEqual(["Swims", "Gallery", "Meet us"]);
});

test("a refusal is said about the value: its limit, the kind of value it must be, and an empty one as empty", () => {
  const errors = [
    { pointer: "/name", keyword: "maxLength", blockPointer: null, message: "is longer than 28" },
    { pointer: "/menu/1/href", keyword: "pattern", blockPointer: null, message: "does not match ^(?:https?://..." },
    { pointer: "/menu/2/label", keyword: "pattern", blockPointer: null, message: "does not match" },
    { pointer: "/menu", keyword: "maxItems", blockPointer: null, message: "has more than 8 items" },
  ];
  expect(sentencesAt(errors, "/name", "N".repeat(29))).toEqual(["Up to 28 characters."]);
  expect(sentencesAt(errors, "/menu/1/href", "javascript:alert(1)")).toEqual(["Use a full address (https://…), a path on this site (/…), #anchor, mailto: or tel:."]);
  expect(sentencesAt(errors, "/menu/1/href", "")).toEqual(["This cannot be empty."]);
  expect(sentencesAt(errors, "/menu/2/label", " ")).toEqual(["This cannot be empty."]);
  expect(sentencesAt(errors, "/menu")).toEqual(["Up to 8 links."]);
  expect(sentencesAt(errors, "/footer/lead", "fine")).toEqual([]);
});

test("a link can lead to every page, and to the sections with an anchor, named with their page's address", () => {
  const home: PageDocument = {
    schemaVersion: 1,
    title: "Home",
    sections: [
      { id: "s1", type: "section", props: { label: "Swims", anchor: "swims" }, style: { base: {} }, children: [] },
      { id: "s2", type: "section", props: {}, style: { base: {} }, children: [] },
      { id: "s3", type: "section", props: { anchor: "join" }, style: { base: {} }, children: [] },
    ],
  };
  expect(sectionTargets(home)).toEqual([{ anchor: "swims", label: "Swims" }, { anchor: "join", label: null }]);
  const pages = [{ id: 1, title: "Home", slug: "home", home: true }, { id: 2, title: "Winter series", slug: "winter", home: false }];
  const sections = new Map([[1, sectionTargets(home)], [2, [{ anchor: "tides", label: "Tides" }]]]);
  expect(linkChoices(pages, sections)).toEqual([
    { value: "/", label: "Home" },
    { value: "/#swims", label: "Home, Swims section" },
    { value: "/#join", label: "Home, #join section" },
    { value: "/winter", label: "Winter series" },
    { value: "/winter#tides", label: "Winter series, Tides section" },
  ]);
  expect(linkChoices(pages, new Map())).toEqual([{ value: "/", label: "Home" }, { value: "/winter", label: "Winter series" }]);
});
