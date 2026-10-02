// The canvas can draw with the published page's CSS: src/shared/site.css,
// which imports the CMS's own site.css and tokens.css, applied in the
// editor's page to page roots at the editor's three preview widths. The
// layout must follow the width of the page root, not of the window (the
// container queries the plan chose so the canvas needs no iframe), the
// values must be those of schema/tokens.json, and the fonts must load from
// where the repository keeps them.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { tokensFile } from "../build/paths.ts";

interface Tokens {
  space: { site: Record<string, number> };
  type: { site: Record<string, { desktop: [number, number]; tablet: [number, number]; phone: [number, number] }> };
  color: Record<string, string>;
  "site-tones": Record<string, { default: string }>;
}
const tokens = JSON.parse(readFileSync(tokensFile, "utf8")) as Tokens;
const heading2 = tokens.type.site["heading-2"]!;
const primary = tokens.color[tokens["site-tones"].primary!.default]!;
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

test("the published page's CSS lays out each page root by its own width, in the tokens' values and fonts", async ({ page }) => {
  const fonts: Array<{ url: string; status: number }> = [];
  page.on("response", (response) => {
    if (response.url().endsWith(".woff2")) fonts.push({ url: response.url(), status: response.status() });
  });
  // One window width for all three: only the page roots differ.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/e2e/pages/canvas.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const measured = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".site")].map((site) => {
    const cols = site.querySelector(".cols")!;
    const col = site.querySelector<HTMLElement>(".col.pad-none")!;
    const heading = site.querySelector<HTMLElement>(".w-heading")!;
    return {
      width: Number(site.dataset.width),
      tracks: getComputedStyle(cols).gridTemplateColumns.split(" ").length,
      padding: getComputedStyle(col).paddingTop,
      fontSize: getComputedStyle(heading).fontSize,
      color: getComputedStyle(heading).color,
      fontFamily: getComputedStyle(heading).fontFamily,
    };
  }));

  expect(measured).toEqual([
    { width: 1280, tracks: 2, padding: "0px", fontSize: `${heading2.desktop[0]}px`, color: rgb(primary), fontFamily: expect.stringContaining("Archivo") },
    { width: 768, tracks: 1, padding: `${tokens.space.site.l}px`, fontSize: `${heading2.tablet[0]}px`, color: rgb(primary), fontFamily: expect.stringContaining("Archivo") },
    { width: 390, tracks: 1, padding: `${tokens.space.site.xl}px`, fontSize: `${heading2.phone[0]}px`, color: rgb(primary), fontFamily: expect.stringContaining("Archivo") },
  ]);

  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family.replaceAll('"', "")} ${f.style}`).sort());
  expect(loaded).toEqual(["Archivo normal", "Instrument Sans normal", "Source Serif 4 normal"]);
  // Each fetched from the editor's server, from cms/app/assets/fonts or design/fonts.
  expect(fonts.map((f) => [new URL(f.url).pathname.split("/").slice(-1)[0], f.status]).sort()).toEqual([
    ["archivo-variable.woff2", 200],
    ["instrument-sans-variable.woff2", 200],
    ["source-serif-4-variable.woff2", 200],
  ]);
  expect(fonts.map((f) => new URL(f.url).pathname).filter((p) => p.includes("/cms/app/assets/fonts/")).length).toBe(2);
  expect(fonts.map((f) => new URL(f.url).pathname).filter((p) => p.includes("/design/fonts/")).length).toBe(1);
});
