// node tools/type-scales.ts <site address>
//
// Shows, in a real browser, that the three type-scale choices of the site
// style draw three different sets of sizes. For each choice it sets the
// site style through the API (PUT /api/site-style), opens the home page
// headless at the three widths of the design (1280, 768, 390), and reads
// the computed font size of the first heading of each step the page uses:
// Display (the hero), Heading 2 (the band titles) and Heading 3 (the icon
// boxes). Then it puts back the style it found.
//
// Fails (exit 1) when a choice does not reach the page as data-type-scale,
// when two choices give a step the same size at a width, or when Gentle,
// Balanced and Strong are not in that order. It starts no server and opens
// no window; it changes the site style of the server it is pointed at only
// while it runs. Exits 2 on bad arguments.
import { chromium } from "playwright";

const [base] = process.argv.slice(2);
if (!base) {
  console.error("usage: node tools/type-scales.ts <site address, e.g. http://127.0.0.1:3900>");
  process.exit(2);
}
const origin = new URL(base).origin;
const CHOICES = ["gentle", "balanced", "strong"];
const WIDTHS = [1280, 768, 390];
const STEPS: Array<[string, string]> = [
  ["display", "main .w-heading.size-display > *"],
  ["heading-2", "main .w-heading.size-heading-2 > *"],
  ["heading-3", "main .sw-iconbox h3"],
];

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const response = await fetch(origin + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  return response.json();
}

const problems: string[] = [];
const found = await api("GET", "/api/site-style");
const sizes: Record<string, Record<number, Record<string, number>>> = {};
const browser = await chromium.launch();
try {
  for (const choice of CHOICES) {
    await api("PUT", "/api/site-style", { palette: found.palette, typeScale: choice });
    sizes[choice] = {};
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      await page.route("**/*", (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
      await page.goto(origin + "/", { waitUntil: "load" });
      const scale = await page.getAttribute(".site", "data-type-scale");
      if (scale !== choice) problems.push(`${choice} at ${width}: the page says data-type-scale=${scale}`);
      const row: Record<string, number> = {};
      for (const [step, selector] of STEPS) {
        row[step] = await page.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      }
      sizes[choice][width] = row;
      await page.close();
    }
  }
} finally {
  await browser.close();
  await api("PUT", "/api/site-style", { palette: found.palette, typeScale: found.typeScale });
}

console.log(`computed font sizes in px on ${origin}/ (Gentle / Balanced / Strong):`);
for (const width of WIDTHS) {
  const cells = STEPS.map(([step]) => `${step} ${CHOICES.map((c) => sizes[c]?.[width]?.[step]?.toFixed(1)).join(" / ")}`);
  console.log(`  ${String(width).padStart(4)} wide: ${cells.join(";  ")}`);
  for (const [step] of STEPS) {
    const [gentle, balanced, strong] = CHOICES.map((c) => sizes[c]?.[width]?.[step] ?? NaN);
    if (!(gentle < balanced && balanced < strong)) problems.push(`${step} at ${width}: ${gentle} / ${balanced} / ${strong} are not three sizes, smallest to largest`);
  }
}
console.log(`site style put back: typeScale ${found.typeScale}`);
if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  process.exit(1);
}
console.log("RESULT: three choices, three different sizes for every step at every width");
