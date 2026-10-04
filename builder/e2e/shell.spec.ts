// The editor's page boots in a browser: its bundle loads without an error
// and draws the approved design's shell, and an address that is no file
// is a 404, never the editor's page.
import { expect, test } from "@playwright/test";

test("the editor's page loads its shell without an error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  // The approved layout's frame: the top bar, the sidebar with its two
  // tabs, the bottom line with the devices; no drawer open.
  await expect(page.getByRole("button", { name: "Page Builder CMS menu" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Look at the page on" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Settings" })).toBeVisible();
  await expect(page.locator(".drawer")).toHaveCount(0);
  // Whatever pages the run has made so far, the canvas's place shows a
  // page or says why there is none, and is no longer opening one.
  await expect(page.getByRole("main", { name: "Page canvas" })).not.toHaveAttribute("aria-busy", "true");
  expect(errors).toEqual([]);
});

test("an address that is no file is a 404, not the editor's page", async ({ request }) => {
  const missing = await request.get("/no-such-file.js");
  expect(missing.status()).toBe(404);
  const page = await request.get("/no-such-page");
  expect(page.status()).toBe(404);
});
