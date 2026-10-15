// The URL policy, the twin of cms/app/models/render_policy.rb, on the cases
// its rules are about. twins.rails.test.ts runs Ruby's own on generated
// values beside it; the render contract holds both to the goldens.
// @vitest-environment node
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { anchor, decimal, FRAME_ORIGINS, HEADER_SPACE, imageSrc, isVideoProvider, linkHref, mapSrc, MAX_URL_LENGTH, STICKY_ROW, STICKY_SPARE, stickyRows, videoSrc } from "./policy.ts";

describe("links", () => {
  test.each([
    "https://example.com", "http://example.com:8080/a?b=1#c", "https://example.com/?a=1&b='2'", "mailto:club@example.org?subject=Trial%20swim",
    "tel:+44-20-7946-0958", "/", "/winter?a=1&c='3'#join", "?season=winter", "#join", "#",
  ])("keeps %s", (href) => {
    expect(linkHref(href)).toBe(href);
  });

  test.each([
    "javascript:alert(1)", " JaVaScRiPt:alert(2)", "java\tscript:alert(3)", "javascript&colon;alert(4)", "data:text/html,<script>alert(5)</script>",
    "//evil.example/", "/\\evil.example", "HTTPS://example.com", "https://exa mple.com", "https://example.com/\"", "/a\nb", "ftp://example.com",
    "https://", "mailto:", "", "/winter?b=\"2\"", "https://example.com/é",
  ])("drops %j", (href) => {
    expect(linkHref(href)).toBeNull();
  });

  test("drops what is not a string, and an address over the length limit", () => {
    for (const value of [null, undefined, 1, true, ["/"], { href: "/" }]) expect(linkHref(value)).toBeNull();
    const longest = `/${"a".repeat(MAX_URL_LENGTH - 1)}`;
    expect(linkHref(longest)).toBe(longest);
    expect(linkHref(`${longest}a`)).toBeNull();
  });
});

test("an image comes from https or the site itself, never http, data or another scheme", () => {
  expect(imageSrc("https://images.example.org/bay/buoys.jpg?w=800&h=600")).toBe("https://images.example.org/bay/buoys.jpg?w=800&h=600");
  expect(imageSrc("/uploads/jetty.png")).toBe("/uploads/jetty.png");
  for (const value of ["http://images.example.org/mixed.jpg", "javascript:alert(1)", "data:image/svg+xml,<svg onload=alert(1)>", "/", "//cdn.example/x.png", "#a", "?a"]) {
    expect(imageSrc(value), value).toBeNull();
  }
});

test("a player address is built from a known provider and an id of its form, and from nothing else", () => {
  expect(videoSrc("youtube", "M7lc1UVf-VE")).toBe("https://www.youtube-nocookie.com/embed/M7lc1UVf-VE");
  expect(videoSrc("vimeo", "76979871")).toBe("https://player.vimeo.com/video/76979871?dnt=1");
  expect(videoSrc("vimeo", "123456789012")).toBe("https://player.vimeo.com/video/123456789012?dnt=1");
  for (const [provider, id] of [
    ["youtube", "\"><script>alert(1)</script>"], ["youtube", "M7lc1UVf-V"], ["vimeo", "1234567890123"], ["vimeo", "abc"],
    ["dailymotion", "x7tgad0"], ["__proto__", "M7lc1UVf-VE"], ["constructor", "M7lc1UVf-VE"], ["toString", "1"], [1, "1"], ["youtube", 12345678901],
  ] as const) {
    expect(videoSrc(provider, id), `${String(provider)} ${String(id)}`).toBeNull();
  }
  expect(isVideoProvider("youtube")).toBe(true);
  expect(isVideoProvider("__proto__")).toBe(false);
  expect(isVideoProvider("hasOwnProperty")).toBe(false);
  expect(FRAME_ORIGINS).toEqual(["https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://www.openstreetmap.org"]);
});

test("an anchor is a lowercase name of up to 64 characters", () => {
  expect(anchor("traps")).toBe("traps");
  expect(anchor(`a${"b".repeat(63)}`)).toBe(`a${"b".repeat(63)}`);
  for (const value of [`a${"b".repeat(64)}`, "Not An Anchor!", "1st", "-a", "", "a_b", "a\n", null, 1]) expect(anchor(value), String(value)).toBeNull();
});

describe("maps", () => {
  test("the goldens' addresses", () => {
    expect(mapSrc(54.5, -3.25, 15)).toBe(
      "https://www.openstreetmap.org/export/embed.html?bbox=-3.267166%2C54.494393%2C-3.232834%2C54.505607&layer=mapnik&marker=54.500000%2C-3.250000",
    );
    // Zoomed all the way out, the area is cut at the meridian and at 85 degrees.
    expect(mapSrc(-33.8915, 151.2767, 1)).toBe(
      "https://www.openstreetmap.org/export/embed.html?bbox=-129.973300%2C-85.000000%2C180.000000%2C85.000000&layer=mapnik&marker=-33.891500%2C151.276700",
    );
    expect(mapSrc(0, 0, 19)).toBe(
      "https://www.openstreetmap.org/export/embed.html?bbox=-0.001073%2C-0.000603%2C0.001073%2C0.000603&layer=mapnik&marker=0.000000%2C0.000000",
    );
  });

  test("nothing for a point out of range, a zoom that is no whole number from 1 to 19, or numbers written as strings", () => {
    for (const [lat, lon, zoom] of [[91, 0, 10], [-90.000001, 0, 3], [0, 180.5, 3], [0, 0, 0], [0, 0, 20], [0, 0, 5.5], ["54.5", "-3.25", "15"], [Number.NaN, 0, 1], [Number.POSITIVE_INFINITY, 0, 1], [0, 0, null]] as const) {
      expect(mapSrc(lat, lon, zoom), `${lat} ${lon} ${zoom}`).toBeNull();
    }
    expect(mapSrc(90, -180, 1)).not.toBeNull();
  });
});

describe("six decimals, as Ruby's format(\"%.6f\") writes them", () => {
  test.each([
    [0, "0.000000"], [-0, "0.000000"], [45, "45.000000"], [-180, "-180.000000"], [54.5, "54.500000"], [-3.25, "-3.250000"],
    // Smaller than half a millionth, either side of zero: never "-0.000000".
    [4e-7, "0.000000"], [-4e-7, "0.000000"], [-1e-9, "0.000000"],
    // Exactly half way (1/128 and 3/128): to the even digit, where toFixed
    // goes away from zero.
    [0.0078125, "0.007812"], [-0.0078125, "-0.007812"], [0.0234375, "0.023438"], [54.5078125, "54.507812"],
    // A little over half way, within Ruby's error bound: Ruby takes it as
    // half way (149.807062500000000682 exactly, from large-500.json).
    [141.018 + ((360 / 2 ** 6) * 400) / 256, "149.807062"], [62.30481450000001, "62.304814"], [71.67312349999999, "71.673124"],
    // Further from half way than the bound: the exact value, rounded.
    [62.304814500001, "62.304815"], [1.0000005000001, "1.000001"],
  ])("%s is %s", (value, text) => {
    expect(decimal(value)).toBe(text);
  });

  test("toFixed differs from it on ties and near-ties only", () => {
    expect((0.0078125).toFixed(6)).toBe("0.007813");
    expect((141.018 + ((360 / 2 ** 6) * 400) / 256).toFixed(6)).toBe("149.807063");
    expect(decimal(1.23456789)).toBe((1.23456789).toFixed(6));
  });
});

describe("a sticky header's rows", () => {
  const section = (columns: number, stack?: string) => ({ props: stack === undefined ? {} : { stack }, children: Array.from({ length: columns }, () => ({})) });
  const holding = (stack: string | undefined, ...columns: string[][]) => ({ props: stack === undefined ? {} : { stack }, children: columns.map((types) => ({ children: types.map((type) => ({ type })) })) });
  test("one for each section on a desktop; on a tablet and a phone, one for each column where the columns stack", () => {
    expect(stickyRows({ sticky: true, sections: [section(3, "never")] })).toBe("1 1 1");
    expect(stickyRows({ sticky: true, sections: [section(1)] })).toBe("1 1 1");
    expect(stickyRows({ sticky: true, sections: [section(2)] })).toBe("1 2 2");
    expect(stickyRows({ sticky: true, sections: [section(3, "phone")] })).toBe("1 1 3");
    expect(stickyRows({ sticky: true, sections: [section(1), section(3, "never"), section(2)] })).toBe("3 4 4");
  });
  test("a column is a row for each of its blocks, three for a tall one; a section, its tallest column, or all of them where they stack", () => {
    expect(stickyRows({ sticky: true, sections: [holding(undefined, ["button", "button"])] })).toBe("2 2 2");
    expect(stickyRows({ sticky: true, sections: [holding("never", ["logo"], ["menu"], ["button"]), holding(undefined, ["heading", "button"], ["heading"])] })).toBe("3 4 4");
    expect(stickyRows({ sticky: true, sections: [holding("phone", ["image"], ["text", "text"])] })).toBe("3 3 5");
    expect(stickyRows({ sticky: true, sections: [holding("never", ["logo"], ["stats"])] })).toBe("3 3 3");
    expect(stickyRows({ sticky: true, sections: [holding("phone", ["steps"], ["logo"])] })).toBe("3 3 4");
    expect(stickyRows({ sticky: true, sections: [holding(undefined, ["pricing"], ["button"])] })).toBe("3 4 4");
    expect(stickyRows({ sticky: true, sections: [holding(undefined, [])] })).toBe("1 1 1");
  });
  test("a section's own space above and below counts, past the header's 20 (12 on a phone) and the 16 to spare, at a row's 88 (68)", () => {
    const spaced = (style: unknown) => ({ props: { stack: "never" }, children: [{ children: [{ type: "button" }] }], style });
    expect(stickyRows({ sticky: true, sections: [spaced({ base: { spaceAbove: "section-s", spaceBelow: "section-s" } })] })).toBe("2 2 3");
    expect(stickyRows({ sticky: true, sections: [spaced({ base: { spaceAbove: "section-l", spaceBelow: "section-l" } })] })).toBe("3 3 4");
    // A device's own step, and a phone that takes the base's, never the tablet's.
    expect(stickyRows({ sticky: true, sections: [spaced({ base: { spaceAbove: "m" }, tablet: { spaceAbove: "section-l", spaceBelow: "section-l" } })] })).toBe("1 3 1");
    expect(stickyRows({ sticky: true, sections: [spaced({ phone: { spaceAbove: "section-l" } })] })).toBe("1 1 2");
    // No more than the header's own, what the 16 to spare holds, or a step
    // that is not one, adds nothing.
    expect(stickyRows({ sticky: true, sections: [spaced({ base: { spaceAbove: "none", spaceBelow: "l" } })] })).toBe("1 1 1");
    expect(stickyRows({ sticky: true, sections: [spaced({ base: { spaceAbove: "none", spaceBelow: "xxl" } })] })).toBe("1 1 2");
    expect(stickyRows({ sticky: true, sections: [spaced({ base: { spaceAbove: "huge", spaceBelow: 96 } })] })).toBe("1 1 1");
    expect(stickyRows({ sticky: true, sections: [spaced("section-l")] })).toBe("1 1 1");
  });
  test("a column's own space inside and between its blocks counts, past the theme's", () => {
    const column = (style: unknown, ...types: string[]) => ({ children: types.map((type) => ({ type })), style });
    const header = (...columns: unknown[]) => ({ sticky: true, sections: [{ props: { stack: "never" }, children: columns }] });
    expect(stickyRows(header(column({ base: { spaceInside: "xxl" } }, "button")))).toBe("2 2 3");
    expect(stickyRows(header(column({ base: { spaceBetween: "xxl" } }, "button", "button", "button")))).toBe("4 4 4");
    // Side by side, the tallest column; a tablet's own space, a phone's never the tablet's.
    expect(stickyRows(header(column({}, "logo"), column({ base: { spaceInside: "xxl" } }, "button")))).toBe("2 2 3");
    expect(stickyRows(header(column({ tablet: { spaceInside: "xxl" } }, "button")))).toBe("1 2 1");
    // The theme's space between, or less, a step that is not one, adds nothing.
    expect(stickyRows(header(column({ base: { spaceBetween: "l", spaceInside: "section-l" } }, "button", "button")))).toBe("2 2 2");
    expect(stickyRows(header(column({ base: { spaceInside: "huge", spaceBetween: 48 } }, "button")))).toBe("1 1 1");
  });
  test("a heading's and a text's line counts at its type step, past what a row holds", () => {
    const heading = (level: number, style: unknown = {}) => ({ type: "heading", props: { level }, style });
    const header = (column: unknown) => ({ sticky: true, sections: [{ props: { stack: "never" }, children: [column] }] });
    expect(stickyRows(header({ children: [heading(2, { base: { textSize: "display" } })] }))).toBe("2 2 1");
    expect(stickyRows(header({ children: [heading(1)] }))).toBe("2 1 1");
    expect(stickyRows(header({ children: [heading(2)] }))).toBe("1 1 1");
    expect(stickyRows(header({ children: [heading(3, { tablet: { textSize: "display" } })] }))).toBe("1 2 1");
    // A text at its column's step, or its own.
    expect(stickyRows(header({ style: { base: { textSize: "display" } }, children: [{ type: "text" }] }))).toBe("2 2 1");
    expect(stickyRows(header({ style: { base: { textSize: "display" } }, children: [{ type: "text", style: { base: { textSize: "small" } } }] }))).toBe("1 1 1");
    // A step that is not one, or a level out of range: the level's, else h2's.
    expect(stickyRows(header({ children: [heading(9, { base: { textSize: "huge" } })] }))).toBe("1 1 1");
  });
  test("the row, the header's space and the spare it counts with are the published page's own (site.css)", () => {
    const css = readFileSync(new URL("../../../cms/app/assets/stylesheets/site.css", import.meta.url), "utf8");
    expect(css).toContain(`--sticky-row: ${STICKY_ROW[0]}px`);
    expect(css).toContain(`--sticky-row: ${STICKY_ROW[2]}px`);
    expect(css).toMatch(new RegExp(`\\.sw-header \\{[^}]*--sec-y: ${HEADER_SPACE[0]}px`));
    expect(css).toMatch(new RegExp(`\\.sw-header \\{[^}]*--sec-y: ${HEADER_SPACE[2]}px`));
    expect(css).toContain(`* var(--sticky-row) + ${STICKY_SPARE}px)`);
    expect([STICKY_ROW[1], HEADER_SPACE[1]]).toEqual([STICKY_ROW[0], HEADER_SPACE[0]]);
    // A column's blocks stand the theme's l apart (the step the count takes as given).
    expect(css).toContain("--col-gap: var(--space-l);");
  });
  test("at most 9 on any device; none for a header that does not stay at the top", () => {
    expect(stickyRows({ sticky: true, sections: [section(4), section(4), section(1)] })).toBe("3 9 9");
    expect(stickyRows({ sticky: true, sections: [holding(undefined, ["gallery", "map", "video", "quote"])] })).toBe("9 9 9");
    expect(stickyRows({ sticky: true, sections: [] })).toBe("1 1 1");
    for (const document of [{ sections: [section(2)] }, { sticky: false, sections: [section(2)] }, { sticky: "true" }, null, []]) expect(stickyRows(document)).toBeNull();
  });
});
