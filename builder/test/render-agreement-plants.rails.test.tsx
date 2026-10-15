// @vitest-environment jsdom
//
// The random-page agreement check can fail. Each fault below is planted in
// the React renderer, one at a time, and the same check
// (render-agreement.rails.test.tsx)
// run on it must find a document that disagrees, within the 60 documents
// of the default seed the check itself runs by default: a map address
// written with toFixed, data-style with its keys unsorted, a plain text's
// last line breaks dropped, an empty paragraph not drawn. Shrinking is
// skipped (endOnFailure): finding is what is shown here. (Each new widget
// changes the documents a seed draws: with the steps block, the map that
// toFixed misdraws came at the 43rd.)
import fc from "fast-check";
import { beforeAll, expect, inject, test, vi } from "vitest";
import { startAgreement, type Agreement } from "./agreement-harness.ts";
import { wholeNumberFromEnv } from "./env.ts";
import { page } from "./render-arbitraries.ts";

const plant = vi.hoisted(() => ({ current: "none" as "none" | "toFixed" | "unsorted" | "breaks" | "paragraphs" }));

vi.mock("../src/render/policy.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/render/policy.ts")>();
  // mapSrc as the policy writes it, but with toFixed's rounding.
  const toFixedMap = (latitude: number, longitude: number, zoom: number): string => {
    const halfWidth = ((360 / 2 ** zoom) * 400) / 256;
    const halfHeight = ((halfWidth * 450) / 800) * Math.cos((Math.min(Math.abs(latitude), 85) * Math.PI) / 180);
    const box = [Math.max(longitude - halfWidth, -180), Math.max(latitude - halfHeight, -85), Math.min(longitude + halfWidth, 180), Math.min(latitude + halfHeight, 85)];
    const six = (n: number) => (n.toFixed(6) === "-0.000000" ? "0.000000" : n.toFixed(6));
    return `https://www.openstreetmap.org/export/embed.html?bbox=${box.map(six).join("%2C")}&layer=mapnik&marker=${six(latitude)}%2C${six(longitude)}`;
  };
  return {
    ...original,
    mapSrc: (latitude: unknown, longitude: unknown, zoom: unknown) => {
      const src = original.mapSrc(latitude, longitude, zoom);
      return plant.current === "toFixed" && src !== null ? toFixedMap(latitude as number, longitude as number, zoom as number) : src;
    },
  };
});

vi.mock("../src/render/style.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/render/style.ts")>();
  return {
    ...original,
    // The stored order instead of the sorted one.
    dataStyle: (style: unknown) => {
      if (plant.current !== "unsorted") return original.dataStyle(style);
      const pairs: string[] = [];
      for (const device of ["base", "tablet", "phone"]) {
        const part = (style as Record<string, Record<string, unknown> | undefined>)[device];
        for (const key of Object.keys(part ?? {})) {
          const value = original.styleValue(style, device, key);
          if (value !== null) pairs.push(`${device}.${key}=${value}`);
        }
      }
      return pairs.length === 0 ? null : pairs.join(";");
    },
  };
});

vi.mock("../src/render/drawings.tsx", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/render/drawings.tsx")>();
  return {
    ...original,
    TextWithBreaks: ({ text }: { text: string }) => original.TextWithBreaks({ text: plant.current === "breaks" ? text.replace(/\n+$/, "") : text }),
  };
});

vi.mock("../src/render/rich-text.tsx", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/render/rich-text.tsx")>();
  const dropEmpty = (node: unknown): unknown => {
    if (typeof node !== "object" || node === null) return node;
    const { content, ...rest } = node as { content?: unknown[] };
    if (!Array.isArray(content)) return node;
    return { ...rest, content: content.filter((child) => !(typeof child === "object" && child !== null && (child as { type?: unknown }).type === "paragraph" && !Array.isArray((child as { content?: unknown }).content))).map(dropEmpty) };
  };
  return { ...original, renderRichText: (doc: unknown) => original.renderRichText(plant.current === "paragraphs" ? dropEmpty(doc) : doc) };
});

const cms = inject("cmsUrl");
const SEED = wholeNumberFromEnv("AGREEMENT_SEED", 20261002);
let cmsPage: Agreement;

beforeAll(async () => {
  cmsPage = await startAgreement(cms, "rule-nine-plants");
}, 120_000);

test.each(["toFixed", "unsorted", "breaks", "paragraphs"] as const)("with the fault %s planted, the agreement check finds a page that disagrees", async (fault) => {
  plant.current = fault;
  try {
    let tried = 0;
    const run = fc.assert(
      fc.asyncProperty(page(cmsPage.library.map((item) => item.id)), async (document) => {
        tried += 1;
        await cmsPage.save(document);
        await cmsPage.agree(document);
      }),
      { seed: SEED, numRuns: 60, endOnFailure: true },
    );
    // fast-check names the failing run in its message and keeps the
    // property's own error as the cause.
    const failure = await run.then(() => null, (error: unknown) => error as Error);
    expect(failure, "the plant went unnoticed").not.toBeNull();
    const cause = failure!.cause instanceof Error ? failure!.cause.message : String(failure!.cause);
    expect(cause).toMatch(/^preview: the trees differ at node \d+, in block /);
    console.log(`agreement check, plant ${fault}: found after ${tried} document(s): ${cause.split("\n")[0]}`);
  } finally {
    plant.current = "none";
  }
}, 10 * 60_000);
