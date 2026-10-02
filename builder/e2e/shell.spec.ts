// The editor's page boots in a browser: its bundle loads without an error,
// and the schema's validator, compiled ahead of time, runs there.
import { expect, test } from "@playwright/test";

test("the editor's page loads and validates a new page in the browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page Builder CMS");
  await expect(page.locator("[data-check=validator]")).toHaveText("A new page passes the document schema.");
  expect(errors).toEqual([]);
});

test("an address that is no file is a 404, not the editor's page", async ({ request }) => {
  const missing = await request.get("/no-such-file.js");
  expect(missing.status()).toBe(404);
  const page = await request.get("/no-such-page");
  expect(page.status()).toBe(404);
});
