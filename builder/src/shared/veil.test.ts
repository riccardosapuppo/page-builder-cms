// The veil over a section's picture (./veil.ts) and the stylesheet that
// draws it and a block's motion (cms/app/assets/stylesheets/site.css): the
// contrast the panel and the Assistant measure, and site.css's rules for
// every value the schema lists, on every device, with the colours and
// strengths the measure uses.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { FOCUS_TOKENS, MOTION_TOKENS, VEIL_STRENGTH_TOKENS, VEIL_TOKENS } from "./document.ts";
import { contrastRatio } from "./free-colors.ts";
import { over, VEIL_COLORS, VEIL_OPACITY, veilContrast, wordsOnVeil } from "./veil.ts";

const SITE = { text: "#0e2a35", background: "#ffffff" };
const css = readFileSync(join(repoRoot, "cms", "app", "assets", "stylesheets", "site.css"), "utf8");
// The rules of one device: the base's outside any container query, a
// tablet's and a phone's inside theirs.
const DEVICE_PREFIX = { base: "", tablet: "tablet-", phone: "phone-" } as const;

describe("the words on a veiled picture", () => {
  test("a colour laid over another, at an opacity", () => {
    expect(over("#000000", "#ffffff", 0.6)).toBe("#666666");
    expect(over("#ffffff", "#000000", 0.4)).toBe("#666666");
    expect(over("#0e2a35", "#ffffff", 1)).toBe("#0e2a35");
  });

  test("the words take the Background tone on a dark veil and the Text tone's, the Text tone on a light one", () => {
    expect(wordsOnVeil("dark", SITE)).toBe(SITE.background);
    expect(wordsOnVeil("text", SITE)).toBe(SITE.background);
    expect(wordsOnVeil("light", SITE)).toBe(SITE.text);
  });

  test("they are measured where the picture is worst for them, the lower of white and black", () => {
    // A dark veil at medium: the words, white, read worst over a white
    // picture, at the veil's #666666.
    const dark = veilContrast("dark", "medium", SITE);
    expect(dark.worst).toBe("white");
    expect(dark.ratio).toBeCloseTo(contrastRatio("#ffffff", "#666666"), 6);
    // A light veil: the ink words read worst over a black picture.
    const light = veilContrast("light", "medium", SITE);
    expect(light.worst).toBe("black");
    expect(light.ratio).toBeCloseTo(contrastRatio(SITE.text, "#999999"), 6);
  });

  test("a stronger veil reads better, and medium and strong dark and light veils read as body text must on the site's own tones", () => {
    for (const veil of ["dark", "light", "text"] as const) {
      const [weak, medium, strong] = VEIL_STRENGTH_TOKENS.map((strength) => veilContrast(veil, strength, SITE).ratio);
      expect(weak!, veil).toBeLessThan(medium!);
      expect(medium!, veil).toBeLessThan(strong!);
    }
    for (const veil of ["dark", "light"] as const) {
      expect(veilContrast(veil, "medium", SITE).ratio, veil).toBeGreaterThanOrEqual(4.5);
      expect(veilContrast(veil, "light", SITE).ratio, veil).toBeLessThan(4.5);
    }
    expect(veilContrast("text", "strong", SITE).ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("site.css draws every value the schema lists, on every device", () => {
  // The declarations of the one rule for a selector: a device's selectors
  // name its prefix (data-tablet-veil), and stand in its container query.
  const declarations = (selector: string, device: keyof typeof DEVICE_PREFIX): string => {
    const at = css.indexOf(`${selector} {`);
    if (at === -1 || css.indexOf(`${selector} {`, at + 1) !== -1) return "";
    const query = css.lastIndexOf("@container site", at);
    const inQuery = query !== -1 && css.indexOf("\n}", query) > at;
    if (inQuery !== (device !== "base")) return "";
    return css.slice(at + selector.length + 2, css.indexOf("}", at)).trim();
  };

  test("each veil's colour and each strength's opacity are the measure's", () => {
    for (const [device, prefix] of Object.entries(DEVICE_PREFIX) as Array<[keyof typeof DEVICE_PREFIX, string]>) {
      expect(declarations(`.sec[data-${prefix}veil="dark"]`, device), device).toBe(`--picture-veil: ${VEIL_COLORS.dark.toUpperCase()};`);
      expect(declarations(`.sec[data-${prefix}veil="light"]`, device), device).toBe(`--picture-veil: ${VEIL_COLORS.light.toUpperCase()};`);
      expect(declarations(`.sec[data-${prefix}veil="text"]`, device), device).toBe("--picture-veil: var(--sw-text);");
      expect(declarations(`.sec[data-${prefix}veil="none"]`, device), device).toBe("--picture-veil: transparent;");
      for (const strength of VEIL_STRENGTH_TOKENS) {
        expect(declarations(`.sec[data-${prefix}veil-strength="${strength}"]`, device), `${device} ${strength}`).toBe(`--picture-veil-strength: ${String(VEIL_OPACITY[strength]).replace(/^0/, "")};`);
      }
    }
    // A strength the section does not name is medium.
    expect(css).toContain("opacity: var(--picture-veil-strength, .6);");
    expect(VEIL_OPACITY.medium).toBe(0.6);
  });

  test("each veil gives the words the colour the measure gives them", () => {
    for (const prefix of Object.values(DEVICE_PREFIX)) {
      expect(css, prefix).toContain(`.sec:is([data-${prefix}veil="dark"], [data-${prefix}veil="text"]) > .sw-inner { color: var(--sw-background);`);
      expect(css, prefix).toContain(`.sec[data-${prefix}veil="light"] > .sw-inner { color: var(--sw-text);`);
      expect(css, prefix).toContain(`.sec[data-${prefix}veil="none"] > .sw-inner { color: inherit;`);
    }
    expect(VEIL_TOKENS).toEqual(["none", "dark", "light", "text"]);
  });

  test("every focus is a point of the picture kept in view", () => {
    const points: Record<string, string> = {
      center: "50% 50%", top: "50% 0%", bottom: "50% 100%", left: "0% 50%", right: "100% 50%",
      "top-left": "0% 0%", "top-right": "100% 0%", "bottom-left": "0% 100%", "bottom-right": "100% 100%",
    };
    expect(Object.keys(points).sort()).toEqual([...FOCUS_TOKENS].sort());
    for (const [device, prefix] of Object.entries(DEVICE_PREFIX) as Array<[keyof typeof DEVICE_PREFIX, string]>) {
      for (const focus of FOCUS_TOKENS) expect(declarations(`.sec[data-${prefix}focus="${focus}"]`, device), `${device} ${focus}`).toBe(`--picture-focus: ${points[focus]};`);
    }
  });

  test("every motion plays on every device, by the scroll, only where it can and is wanted", () => {
    const motion = css.slice(css.indexOf("@media screen and (prefers-reduced-motion: no-preference) {"));
    expect(motion).toMatch(/^@media screen and \(prefers-reduced-motion: no-preference\) \{\s*@supports \(animation-timeline: view\(\)\) \{/);
    const block = motion.slice(0, motion.indexOf("@keyframes"));
    for (const prefix of Object.values(DEVICE_PREFIX)) {
      for (const value of MOTION_TOKENS.filter((token) => token !== "none")) {
        expect(block, `${prefix}${value}`).toContain(`[data-${prefix}motion="${value}"] { animation: sw-${value} both`);
      }
      if (prefix !== "") expect(block).toContain(`[data-${prefix}motion="none"] { animation: none; }`);
    }
    // Each rule sets its timeline after the shorthand, which resets it.
    for (const rule of block.match(/\[data-[a-z-]*motion="(?:rise|fade|zoom)"\] \{[^}]*\}/g) ?? []) {
      expect(rule).toMatch(/animation: [^;]+; animation-timeline: view\(\); animation-range: entry 0% entry 60%; \}$/);
    }
    // Outside that block, no rule names a motion: nothing moves, nothing is
    // hidden.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const at = rules.indexOf("@media screen and (prefers-reduced-motion: no-preference) {");
    const end = rules.indexOf("@keyframes", at);
    expect(rules.slice(0, at) + rules.slice(end)).not.toMatch(/data-[a-z-]*motion/);
  });
});
