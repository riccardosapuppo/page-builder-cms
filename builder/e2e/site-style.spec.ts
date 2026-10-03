// Site style in Chromium, against the run's CMS: the one screen that
// changes the site's tokens. A tone chosen for a slot, and a type scale,
// show on the canvas at once, are kept by the CMS, and the published page
// follows on its next request, as a visitor's browser draws it. The tests
// of a run share one CMS, so the site's style is put back afterwards.
import type { APIRequestContext } from "@playwright/test";
import { cms, column, expect, heading, makePage, open, section, test } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const HARBOUR = "rgb(29, 78, 111)";
const SEA = "rgb(30, 91, 76)";

async function siteStyle(request: APIRequestContext): Promise<{ palette: Record<string, string>; typeScale: string }> {
  return (await (await request.get(`${cms()}/api/site-style`)).json()) as never;
}

test("a tone and a type scale chosen in Site style show on the canvas at once, and on the published page once the CMS has them", { tag: "@a11y" }, async ({ page, request }) => {
  const before = await siteStyle(request);
  try {
    const { id, slug } = await makePage(request, "Styled", [section("s", "Story", [column("c", [heading("h", "In the site's colours")])])]);
    expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
    await open(page, id);
    const canvasHeading = page.locator('.canvas [data-block-id="h"] h2');
    await expect(canvasHeading).toHaveCSS("color", SEA);

    const button = page.getByRole("button", { name: "Site style", exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const panel = page.getByRole("complementary", { name: "Site style" });
    await panel.getByRole("button", { name: /^Primary/ }).click();
    await panel.getByRole("radio", { name: "Harbour" }).click();
    await expect(canvasHeading).toHaveCSS("color", HARBOUR);
    await expect(panel.getByRole("status")).toHaveText("Saved for every page");
    await expect(panel.getByRole("list", { name: "Contrast checks" }).getByRole("listitem")).toHaveText([
      "Button text on it: 8.8 to 1, easy to read",
      "Links on the background: 8.8 to 1, easy to read",
    ]);
    expect((await siteStyle(request)).palette.primary).toBe("site-harbour");

    // The type scale, by the keyboard: the arrows move the choice.
    await panel.getByRole("radio", { name: "Balanced" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(panel.getByRole("radio", { name: "Strong" })).toBeFocused();
    await expect(panel.getByRole("radio", { name: "Strong" })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".canvas .site")).toHaveAttribute("data-type-scale", "strong");
    await expect(panel.getByRole("status")).toHaveText("Saved for every page");

    // The published page, as a visitor's browser draws it.
    const visitor = await page.context().newPage();
    await visitor.goto(`${cms()}/${slug}`);
    await expect(visitor.locator(".site")).toHaveAttribute("data-primary", "site-harbour");
    await expect(visitor.locator(".site")).toHaveAttribute("data-type-scale", "strong");
    await expect(visitor.getByRole("heading", { name: "In the site's colours" })).toHaveCSS("color", HARBOUR);
    await visitor.close();

    // Back to a new site's tone; the panel closes back to its button.
    await panel.getByRole("button", { name: "Reset to Sea" }).click();
    await expect(canvasHeading).toHaveCSS("color", SEA);
    await expect(panel.getByRole("status")).toHaveText("Saved for every page");
    expect((await siteStyle(request)).palette.primary).toBe("site-sea");
    await panel.getByRole("button", { name: "Close site style" }).click();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-pressed", "false");
  } finally {
    const put = await request.put(`${cms()}/api/site-style`, { data: { palette: before.palette, typeScale: before.typeScale } });
    expect(put.status()).toBe(200);
  }
});

test("a tone chosen while the one before is on its way: closing the tab asks first, and the CMS ends with the last tone", async ({ page, request }) => {
  const before = await siteStyle(request);
  try {
    const { id } = await makePage(request, "Styled twice", [section("s", "Story", [column("c", [heading("h", "Two tones")])])]);
    await open(page, id);
    // Every site-style save takes three seconds on its way to the CMS.
    await page.route("**/api/site-style", async (route) => {
      if (route.request().method() === "PUT") await new Promise((done) => setTimeout(done, 3_000));
      await route.fallback();
    });
    await page.getByRole("button", { name: "Site style", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Site style" });
    await panel.getByRole("button", { name: /^Primary/ }).click();
    await panel.getByRole("radio", { name: "Harbour" }).click();
    // Kelp waits behind Harbour, which is on its way.
    await panel.getByRole("radio", { name: "Kelp" }).click();
    const asksBeforeClosing = () => page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(await asksBeforeClosing()).toBe(true);
    // The browser's own question, answered "stay".
    const asked = page.waitForEvent("dialog");
    void page.close({ runBeforeUnload: true });
    const dialog = await asked;
    expect(dialog.type()).toBe("beforeunload");
    await dialog.dismiss();
    expect(page.isClosed()).toBe(false);

    await expect(panel.getByRole("status")).toHaveText("Saved for every page", { timeout: 15_000 });
    expect((await siteStyle(request)).palette.primary).toBe("site-kelp");
    expect(await asksBeforeClosing()).toBe(false);
  } finally {
    const put = await request.put(`${cms()}/api/site-style`, { data: { palette: before.palette, typeScale: before.typeScale } });
    expect(put.status()).toBe(200);
  }
});
