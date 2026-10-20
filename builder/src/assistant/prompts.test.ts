// The page's question (./prompts.ts): it carries the site's own facts (its
// palette, its library with each image's shape, its pages, its forty-eight
// icons with what each shows), asks for a page with rhythm and life (a
// strong opening, bands that alternate, points side by side, figures and
// steps where the brief gives them, one call to action said again at the
// end, motion with restraint, the library's pictures where they fit), and
// keeps its rules on facts as they were. Where pictures are made for the
// page, it asks for a few, where they matter, never with words in them or
// anyone real; a photo is asked for with the same two rules, and an
// illustration in the site's palette, in the viewBox of its shape.
import { expect, test } from "vitest";
import { ICON_NAMES } from "../shared/document.ts";
import { siteStyleChoices } from "../shared/site-tokens.ts";
import { ICON_WORDS } from "../widgets/iconbox/words.ts";
import { directionSchema } from "./direction.ts";
import { PLAN_MADE_MOST, PLAN_SCHEMA, PLAN_SCHEMA_MADE } from "./plan.ts";
import { directionQuestion, illustrationQuestion, pageQuestion, photoPrompt, rewriteQuestion, SVG_SCHEMA, type PageDirection, type SiteWords } from "./prompts.ts";

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

test("where pictures are made, the plan may make them: a few, where they matter, never with words in them or anyone real; the rules on facts are the same", () => {
  for (const kind of ["photo", "illustration"] as const) {
    const { system, schema } = pageQuestion("m", "brief", SITE, kind);
    expect(schema).toBe(PLAN_SCHEMA_MADE);
    for (const rule of [
      "Use only these ids for the library's images, and one only where what it shows fits the page; where none fits, a picture may be made for the page instead:",
      "Behind it a picture: the library's when one fits the page, else one made for it.",
      "- A picture behind a section from the library where one fits, else made for the page, and only where it serves the section: at most two on a page",
      `At most ${PLAN_MADE_MOST} on the page, where they matter: the opening's picture, a band that shows what the page offers, cards side by side (an image above each card's words). Each one costs the person: make none where the page does not need it.`,
      "its shape, landscape (3:2) behind a section or across a column, square or portrait (2:3) for cards.",
      "- Never text in a picture: no words, letters, numbers, signs or logos. The page's words carry those.",
      "- People in a picture, if any, are generic and unnamed: never a real person, a brand or a trademark.",
      `- ${FACTS}`,
    ]) expect(system, `${kind}: ${rule}`).toContain(rule);
    // The rules of a page with no pictures made are gone.
    expect(system).not.toContain("A picture behind a section only from the library");
  }
  expect(pageQuestion("m", "b", SITE, "photo").system).toContain("are photographs, natural light on real places, people and things");
  expect(pageQuestion("m", "b", SITE, "illustration").system).toContain("are flat vector illustrations in the site's palette");
  expect(pageQuestion("m", "b", { ...SITE, media: [] }, "photo").system).toContain("(no images: make the pictures the page needs)");
  expect(pageQuestion("m", "b", SITE).schema).toBe(PLAN_SCHEMA);
});

test("a photo is asked for in the plan's words, with the two rules every picture keeps", () => {
  expect(photoPrompt({ prompt: "  Rowers on a misty river at dawn, seen from the bank.  " })).toBe(
    "Rowers on a misty river at dawn, seen from the bank.\n\nA photograph for a web page. Never text in a picture: no words, letters, numbers, signs or logos. The page's words carry those. People in a picture, if any, are generic and unnamed: never a real person, a brand or a trademark.",
  );
});

test("an illustration is one SVG in a small schema, in the site's palette as hex, in the viewBox of its shape, holding only what the cleaner keeps", () => {
  const question = illustrationQuestion("claude-opus-5-5", { prompt: "A rower on calm water.", shape: "portrait" }, SITE.palette);
  expect(question).toMatchObject({ model: "claude-opus-5-5", text: "The illustration shows: A rower on calm water.", schema: SVG_SCHEMA, name: "illustration", effort: "low", once: true });
  // Asked once, as a picture is; the page's own question keeps the SDK's retry.
  expect(pageQuestion("m", "b", SITE, "illustration").once).toBeUndefined();
  expect(SVG_SCHEMA).toEqual({ type: "object", additionalProperties: false, required: ["svg"], properties: { svg: { type: "string", description: "The illustration: one SVG document, its svg element the root, nothing before or after it." } } });
  for (const rule of [
    "flat, simple vector art, like a poster or a print, never a photograph",
    "text #0E2A35, background #FFFFFF, primary #C2352B, accent #F2A541, soft #E6EFEA, muted #4E625B",
    "- Never text in a picture: no words, letters, numbers, signs or logos.",
    "never a real person, a brand or a trademark",
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 600\">",
    "Only these elements: svg, g, defs, path, rect, circle, ellipse, line, polyline, polygon, linearGradient, radialGradient, stop.",
    "no style, class, script, text, image, use, href, filter, mask, clipPath, pattern, animation or foreignObject",
    "a few kilobytes",
  ]) expect(question.system, rule).toContain(rule);
  expect(illustrationQuestion("m", { prompt: "x", shape: "landscape" }, SITE.palette).system).toContain("viewBox=\"0 0 600 400\"");
  expect(illustrationQuestion("m", { prompt: "x", shape: "square" }, SITE.palette).system).toContain("viewBox=\"0 0 400 400\"");
});

// ------------------------------------------------------------ a new site

test("a new site's direction is asked from the brief alone, in a schema made for the site style, each slot said with what the site does with it, the rules on facts kept, the kind of pictures said", () => {
  const style = { choices: siteStyleChoices() };
  const question = directionQuestion("claude-opus-5-5", "  A modern fitness gym.  ", style, "photo");
  expect(question).toMatchObject({ model: "claude-opus-5-5", text: "The site the person wants:\n\nA modern fitness gym.", name: "site_direction", effort: "medium" });
  expect(question.schema).toEqual(directionSchema(style));
  for (const rule of [
    "  - primary: headings, links and the form's send key, and a strong band",
    "  - accent: buttons, their words in the text colour",
    "each at 4.5 to 1 at least (WCAG's AA)",
    "- The pages: 3 or 4, the first the home page",
    `- ${FACTS} The direction itself names no price, date, address or review`,
    "which are photographs",
  ]) expect(question.system, rule).toContain(rule);
  expect(directionQuestion("m", "b", style, "illustration").system).toContain("which are flat vector illustrations");
});

const DIRECTED: PageDirection = {
  name: "Iron Forge",
  voice: "Direct and encouraging.",
  palette: { primary: { hex: "#c2352b", role: "Headings and links" } },
  imagery: "Warm photos of people training.",
  motion: "little",
  action: "Book a free session",
  page: { title: "Classes", purpose: "The kinds of class.", path: "/classes", home: false },
  pages: [{ path: "/iron-forge", title: "Home", purpose: "What the gym offers." }, { path: "/classes", title: "Classes", purpose: "The kinds of class." }],
  most: 2,
};

test("a page of a new site is asked with its direction: its name and voice, its colours with their roles, this page's purpose, the site's pages for its links, its call to action, its imagery, its motion and its share of the pictures", () => {
  const { system } = pageQuestion("m", "A gym.", SITE, "photo", DIRECTED);
  for (const rule of [
    "You plan one page of a new web site for a page builder",
    "- Its name: Iron Forge. Its voice: Direct and encouraging. Write every word in it.",
    "- This page: “Classes”, at /classes: The kinds of class. Write this page only: the site's other pages hold the rest, and a button may lead to them.",
    "- Its call to action: “Book a free session”.",
    "- Its imagery: Warm photos of people training.",
    "  - primary: #C2352B (Headings and links)",
    "  - /iron-forge: Home: What the gym offers.",
    "  - /classes: Classes (this page): The kinds of class.",
    ", in the site's imagery. At most 2 on the page",
    "- A little motion: rise or fade on one or two sections after the opening",
    `- ${FACTS}`,
  ]) expect(system, rule).toContain(rule);
  expect(system).not.toContain("- Motion with restraint");
  expect(pageQuestion("m", "b", SITE, null, { ...DIRECTED, motion: "none" }).system).toContain("- No motion: every section's motion is none.");
  expect(pageQuestion("m", "b", SITE, null, { ...DIRECTED, page: { ...DIRECTED.page, home: true } }).system).toContain("It is the site's home page: its opening says what the site is and offers.");
});

test("a new site's imagery goes with each photo's prompt and each illustration's question", () => {
  expect(photoPrompt({ prompt: "A coach beside a lifter." }, "  Warm photos, low angles.  ")).toBe(
    "A coach beside a lifter.\n\nThe site's imagery: Warm photos, low angles.\n\nA photograph for a web page. Never text in a picture: no words, letters, numbers, signs or logos. The page's words carry those. People in a picture, if any, are generic and unnamed: never a real person, a brand or a trademark.",
  );
  expect(illustrationQuestion("m", { prompt: "x", shape: "square" }, SITE.palette, "Bold flat shapes.").system).toContain("- The site's imagery, which it keeps to as far as flat shapes can: Bold flat shapes.");
  expect(illustrationQuestion("m", { prompt: "x", shape: "square" }, SITE.palette).system).not.toContain("imagery");
});

test("its rules on facts are as they were, and as a text written again keeps them", () => {
  const { system } = pageQuestion("m", "brief", SITE);
  expect(system).toContain(`- ${FACTS}`);
  expect(system).toContain("- Stats only for a few key figures the brief gives, each its value and what it counts; never a figure the brief does not hold.");
  expect(system).toContain("- Pricing only when the brief gives prices: its plans, each with its price and period as the brief writes them, what it includes and a button; one plan featured at most. Never a plan, a price or a feature the brief does not hold.");
  expect(system).toContain("- A button, a plan's too, leads to a section of this plan (#its-anchor), to one of the site's pages (its path), or to an address the person gives. Nothing else.");
  expect(rewriteQuestion("m", "Shorter", "Words", "text", "Home").system).toContain(FACTS);
});
