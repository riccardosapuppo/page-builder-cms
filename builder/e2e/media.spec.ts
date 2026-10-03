// The media library in Chromium, against the run's CMS (design/shots/media.png):
// - stage 3's stop: an image uploaded (drawn again at 2400 px in the
//   browser, its progress shown), given its alt text, placed as one step,
//   published, and the served page showing it with that alt text; undo
//   and redo take it off and put back the same image;
// - a photo whose camera wrote "turn a quarter" goes up turned, and with
//   no EXIF left in it;
// - uploads refused, each saying why: an SVG, in the browser; one too
//   large once made ready, by the CMS;
// - delete from the screen (the delivery list's item 24): an image a page
//   shows is kept, and the library says which page; another one goes;
// - axe on the open library.
import type { Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { noisePng, png, pngSize, withOrientation } from "./helpers/images.ts";
import { cms, column, expect, heading, makePage, open, saved, section, test, unique, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

interface Listed {
  id: string;
  filename: string;
  alt: string;
  width: number;
  height: number;
  contentType: string;
  url: string;
}

async function libraryItem(page: Page, filename: string): Promise<Listed | undefined> {
  const response = await page.request.get(`${cms()}/api/media`);
  return ((await response.json()) as { media: Listed[] }).media.find((m) => m.filename === filename);
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Media library" });

// The library from the mark's menu, to look after it.
async function openLibrary(page: Page) {
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  await expect(dialog(page)).toBeVisible();
}

async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await dialog(page).getByLabel("Images to upload").setInputFiles(file);
}

test("an image uploaded, described and placed is published, and the served page shows it with its alt text", { tag: "@a11y" }, async ({ page }) => {
  const { id, slug } = await makePage(page.request, "Harbour day", [section("s", "Story", [column("c", [heading("h", "At the harbour")])])]);
  await open(page, id);
  // 3000 by 1500, the left half sea green and the right half sand.
  const name = `${unique("harbour")}.png`;
  const source = png(3000, 1500, (x) => (x < 1500 ? [30, 110, 90] : [230, 200, 140]));
  // The bytes are held back a moment, so the progress can be seen.
  await page.route("**/rails/active_storage/disk/**", async (route) => {
    if (route.request().method() === "PUT") await new Promise((done) => setTimeout(done, 1200));
    await route.fallback();
  });

  await block(page, "h").click();
  await page.getByRole("tab", { name: "Add" }).click();
  await page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Image" }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByText(/^Images you upload are available on every page\. The CMS makes no smaller copies of them, so each is resized here first, to 2400 px at most on its long side\.$/)).toBeVisible();
  await upload(page, { name, mimeType: "image/png", buffer: source });
  await expect(dialog(page).getByRole("progressbar", { name: `Uploading ${name}` })).toBeVisible();
  // Nothing is placed while it goes up.
  await expect(block(page, "c").locator("img")).toHaveCount(0);

  const tile = dialog(page).getByRole("radio", { name: `${name}, no alt text` });
  await expect(tile).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  await expect(dialog(page).getByRole("progressbar")).toHaveCount(0);
  const add = dialog(page).getByRole("button", { name: "Add image" });
  await expect(add).toHaveAttribute("aria-disabled", "true");
  await expect(dialog(page).getByText(/^Add alt text to use this image\. Describe what it shows/)).toBeVisible();

  const report = await axe(page, { include: ".dlg-media" });
  expect(report.serious).toEqual([]);
  expect(report.passes).toBeGreaterThan(10);

  // Drawn again in the browser: 2400 by 1200, as the CMS keeps it.
  const kept = await libraryItem(page, name);
  expect(kept).toMatchObject({ width: 2400, height: 1200, contentType: "image/png", alt: "" });
  expect(pngSize(await (await page.request.get(`${cms()}${kept!.url}`)).body())).toEqual({ width: 2400, height: 1200 });

  const ALT = "Fishing boats moored in the harbour at noon";
  // Pressed while it waits (aria-disabled, so still reachable), it takes
  // the person to the field it waits for.
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page).getByRole("textbox", { name: /^Alt text/ })).toBeFocused();
  await dialog(page).getByRole("textbox", { name: /^Alt text/ }).fill(ALT);
  await add.click();
  await expect(dialog(page)).toHaveCount(0);

  const placed = block(page, "c").getByRole("img", { name: ALT });
  await expect(placed).toBeVisible();
  expect(await placed.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(2400);
  // One step in the history, and the library keeps the text for next time.
  await page.getByRole("button", { name: "History" }).click();
  const steps = page.getByRole("complementary", { name: "History" }).getByRole("list", { name: "This session" }).getByRole("button");
  await expect(steps).toHaveCount(1);
  await expect(steps.first()).toContainText(/^Added Image/);
  await page.getByRole("button", { name: "Close history" }).click();
  await expect.poll(async () => (await libraryItem(page, name))?.alt).toBe(ALT);

  // Undo takes it off; redo puts back the same image.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(block(page, "c").locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(block(page, "c").getByRole("img", { name: ALT })).toHaveAttribute("src", kept!.url);
  await saved(page);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".topbar .chip")).toHaveText("Published");
  const served = await page.context().newPage();
  await served.goto(`${cms()}/${slug}`);
  const image = served.getByRole("img", { name: ALT });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("width", "2400");
  await expect(image).toHaveAttribute("height", "1200");
  expect(await image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(2400);
  await served.close();
});

test("a photo whose camera says to turn it goes up turned, and keeps none of the camera's notes", async ({ page }) => {
  const { id } = await makePage(page.request, "Turned", [section("s", "Story", [column("c", [heading("h", "Turned")])])]);
  await open(page, id);
  // 64 by 32, red on the left and blue on the right, with orientation 6:
  // turned a quarter clockwise, the red is on top, and it stands 32 by 64.
  const jpeg = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(64, 32);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, 32, 32);
    context.fillStyle = "#0000ff";
    context.fillRect(32, 0, 32, 32);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  const name = `${unique("turned")}.jpg`;
  await openLibrary(page);
  await upload(page, { name, mimeType: "image/jpeg", buffer: withOrientation(Buffer.from(jpeg), 6) });
  await expect(dialog(page).getByRole("radio", { name: `${name}, no alt text` })).toBeVisible({ timeout: 30_000 });

  const kept = await libraryItem(page, name);
  expect(kept).toMatchObject({ width: 32, height: 64, contentType: "image/jpeg" });
  const bytes = await (await page.request.get(`${cms()}${kept!.url}`)).body();
  expect(bytes.includes(Buffer.from("Exif", "latin1"))).toBe(false);
  const drawn = await page.evaluate(async (url) => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, top: [...context.getImageData(16, 12, 1, 1).data], bottom: [...context.getImageData(16, 52, 1, 1).data] };
  }, kept!.url);
  expect([drawn.width, drawn.height]).toEqual([32, 64]);
  const [r1, , b1] = drawn.top;
  const [r2, , b2] = drawn.bottom;
  expect(r1! > 200 && b1! < 60).toBe(true);
  expect(r2! < 60 && b2! > 200).toBe(true);
});

test("an SVG is refused in the browser, and an image too large once made ready by the CMS; each says why", async ({ page }) => {
  const { id } = await makePage(page.request, "Refusals", [section("s", "Story", [column("c", [heading("h", "Refusals")])])]);
  await open(page, id);
  await openLibrary(page);
  const svg = `${unique("drawing")}.svg`;
  await upload(page, { name: svg, mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>') });
  await expect(dialog(page).getByRole("alert")).toHaveText("Not added: SVG images are not taken: an SVG is a document that can carry script. Save it as PNG or WebP, and upload that.");
  await dialog(page).getByRole("button", { name: `Dismiss ${svg}` }).click();

  // 2000 by 2000 of noise: within 2400, but no encoder makes it small.
  const noise = `${unique("noise")}.png`;
  await upload(page, { name: noise, mimeType: "image/png", buffer: noisePng(2000, 2000, 20261003) });
  const refused = dialog(page).getByRole("alert");
  await expect(refused).toHaveText(/^Not added: The CMS refused it: ready to go up it is 1[0-9](\.[0-9])? MB, and the CMS takes images up to 10 MB\. Save it as JPEG or WebP, or crop it, and upload it again\.$/, { timeout: 30_000 });
  expect(await libraryItem(page, svg)).toBeUndefined();
  expect(await libraryItem(page, noise)).toBeUndefined();
});

test.describe("deleting", () => {
  // The CMS answers 409 to the image a page shows; the browser says so in
  // its console.
  test.use({ allowConsole: /status of 409/ });

  test("an image a page shows is kept, and the library says which page; one no page shows is deleted", async ({ page }) => {
    const { id: setup } = await makePage(page.request, "Upload desk", [section("s", "Desk", [column("c", [heading("h", "Desk")])])]);
    await open(page, setup);
    await openLibrary(page);
    const shown = `${unique("pier")}.png`;
    const spare = `${unique("spare")}.png`;
    await upload(page, { name: shown, mimeType: "image/png", buffer: png(40, 30, () => [20, 60, 120]) });
    await expect(dialog(page).getByRole("radio", { name: `${shown}, no alt text` })).toBeVisible({ timeout: 30_000 });
    await upload(page, { name: spare, mimeType: "image/png", buffer: png(40, 30, () => [200, 160, 40]) });
    await expect(dialog(page).getByRole("radio", { name: `${spare}, no alt text` })).toBeVisible({ timeout: 30_000 });
    const pier = (await libraryItem(page, shown))!;

    // A page that shows the first one, saved as the editor would.
    const title = unique("Pier walk");
    const { id } = await makePage(page.request, title, [section("s", "Walk", [column("c", [widget("i", "image", { mediaId: pier.id, alt: "The pier" })])])]);
    await open(page, id);
    await openLibrary(page);
    await dialog(page).getByRole("radio", { name: `${shown}, no alt text, on this page` }).click();
    await dialog(page).getByRole("button", { name: "Delete from library" }).click();
    await expect(dialog(page).getByRole("button", { name: "Keep it" })).toBeFocused();
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
    // The page's draft shows it, and so does the version the CMS kept on
    // its own at the page's first save.
    const named = title.replace(/[-.]/g, "\\$&");
    await expect(dialog(page).getByText(new RegExp(`^Not deleted: it is still shown by the page ${named}, and a kept version of ${named} \\(\\d+\\)\\. Take it off that page first\\. A kept version holds its images for as long as it is kept\\.$`))).toBeVisible();
    expect(await libraryItem(page, shown)).toBeDefined();

    await dialog(page).getByRole("radio", { name: `${spare}, no alt text` }).click();
    await dialog(page).getByRole("button", { name: "Delete from library" }).click();
    await dialog(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog(page).getByText(`“${spare}” was deleted from the library.`)).toBeVisible();
    await expect(dialog(page).getByRole("radio", { name: new RegExp(spare.replace(/[.]/g, "\\.")) })).toHaveCount(0);
    expect(await libraryItem(page, spare)).toBeUndefined();
  });
});
