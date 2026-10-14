// The editor's twins of the server's render rules, run beside the server's
// own on the same generated values: the URL policy, a block's classes and
// a sticky header's rows (policy.ts and
// cms/app/models/render_policy.rb) and rich text (rich-text.tsx and
// cms/app/helpers/rich_text_helper.rb). Unlike the random-page agreement
// check, which saves pages and so only meets what the schema accepts, this
// hands both sides values
// the schema refuses: hostile addresses, numbers out of range or written as
// strings, rich text with unknown nodes and marks. Ruby runs
// ../../test/ruby/twins.rb with the CMS's gems; nothing else of the CMS.
//
// In the "rails" project for its Ruby; it does not use the CMS the project
// starts.
// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, test } from "vitest";
import { builderRoot, repoRoot } from "../../build/paths.ts";
import { canonical, parseSections } from "../../test/html-compare.ts";
import { href } from "../../test/render-arbitraries.ts";
import { anchor, decimal, imageSrc, isVideoProvider, linkHref, mapSrc, siteClasses, stickyRows, videoSrc } from "./policy.ts";
import { renderRichText } from "./rich-text.tsx";

const SEED = 20261002;
const sample = <T>(arbitrary: fc.Arbitrary<T>, count: number, offset: number): T[] => fc.sample(arbitrary, { seed: SEED + offset, numRuns: count });

// Strings made of the pieces addresses are made of, good and bad.
const PIECES = [
  "https://", "http://", "HTTPS://", "mailto:", "tel:", "tel:+", "javascript:", "JaVaScRiPt:", "data:", "//", "/", "/\\", "\\", "?", "#", ":",
  "example.com", "a.b-c", ":8080", ":123456", "@", "%20", "%2", "%zz", "&", "'", "\"", "<", ">", " ", "\t", "\n", "\u0000", "~", "!", "$", "(", ")",
  "*", "+", ",", ";", "=", "-", ".", "_", "0", "9", "a", "Z", String.fromCodePoint(0xe9), String.fromCodePoint(0x65e5), String.fromCodePoint(0x2028), "x".repeat(700),
];
const messy = fc.array(fc.constantFrom(...PIECES), { maxLength: 8 }).map((parts) => parts.join(""));
const anyJson = fc.oneof(messy, fc.integer(), fc.double({ noNaN: true, noDefaultInfinity: true }), fc.boolean(), fc.constant(null), fc.constant([]), fc.constant({}));

// Map values: in range, out of range, on and near the half-way points, and
// of the wrong kind.
const coordinate = (limit: number) => fc.oneof(
  fc.integer({ min: -limit - 5, max: limit + 5 }),
  fc.double({ min: -limit * 1.1, max: limit * 1.1, noNaN: true, noDefaultInfinity: true }).map((x) => (Object.is(x, -0) ? 0 : x)),
  fc.integer({ min: -limit * 64, max: limit * 64 }).map((n) => (2 * n + 1) / 128),
  fc.tuple(fc.integer({ min: -limit * 64, max: limit * 64 }), fc.integer({ min: -2000, max: 2000 })).map(([n, ulps]) => (2 * n + 1) / 128 + ulps * Number.EPSILON * Math.abs((2 * n + 1) / 128)),
  fc.constantFrom("54.5", null, true),
);
// A block's classes: names a site may give, the theme's in any case,
// names that are no class names, and every blank between them.
const className = fc.oneof(
  fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,41}$/),
  fc.constantFrom("sw-btn", "Hide-desktop", "SEC", "fill", "BG-primary", "line", "lines", "cols-2", "\u212Aelvin", "\u0130con", "caf\u00e9", "2col", ""),
);
const blank = fc.constantFrom(" ", " ", " ", "  ", "\t", "\n", "\u00a0", "\u3000");
const classList = fc.array(fc.tuple(className, blank), { maxLength: 9 }).map((parts) => parts.map(([name, gap]) => name + gap).join(""));

const zoom = fc.oneof(fc.integer({ min: -1, max: 21 }), fc.constantFrom(5.5, "15", null));

// A header's document, as far as its rows go: sticky or not (or written
// wrong), its sections with their columns and where they stack, and the
// shapes no schema would let through.
const stackValue = fc.oneof(fc.constantFrom("phone", "never", "tablet", "Phone"), anyJson);
const sizeStep = fc.oneof({ weight: 5, arbitrary: fc.constantFrom("display", "heading-1", "heading-2", "heading-3", "large", "body", "small") }, { weight: 1, arbitrary: fc.constantFrom("Display", "huge", "valueOf", "", 2) }, { weight: 1, arbitrary: anyJson });
const sizeSides = fc.oneof({ weight: 5, arbitrary: fc.record({ textSize: sizeStep }, { requiredKeys: [] }) }, { weight: 1, arbitrary: anyJson });
const sizeStyle = fc.oneof({ weight: 5, arbitrary: fc.record({ base: sizeSides, tablet: sizeSides, phone: sizeSides }, { requiredKeys: [] }) }, { weight: 1, arbitrary: anyJson });
const headerBlock = fc.oneof(
  { weight: 5, arbitrary: fc.record({ type: fc.constantFrom("logo", "menu", "button", "heading", "text", "image", "gallery", "video", "map", "iconbox", "quote", "accordion", "Image", "") }) },
  { weight: 3, arbitrary: fc.record({ type: fc.constantFrom("heading", "text"), props: fc.oneof(fc.record({ level: fc.oneof(fc.integer({ min: 0, max: 5 }), fc.constantFrom(2.5, "1", null)) }, { requiredKeys: [] }), anyJson), style: sizeStyle }, { requiredKeys: ["type"] }) },
  { weight: 1, arbitrary: anyJson },
);
const columnStep = fc.oneof({ weight: 5, arbitrary: fc.constantFrom("none", "xs", "s", "m", "l", "xl", "xxl") }, { weight: 1, arbitrary: fc.constantFrom("section-l", "XXL", "huge", "toString", "", 48) }, { weight: 1, arbitrary: anyJson });
const columnSides = fc.oneof({ weight: 5, arbitrary: fc.record({ spaceInside: columnStep, spaceBetween: columnStep, textSize: sizeStep }, { requiredKeys: [] }) }, { weight: 1, arbitrary: anyJson });
const columnStyle = fc.oneof({ weight: 5, arbitrary: fc.record({ base: columnSides, tablet: columnSides, phone: columnSides }, { requiredKeys: [] }) }, { weight: 1, arbitrary: anyJson });
const headerColumn = fc.oneof({ weight: 5, arbitrary: fc.record({ children: fc.oneof({ weight: 5, arbitrary: fc.array(headerBlock, { maxLength: 4 }) }, { weight: 1, arbitrary: anyJson }), style: columnStyle }, { requiredKeys: [] }) }, { weight: 1, arbitrary: anyJson });
const spaceStep = fc.oneof({ weight: 5, arbitrary: fc.constantFrom("none", "xs", "s", "m", "l", "xl", "xxl", "section-s", "section-l") }, { weight: 1, arbitrary: fc.constantFrom("Section-l", "huge", "constructor", "__proto__", "", 96) }, { weight: 1, arbitrary: anyJson });
const spaceSides = fc.oneof({ weight: 5, arbitrary: fc.record({ spaceAbove: spaceStep, spaceBelow: spaceStep }, { requiredKeys: [] }) }, { weight: 1, arbitrary: anyJson });
const sectionStyle = fc.oneof({ weight: 5, arbitrary: fc.record({ base: spaceSides, tablet: spaceSides, phone: spaceSides }, { requiredKeys: [] }) }, { weight: 1, arbitrary: anyJson });
const headerSection = fc.oneof(
  { weight: 6, arbitrary: fc.record({ props: fc.oneof(fc.record({ stack: stackValue }, { requiredKeys: [] }), anyJson), children: fc.oneof({ weight: 5, arbitrary: fc.array(headerColumn, { maxLength: 5 }) }, { weight: 1, arbitrary: anyJson }), style: sectionStyle }, { requiredKeys: [] }) },
  { weight: 1, arbitrary: anyJson },
);
const headerDocument = fc.oneof(
  { weight: 6, arbitrary: fc.record({ sticky: fc.oneof({ weight: 4, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: anyJson }), sections: fc.oneof({ weight: 5, arbitrary: fc.array(headerSection, { maxLength: 9 }) }, { weight: 1, arbitrary: anyJson }) }, { requiredKeys: [] }) },
  { weight: 1, arbitrary: anyJson },
);

// Rich text with what the schema allows and what it does not.
const markJson = fc.oneof(
  fc.constantFrom({ type: "bold" }, { type: "italic" }, { type: "underline" }, { type: "code" }, "bold", null, { type: "link" }),
  fc.record({ type: fc.constant("link"), attrs: fc.record({ href: messy, target: fc.constantFrom("_blank", null) }) }),
);
const { node } = fc.letrec<{ node: unknown }>((tie) => ({
  node: fc.oneof(
    { maxDepth: 4, depthIdentifier: "rich" },
    fc.record({ type: fc.constant("text"), text: fc.oneof(messy, fc.constant(42)), marks: fc.oneof(fc.array(markJson, { maxLength: 3 }), fc.constant({ type: "bold" })) }),
    fc.record({ type: fc.constantFrom("hardBreak"), marks: fc.array(markJson, { maxLength: 2 }) }),
    fc.record({ type: fc.constantFrom("paragraph", "bulletList", "listItem", "heading", "blockquote", "image"), content: fc.oneof(fc.array(tie("node"), { maxLength: 3 }), fc.constant("text")) }),
    fc.record({ type: fc.constant("orderedList"), attrs: fc.record({ start: fc.oneof(fc.integer({ min: -2, max: 5 }), fc.constant(2.5), fc.constant("3")), type: fc.constantFrom("1", "a", "A", "i", "I", "x", null) }), content: fc.array(tie("node"), { maxLength: 3 }) }),
    fc.constantFrom("paragraph", null, 7),
  ),
}));
const richDoc = fc.oneof(
  { weight: 9, arbitrary: fc.array(node, { maxLength: 4 }).map((content) => ({ type: "doc", content })) },
  { weight: 1, arbitrary: fc.constantFrom({ type: "paragraph" }, { type: "doc", content: "x" }, null, "doc") },
);

const work = mkdtempSync(join(tmpdir(), "render-twins-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

test("the URL policy and rich text answer as the server's do, on values the schema refuses too", { timeout: 120_000 }, () => {
  const input = {
    links: sample(fc.oneof(messy, anyJson, href), 6000, 1),
    images: sample(fc.oneof(messy, anyJson, href), 3000, 2),
    videos: sample(fc.tuple(fc.oneof(fc.constantFrom("youtube", "vimeo", "dailymotion", "__proto__", "constructor", "YouTube"), anyJson), fc.oneof(fc.stringMatching(/^[A-Za-z0-9_-]{11}$/), fc.stringMatching(/^[0-9]{1,13}$/), messy, anyJson)), 3000, 3),
    anchors: sample(fc.oneof(fc.stringMatching(/^[a-z][a-z0-9-]{0,66}$/), messy, anyJson), 2000, 4),
    classes: sample(fc.oneof({ weight: 4, arbitrary: classList }, { weight: 1, arbitrary: messy }, { weight: 1, arbitrary: anyJson }), 3000, 8),
    maps: sample(fc.tuple(coordinate(90), coordinate(180), zoom), 20000, 5),
    decimals: sample(fc.oneof(coordinate(180).filter((x): x is number => typeof x === "number"), fc.double({ min: -1e-5, max: 1e-5, noNaN: true }).map((x) => (Object.is(x, -0) ? 0 : x))), 20000, 6),
    richTexts: sample(richDoc, 1500, 7),
    stickyRows: sample(headerDocument, 3000, 9),
  };
  writeFileSync(join(work, "in.json"), JSON.stringify(input));
  const ruby = spawnSync("ruby", [join(builderRoot, "test", "ruby", "twins.rb"), join(work, "in.json"), join(work, "out.json")], {
    cwd: join(repoRoot, "cms"),
    env: { ...process.env, BUNDLE_GEMFILE: join(repoRoot, "cms", "Gemfile") },
    encoding: "utf8",
  });
  expect(ruby.status, ruby.stderr).toBe(0);
  const server = JSON.parse(readFileSync(join(work, "out.json"), "utf8")) as Record<string, unknown[]>;

  // The values as the server read them back from JSON, so both sides see the
  // same input.
  const read = JSON.parse(JSON.stringify(input)) as typeof input;
  const ours = {
    links: read.links.map((v) => linkHref(v)),
    images: read.images.map((v) => imageSrc(v)),
    videos: read.videos.map(([provider, id]) => videoSrc(provider, id)),
    providers: read.videos.map(([provider]) => isVideoProvider(provider)),
    anchors: read.anchors.map((v) => anchor(v)),
    classes: read.classes.map((v) => JSON.stringify(siteClasses(v))),
    maps: read.maps.map(([latitude, longitude, z]) => mapSrc(latitude, longitude, z)),
    decimals: read.decimals.map((v) => decimal(v)),
    stickyRows: read.stickyRows.map((v) => stickyRows(v)),
  };
  for (const [part, values] of Object.entries(ours)) {
    const theirs = server[part]!;
    const differ = values.map((value, index) => [index, value, theirs[index]] as const).filter(([, a, b]) => a !== b);
    expect(differ.slice(0, 5).map(([index, a, b]) => ({ input: (read as Record<string, unknown[]>)[part === "providers" ? "videos" : part]![index], editor: a, server: b })), part).toEqual([]);
    expect(theirs.length, part).toBe(values.length);
  }
  // Some of each kind of answer, so the comparison meets both.
  expect(ours.links.filter((v) => v !== null).length).toBeGreaterThan(100);
  expect(ours.links.filter((v) => v === null).length).toBeGreaterThan(100);
  expect(ours.maps.filter((v) => v !== null).length).toBeGreaterThan(1000);
  expect(ours.classes.filter((v) => v !== "[]").length).toBeGreaterThan(500);
  expect(new Set(ours.stickyRows.filter((v) => v !== null)).size).toBeGreaterThan(20);
  expect(ours.decimals.filter((v, i) => v !== read.decimals[i]!.toFixed(6)).length).toBeGreaterThan(100);

  const richDiffer: string[] = [];
  read.richTexts.forEach((doc, index) => {
    const html = renderToStaticMarkup(createElement(Fragment, null, renderRichText(doc)));
    const a = canonical(parseSections(html)).map((l) => l.line).join("\n");
    const b = canonical(parseSections(server.richTexts![index] as string)).map((l) => l.line).join("\n");
    if (a !== b && richDiffer.length < 3) richDiffer.push(`${JSON.stringify(doc)}\n--- editor\n${a}\n--- server\n${b}`);
  });
  expect(richDiffer).toEqual([]);
  console.log(`twins: ${Object.values(ours).reduce((n, v) => n + v.length, 0)} policy answers and ${read.richTexts.length} rich texts, the same on both sides`);
});
