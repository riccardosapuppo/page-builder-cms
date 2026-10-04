// The checks every page a test drives is held to (helpers/site.ts,
// watchQuietly), planted on a page of a browser the test launches for
// itself, as the tests that need a browser drawing its scrollbars do: an
// error on the page, an error in its console and a request to a host
// other than the run's two servers are each caught, the request refused
// before it leaves the machine, and a picture "from another site" is
// answered inside the browser.
import { chromium } from "@playwright/test";
import { expect, test, watchQuietly } from "./helpers/site.ts";

test("a browser a test launches for itself is held to the shared checks, which catch what is planted", async ({ baseURL }) => {
  const own = await chromium.launch({ headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
  try {
    const page = await own.newPage({ baseURL: baseURL!, locale: "en-US", timezoneId: "UTC" });
    const errors = await watchQuietly(page, baseURL!);
    await page.goto("/");
    await expect(page.locator(".app")).toBeVisible();
    expect(errors).toEqual([]);

    const answered = await page.evaluate(async () => {
      // As the pages show them: in an image, the 1 by 1 picture.
      const picture = new Image();
      picture.src = "https://images.example.org/bay.jpg";
      await picture.decode();
      const elsewhere = await fetch("https://elsewhere.example.net/beacon", { mode: "no-cors" }).then(() => "reached", () => "refused");
      console.error("a planted console error");
      setTimeout(() => {
        throw new Error("a planted page error");
      });
      return { picture: picture.naturalWidth, elsewhere };
    });
    expect(answered).toEqual({ picture: 1, elsewhere: "refused" });
    // Each caught (the browser may add its own line for the refused request).
    await expect.poll(() => errors).toEqual(expect.arrayContaining(["a planted console error", "a planted page error", "request outside the run's servers: https://elsewhere.example.net/beacon"]));
  } finally {
    await own.close();
  }
});
