// @vitest-environment jsdom
//
// Rule 9, the check whose examples I did not write: fast-check makes valid
// page documents (render-arbitraries.ts), each is saved through the CMS's
// real API as a page's draft, and the page the CMS then serves (its draft
// preview, and at the end the published page) is compared with the React
// render of the same document, under the normalization the render contract
// uses (html-compare.ts) and nothing else. What React draws passes the
// safety check too. render-agreement-plants.rails.test.tsx shows it failing.
//
// Seeded and replayable: RULE9_SEED picks the documents and RULE9_RUNS how
// many (60 by default, which fits the CI job with the rest of the "rails"
// project). A failure prints the seed and the path fast-check replays it
// by, and the smallest document it found that still disagrees.
//
// jsdom gives @rails/activestorage, which uploads the library images, its
// browser APIs, with the document on the CMS's origin (vite.config.ts).
import fc from "fast-check";
import { beforeAll, expect, inject, test } from "vitest";
import { siteStyleAttributes } from "../src/render/page.tsx";
import type { WidgetType } from "../src/shared/document.ts";
import { PNG_BYTES } from "../src/storage/contract.ts";
import { WIDGETS } from "../src/widgets/registry.ts";
import { newWidget, type WidgetDefinition } from "../src/widgets/types.ts";
import { fromEnv, oneColumn, startAgreement, type Agreement } from "./agreement-harness.ts";
import { findElement } from "./html-compare.ts";
import { checked, page } from "./render-arbitraries.ts";
import { parse } from "parse5";

const cms = inject("cmsUrl");
const RUNS = fromEnv("RULE9_RUNS", 60);
const SEED = fromEnv("RULE9_SEED", 20261002);
let cmsPage: Agreement;

beforeAll(async () => {
  cmsPage = await startAgreement(cms, "rule-nine");
}, 120_000);

test("the CMS serves each library image at its size, the bytes the API's address gives", async () => {
  const bytes = async (path: string) => new Uint8Array(await (await fetch(new URL(path, cms))).arrayBuffer());
  for (const item of cmsPage.library) {
    const image = cmsPage.resolver(item.id)!;
    expect([image.width, image.height]).toEqual([item.width, item.height]);
    expect([...(await bytes(image.src))]).toEqual([...PNG_BYTES]);
    expect([...(await bytes(item.url))]).toEqual([...PNG_BYTES]);
  }
});

test("the page root carries the site style as the CMS writes it", async () => {
  const served = parse(await cmsPage.fetchText(cmsPage.previewPath));
  const site = findElement(served, (e) => e.attrs.some((a) => a.name === "class" && a.value === "site"));
  const attributes = Object.fromEntries(site!.attrs.filter((a) => a.name !== "class").map((a) => [a.name, a.value]));
  expect(attributes).toEqual(siteStyleAttributes(await cmsPage.adapter.getSiteStyle()));
});

test("every widget as the widget panel makes it draws on the CMS as in React", async () => {
  const [shore, pier] = cmsPage.library;
  const inputs: Partial<Record<WidgetType, unknown>> = {
    image: { mediaId: shore!.id, alt: "The shore" },
    gallery: [{ mediaId: shore!.id, alt: "The shore" }, { url: "https://images.example.org/two.jpg", decorative: true }, { mediaId: pier!.id, decorative: true }],
    video: { provider: "youtube", videoId: "M7lc1UVf-VE" },
  };
  const widgets = WIDGETS.map((widget, index) => newWidget(widget as WidgetDefinition<WidgetType>, `w${index}`, inputs[widget.type] as never));
  const document = checked(oneColumn(widgets));
  await cmsPage.save(document);
  const { nodes } = await cmsPage.agree(document);
  expect(nodes).toBeGreaterThan(60);
});

test(`rule 9: ${RUNS} random valid pages draw on the CMS as in React (seed ${SEED})`, async () => {
  let compared = 0;
  let nodes = 0;
  const started = performance.now();
  await fc.assert(
    fc.asyncProperty(page(cmsPage.library.map((item) => item.id)), async (document) => {
      await cmsPage.save(document);
      nodes += (await cmsPage.agree(document)).nodes;
      compared += 1;
    }),
    { seed: SEED, numRuns: RUNS, interruptAfterTimeLimit: 15 * 60_000, markInterruptAsFailure: true },
  );
  console.log(`rule 9: ${compared} documents saved and compared (${RUNS} runs, seed ${SEED}), ${nodes} nodes, ${((performance.now() - started) / 1000).toFixed(1)} s`);
  expect(compared).toBeGreaterThanOrEqual(RUNS);
}, 20 * 60_000);

test("the published page draws as React does", async () => {
  const document = checked(oneColumn(WIDGETS.filter((w) => w.needs === null).map((widget, index) => newWidget(widget as WidgetDefinition<WidgetType>, `p${index}`, undefined as never))));
  await cmsPage.save(document);
  const published = await cmsPage.adapter.publish(cmsPage.pageId, { revision: cmsPage.revision() });
  if (!published.ok) throw new Error(`publishing was refused: ${JSON.stringify(published.problem)}`);
  expect(published.value.links.live).toBe(`/${cmsPage.slug}`);
  await cmsPage.agree(document, published.value.links.live!, "published");
});
