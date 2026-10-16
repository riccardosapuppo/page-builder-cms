// Where the demo is served from (./demo.ts): GitHub Pages' path by default,
// the root of a host of its own with DEMO_BASE=/, any path that starts and
// ends with a slash; anything else stops the build, saying why.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { WIDGET_TYPES } from "../src/shared/document.ts";
import { DEMO_DESCRIPTION, DEMO_PAGES_BASE, DEMO_PREVIEW, DEMO_SITE, demoBase, demoLinkPreview, linkPreviewTags, previewVersion } from "./demo.ts";

test("the demo's base: Pages' path by default, the root or another path when DEMO_BASE says so, and nothing else", () => {
  expect(DEMO_PAGES_BASE).toBe("/page-builder-cms/");
  expect(demoBase({})).toBe(DEMO_PAGES_BASE);
  expect(demoBase({ DEMO_BASE: "" })).toBe(DEMO_PAGES_BASE);
  expect(demoBase({ DEMO_BASE: " / " })).toBe("/");
  expect(demoBase({ DEMO_BASE: "/demo/" })).toBe("/demo/");
  expect(demoBase({ DEMO_BASE: "/club/editor/" })).toBe("/club/editor/");
  for (const wrong of ["page-builder-cms", "/page-builder-cms", "page-builder-cms/", "//", "/Demo/", "/a b/", "https://builder.example.org/"]) {
    expect(() => demoBase({ DEMO_BASE: wrong }), wrong).toThrow(/^DEMO_BASE must be a path that starts and ends with "\/"/);
  }
});

// What a shared link to the demo previews with (Open Graph).
test("a link to the demo previews with the demo's own tags: every address absolute on its own host, the picture's size and words", () => {
  const tags = linkPreviewTags();
  const said = (key: string) => tags.find((tag) => tag.property === key || tag.name === key)?.content;
  expect(DEMO_SITE).toBe("https://builder.riccardosapuppo.com/");
  expect(said("og:url")).toBe(DEMO_SITE);
  // The picture's address carries its fingerprint: a new picture is a new address.
  const version = createHash("sha256").update(readFileSync(DEMO_PREVIEW.source)).digest("hex").slice(0, 12);
  expect(previewVersion()).toBe(version);
  expect(said("og:image")).toBe(`https://builder.riccardosapuppo.com/preview.png?v=${version}`);
  expect([said("og:image:width"), said("og:image:height"), said("og:image:type")]).toEqual(["1200", "627", "image/png"]);
  expect(said("og:title")).toBe("Page Builder CMS");
  expect(said("og:type")).toBe("website");
  expect(said("twitter:card")).toBe("summary_large_image");
  expect(said("description")).toBe(DEMO_DESCRIPTION);
  expect(said("og:description")).toBe(DEMO_DESCRIPTION);
  expect(said("og:image:alt")).toMatch(/Slack Water, an invented swimming club/);
  // Every address a tag gives is absolute.
  for (const tag of tags.filter((t) => /url|image$/.test(t.property ?? ""))) expect(new URL(tag.content!).protocol, tag.property).toBe("https:");
  // Another host's copy names its own.
  expect(linkPreviewTags("https://demo.example.org/editor/", "0123456789ab").find((tag) => tag.property === "og:image")?.content).toBe("https://demo.example.org/editor/preview.png?v=0123456789ab");
  // Before there is a picture, its address alone.
  expect(linkPreviewTags(DEMO_SITE, null).find((tag) => tag.property === "og:image")?.content).toBe("https://builder.riccardosapuppo.com/preview.png");
  expect(previewVersion("no-such-picture.png")).toBeNull();
});

test("the demo's build puts the tags in its page's head and the picture at its root, unhashed", () => {
  const plugin = demoLinkPreview();
  const transform = plugin.transformIndexHtml as unknown as () => Array<{ tag: string; attrs: Record<string, string>; injectTo: string }>;
  const tags = transform();
  expect(tags.every((tag) => tag.tag === "meta" && tag.injectTo === "head")).toBe(true);
  expect(tags.map((tag) => tag.attrs)).toEqual(linkPreviewTags());
  const emitted: Array<{ type: string; fileName: string; source: Uint8Array }> = [];
  (plugin.generateBundle as unknown as (this: unknown) => void).call({ emitFile: (file: (typeof emitted)[number]) => emitted.push(file) });
  expect(emitted.map((file) => [file.type, file.fileName])).toEqual([["asset", "preview.png"]]);
  expect(Buffer.from(emitted[0]!.source).equals(readFileSync(DEMO_PREVIEW.source))).toBe(true);
});

// The description a shared link shows counts the kinds of block in words:
// held to the editor's own list, a new kind cannot leave it behind.
test("the description names as many kinds of block as the editor has", () => {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty"];
  const words = (n: number) => (n < 20 ? ones[n]! : `${tens[Math.floor(n / 10)]!}${n % 10 === 0 ? "" : `-${ones[n % 10]!}`}`);
  expect(/\b([a-z-]+) kinds of block\b/.exec(DEMO_DESCRIPTION)?.[1]).toBe(words(WIDGET_TYPES.length));
});

test("the picture is a PNG of the size the tags give, light enough for the sites that draw previews", () => {
  const png = readFileSync(DEMO_PREVIEW.source);
  expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([DEMO_PREVIEW.width, DEMO_PREVIEW.height]);
  expect(png.length).toBeLessThan(1_000_000);
});
