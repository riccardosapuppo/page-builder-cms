// The page's question (./prompts.ts): it carries the site's own facts (its
// palette, its library with each image's shape, its pages, its forty-eight
// icons with what each shows), asks for a page with rhythm and life (a
// strong opening, bands that alternate, points side by side, figures and
// steps where the brief gives them, one call to action said again at the
// end, motion with restraint, the library's pictures where they fit), and
// keeps its rules on facts as they were.
import { expect, test } from "vitest";
import { ICON_NAMES } from "../shared/document.ts";
import { ICON_WORDS } from "../widgets/iconbox/words.ts";
import { PLAN_SCHEMA } from "./plan.ts";
import { pageQuestion, rewriteQuestion, type SiteWords } from "./prompts.ts";

const SITE: SiteWords = {
  palette: { text: "#0E2A35", background: "#FFFFFF", primary: "#C2352B", accent: "#F2A541", soft: "#E6EFEA", muted: "#4E625B" },
  media: [
    { id: "m-floor", alt: "The gym floor at opening", width: 1600, height: 900 },
    { id: "m-rope", alt: "", width: 600, height: 900 },
    { id: "m-mat", alt: "A yoga mat", width: 800, height: 800 },
    { id: "m-old", alt: "An old picture" },
  ],
  pages: [{ path: "/", title: "Home" }, { path: "/classes", title: "Classes" }],
};
const FACTS = "Use only the facts the person gives: never make up a price, a date, a time, a name, an address, a number, a quotation or a review. Where a fact is missing, write around it.";

test("the question carries the site: its palette, its library with each image's shape, its pages and every icon with what it shows", () => {
  const { system, text, schema, name } = pageQuestion("claude-opus-5-5", "  A modern gym.  ", SITE);
  expect(text).toBe("The page the person wants:\n\nA modern gym.");
  expect(schema).toBe(PLAN_SCHEMA);
  expect(name).toBe("page_plan");
  expect(system).toContain("  - primary: #C2352B");
  expect(system).toContain("  - m-floor: The gym floor at opening (wide, 1600 by 900)");
  expect(system).toContain("  - m-rope: no description (tall, 600 by 900)");
  expect(system).toContain("  - m-mat: A yoga mat (square, 800 by 800)");
  expect(system).toContain("  - m-old: An old picture (size unknown)");
  expect(system).toContain("  - /classes: Classes");
  for (const icon of ICON_NAMES) expect(system, icon).toContain(`  - ${icon}: ${ICON_WORDS[icon]}\n`);
  // A library with nothing in it: no image and no picture.
  expect(pageQuestion("m", "b", { ...SITE, media: [] }).system).toContain("(no images: use none, and no picture)");
});

test("it asks for a page with rhythm and life", () => {
  const { system } = pageQuestion("m", "brief", SITE);
  for (const rule of [
    "- A strong opening: the page's one level 1 heading (display: true)",
    "- Bands that alternate.",
    "- Points side by side as icon boxes: three or four, each in a column of its own",
    "- Figures and steps where the brief gives them",
    "- One clear call to action: the opening's button, with the same words and the same target as the button of the last section",
    "- Motion with restraint: rise or fade on two or three sections after the opening, zoom once at most, none on the opening",
    "- A picture behind a section only from the library, and only where what it shows fits",
  ]) expect(system, rule).toContain(rule);
});

test("its rules on facts are as they were, and as a text written again keeps them", () => {
  const { system } = pageQuestion("m", "brief", SITE);
  expect(system).toContain(`- ${FACTS}`);
  expect(system).toContain("- Stats only for a few key figures the brief gives, each its value and what it counts; never a figure the brief does not hold.");
  expect(system).toContain("- Pricing only when the brief gives prices: its plans, each with its price and period as the brief writes them, what it includes and a button; one plan featured at most. Never a plan, a price or a feature the brief does not hold.");
  expect(system).toContain("- A button, a plan's too, leads to a section of this plan (#its-anchor), to one of the site's pages (its path), or to an address the person gives. Nothing else.");
  expect(rewriteQuestion("m", "Shorter", "Words", "text", "Home").system).toContain(FACTS);
});
