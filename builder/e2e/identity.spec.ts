// The mark at the size it is seen at (rule 48): the editor's favicon, as
// the browser serves it, drawn by Chromium at 16 and 32 pixels on a light
// and a dark tab, and its pixels read back. What must survive:
// - it fills its tile: what differs from the tab spans at least 10 of 16
//   pixels each way;
// - its idea, two corner brackets apart: on a light tab, two separate
//   shapes of graphite, each at least 8 pixels at 16 (they do not run into
//   one blot); on a dark tab, the white keyline draws the same two shapes;
// - the accent: the middle of the tile is Tool yellow.
// The page links that icon and the manifest that names the product, and
// the About window says who made it, with the version.
import { expect, test } from "@playwright/test";

interface Reading {
  span: { width: number; height: number };
  // Connected shapes (4-neighbour) of the pixels that read as the brackets
  // (graphite on light, the white keyline on dark), by size.
  shapes: number[];
  centre: [number, number, number];
}

for (const tab of [{ name: "light", colour: "#FFFFFF" }, { name: "dark", colour: "#202124" }]) {
  for (const size of [16, 32]) {
    test(`the mark reads at ${size} px on a ${tab.name} tab`, async ({ page }) => {
      await page.goto("/");
      const href = await page.locator('link[rel="icon"]').getAttribute("href");
      expect(href).toBe("/favicon.svg");
      const reading = await page.evaluate(async ({ href, size, colour, dark }): Promise<Reading> => {
        const image = new Image(size, size);
        image.src = href;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d")!;
        context.fillStyle = colour;
        context.fillRect(0, 0, size, size);
        context.drawImage(image, 0, 0, size, size);
        const { data } = context.getImageData(0, 0, size, size);
        const at = (x: number, y: number) => [data[(y * size + x) * 4]!, data[(y * size + x) * 4 + 1]!, data[(y * size + x) * 4 + 2]!] as [number, number, number];
        const background = [Number.parseInt(colour.slice(1, 3), 16), Number.parseInt(colour.slice(3, 5), 16), Number.parseInt(colour.slice(5, 7), 16)];
        const luminance = ([r, g, b]: [number, number, number]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        let [minX, minY, maxX, maxY] = [size, size, -1, -1];
        const marked: boolean[] = [];
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const pixel = at(x, y);
            if (pixel.some((c, i) => Math.abs(c - background[i]!) > 48)) {
              minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
            // The brackets: graphite on a light tab, the white keyline on a
            // dark one (white, not the yellow middle, which is light too).
            marked.push(dark ? Math.min(...pixel) > 180 : luminance(pixel) < 0.25);
          }
        }
        const seen = new Set<number>();
        const shapes: number[] = [];
        for (let start = 0; start < marked.length; start += 1) {
          if (!marked[start] || seen.has(start)) continue;
          let count = 0;
          const stack = [start];
          seen.add(start);
          while (stack.length > 0) {
            const here = stack.pop()!;
            count += 1;
            const x = here % size;
            const y = Math.floor(here / size);
            for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
              const next = ny * size + nx;
              if (nx >= 0 && ny >= 0 && nx < size && ny < size && marked[next] && !seen.has(next)) {
                seen.add(next);
                stack.push(next);
              }
            }
          }
          shapes.push(count);
        }
        const middle = Math.floor(size / 2) - 1;
        return { span: { width: maxX - minX + 1, height: maxY - minY + 1 }, shapes: shapes.sort((a, b) => b - a), centre: at(middle, middle) };
      }, { href: href!, size, colour: tab.colour, dark: tab.name === "dark" });

      const scale = size / 16;
      expect(reading.span.width).toBeGreaterThanOrEqual(10 * scale);
      expect(reading.span.height).toBeGreaterThanOrEqual(10 * scale);
      // Two brackets, apart; specks of a pixel or two from the edges'
      // smoothing do not count as a third.
      const brackets = reading.shapes.filter((n) => n >= 8 * scale);
      expect(brackets, `shapes: ${reading.shapes.join(", ")}`).toHaveLength(2);
      // Tool yellow (#EDC200) in the middle.
      const [r, g, b] = reading.centre;
      expect(r, `centre ${reading.centre.join(",")}`).toBeGreaterThan(200);
      expect(g).toBeGreaterThan(160);
      expect(b).toBeLessThan(90);
    });
  }
}

test("the page links the manifest that names the product, served as a manifest, and no default icon is served", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Page Builder CMS");
  expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe("/manifest.webmanifest");
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()["content-type"]).toContain("application/manifest+json");
  expect(((await manifest.json()) as { name: string }).name).toBe("Page Builder CMS");
  const icon = await request.get("/favicon.svg");
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  for (const path of ["/vite.svg", "/favicon.ico", "/src/assets/react.svg"]) expect((await request.get(path)).status(), path).toBe(404);
});
