// servedWithStyle (./style-served.ts), against a CMS that another test file
// is changing the style of: a page served while the style was changed and
// put back is served again, and one served while it held still comes back
// with that style. servedWithParts, the same for the header and footer.
// @vitest-environment node
import { expect, test } from "vitest";
import type { PageSummary, SiteStyle } from "../src/storage/adapter.ts";
import { servedWithParts, servedWithStyle } from "./style-served.ts";

const style = (typeScale: string, updatedAt: string | null): SiteStyle => ({ palette: { primary: "site-sea" }, typeScale, letterWidth: "normal", updatedAt, choices: { palette: { primary: [{ color: "site-sea" }] }, typeScales: [{ name: "balanced" }, { name: "strong" }], letterWidths: [{ name: "normal" }] } }) as unknown as SiteStyle;

// A CMS whose style a contract changes at the given serves (counted from
// 1) and puts back before the next read: each such serve draws the page in
// the other scale, and the stored style's updatedAt moves on twice.
function cms(changedAt: number[]) {
  let stored = style("balanced", "2026-10-05T00:00:00.000Z");
  let serves = 0;
  let moment = 0;
  const adapter = { getSiteStyle: async () => stored };
  const serve = async () => {
    serves += 1;
    if (!changedAt.includes(serves)) return stored.typeScale;
    moment += 2;
    stored = style("balanced", `2026-10-05T00:00:00.${String(moment).padStart(3, "0")}Z`);
    return "strong";
  };
  return { adapter, serve, serves: () => serves };
}

test("a page served while the style was changed and put back is served again, then comes with the style stored", async () => {
  const { adapter, serve, serves } = cms([1, 2]);
  const { served, stored } = await servedWithStyle(adapter, serve);
  expect(served).toBe("balanced");
  expect(stored.typeScale).toBe("balanced");
  expect(serves()).toBe(3);
});

test("a page served while nothing changed the style is served once", async () => {
  const { adapter, serve, serves } = cms([]);
  expect((await servedWithStyle(adapter, serve)).served).toBe("balanced");
  expect(serves()).toBe(1);
});

test("a style changed at every serve is said, not waited for", async () => {
  const { adapter, serve } = cms([1, 2, 3, 4, 5]);
  await expect(servedWithStyle(adapter, serve)).rejects.toThrow("the site style changed while the page was served, 5 times running");
});

// A CMS whose header another suite publishes at the given serves: each
// such serve draws the header before, and its published version moves on.
function partsCms(publishedAt: number[]) {
  let version = 1;
  let serves = 0;
  const parts = () => [{ kind: "header", published: { versionNumber: version } }, { kind: "footer", published: null }] as unknown as PageSummary[];
  const adapter = { listParts: async () => parts() };
  const serve = async () => {
    serves += 1;
    const drawn = `header ${version}`;
    if (publishedAt.includes(serves)) version += 1;
    return drawn;
  };
  return { adapter, serve, serves: () => serves };
}

test("a page served while the header was published is served again, then comes with the parts as they stood", async () => {
  const { adapter, serve, serves } = partsCms([1]);
  const { served, parts } = await servedWithParts(adapter, serve);
  expect([served, parts[0]?.published?.versionNumber, serves()]).toEqual(["header 2", 2, 2]);
});

test("a header published at every serve is said, not waited for", async () => {
  const { adapter, serve } = partsCms([1, 2, 3, 4, 5]);
  await expect(servedWithParts(adapter, serve)).rejects.toThrow("the header or footer was published while the page was served, 5 times running");
});
