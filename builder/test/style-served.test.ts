// servedWithStyle (./style-served.ts), against a CMS that another test file
// is changing the style of: a page served while the style was changed and
// put back is served again, and one served while it held still comes back
// with that style.
// @vitest-environment node
import { expect, test } from "vitest";
import type { SiteStyle } from "../src/storage/adapter.ts";
import { servedWithStyle } from "./style-served.ts";

const style = (typeScale: string, updatedAt: string | null): SiteStyle => ({ palette: { primary: "site-sea" }, typeScale, updatedAt, choices: { palette: { primary: [{ color: "site-sea" }] }, typeScales: [{ name: "balanced" }, { name: "strong" }] } }) as unknown as SiteStyle;

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
