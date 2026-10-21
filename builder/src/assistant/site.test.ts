// A new site from a brief (./site.ts), on fakes of the test's own: an
// editor whose pages are real editor stores, opened one at a time, and a
// storage that keeps the style and the parts. The direction first; the
// style it gives, the old one kept; the header and the footer, the drafts
// they replace kept as versions; then the pages, one after the other, each
// asked with the direction and the site's pages, their pictures through
// one queue, two at a time, within one budget shared among the pages; the
// frame settled at the end on the pages made, its call to action leading
// to the home page's form, however the run ends: put back as it was where
// no page was made, a Stop during its first save included, and a first
// save whose answer was lost counted as saved, made sure of or marked to
// check; the buttons of the pages made that lead to a page not made
// losing their links. A stop,
// another page opened, a refused key end it; a page the model refused is
// said and the next written; a direction that is none, or a style the
// storage refuses, change nothing more.
import { expect, test } from "vitest";
import { makeReplacePage, type Made } from "../document/commands.ts";
import { sameJson } from "../document/json.ts";
import type { PageDocument } from "../shared/document.ts";
import { defaultSiteStyle, siteStyleChoices } from "../shared/site-tokens.ts";
import type { PartKind } from "../storage/adapter.ts";
import { createEditorStore, type EditorStore } from "../store/editor-store.ts";
import type { PictureAsk } from "./build.ts";
import { KEY_GONE } from "./context.tsx";
import type { DirectionStyle } from "./direction.ts";
import { AssistantError, type Answer, type Usage } from "./providers.ts";
import { BEFORE_NEW_SITE, LEFT_SITE, SITE_PICTURES_MOST, writeSite, type SiteHooks, type SitePagePlan, type SiteWriting } from "./site.ts";
import { tallyOf, type Tally } from "./tally.ts";
import { LEFT, type PictureMaker } from "./write.ts";

const STYLE: DirectionStyle = { ...defaultSiteStyle(), choices: siteStyleChoices() };
const USED: Usage = { input: 100, cacheRead: 0, cacheWrite: 0, output: 200 };
const TALLY = tallyOf("anthropic", "claude-opus-5-5", USED);

const DIRECTION = {
  name: "Iron Forge",
  tagline: "Strength, cardio and coaching under one roof",
  voice: "Direct and encouraging.",
  palette: {
    text: { hex: "#16181d", role: "Words" }, background: { hex: "#f7f5f0", role: "The page" }, primary: { hex: "#b3361b", role: "Headings" },
    accent: { hex: "#f2b33d", role: "Buttons" }, soft: { hex: "#ece6da", role: "Light bands" }, muted: { hex: "#5c5f66", role: "Captions" },
  },
  typeScale: "strong",
  letterWidth: "wide",
  imagery: "Warm, contrasty photos of people training.",
  motion: "little",
  action: "Book a free session",
  pages: [
    { title: "Home", address: "iron-forge", purpose: "What the gym offers." },
    { title: "Classes", address: "classes", purpose: "The kinds of class." },
    { title: "Membership", address: "membership", purpose: "How to join." },
  ],
};

const NONE = { source: "none" };
const band = (label: string, anchor: string, blocks: unknown[], picture: unknown = NONE) => ({ label, anchor, background: "none", picture, motion: "none", widths: "equal", columns: [{ align: "left", blocks }] });
const made = (prompt: string) => ({ kind: "image", source: "made", prompt, alt: prompt, shape: "square" });

// Each page's plan: the home page's form in a section of its own, anchored;
// a link to another page of the site; `pictures` images made for it.
function planOf(page: SitePagePlan, pictures = 0): string {
  const images = Array.from({ length: pictures }, (_, at) => made(`${page.title} picture ${at + 1}`));
  return JSON.stringify({
    title: page.title,
    description: "",
    sections: [
      band("Opening", "", [{ kind: "heading", level: 1, text: page.title, display: true }, { kind: "button", label: "Classes", target: "/classes" }, ...images]),
      ...(page.home ? [band("Join", "join", [{ kind: "heading", level: 2, text: "Join", display: false }, { kind: "form", fields: [{ type: "email", label: "Email", required: true }], submitLabel: "Book", confirmation: "Thanks." }])] : []),
    ],
  });
}

// A page that leads to the others: a button to each other page of the
// site, and a plan's button to the last of them; the home page's form.
function linkedPlan(page: SitePagePlan): string {
  const others = page.pages.filter((one) => one.path !== page.path);
  const offer = { name: "Monthly", price: "€39", period: "a month", text: "", features: ["Every class"], buttonLabel: "Join", buttonTarget: others.at(-1)!.path, featured: false, badge: "" };
  return JSON.stringify({
    title: page.title,
    description: "",
    sections: [
      band("Opening", "", [{ kind: "heading", level: 1, text: page.title, display: true }, ...others.map((one) => ({ kind: "button", label: one.title, target: one.path }))]),
      band("Plans", "", [{ kind: "heading", level: 2, text: "Plans", display: false }, { kind: "pricing", plans: [offer] }]),
      ...(page.home ? [band("Join", "join", [{ kind: "heading", level: 2, text: "Join", display: false }, { kind: "form", fields: [{ type: "email", label: "Email", required: true }], submitLabel: "Book", confirmation: "Thanks." }])] : []),
    ],
  });
}

// Where the buttons of a page lead: each button block's, then each plan's.
function buttonsOf(document: PageDocument): string[] {
  const opening = document.sections[0]!.children[0]!.children.filter((block) => block.type === "button").map((block) => `${(block.props as { label: string }).label} ${(block.props as { href: string }).href}`);
  const plans = document.sections[1]!.children[0]!.children.flatMap((block) => (block.type === "pricing" ? block.props.plans.map((plan) => `${plan.name}: ${plan.button.label} ${plan.button.href}`) : []));
  return [...opening, ...plans];
}

const answered = (text: string) => async (written: (piece: string) => void): Promise<Answer & { tally?: Tally }> => {
  written(text);
  await Promise.resolve();
  return { text, usage: USED, tally: TALLY };
};

// The parts' drafts as the site had them before the new site.
const ORIGINAL: Record<PartKind, PageDocument> = {
  header: { schemaVersion: 1, title: "Header", sticky: true, sections: [] },
  footer: { schemaVersion: 1, title: "Footer", sections: [] },
};

// The editor and the storage, faked: pages made at an address, opened one
// at a time, the person on a page of their own (id 1) to begin with; the
// parts' drafts, each one saved over kept as a version unless it is the
// run's own; a page's draft changed as the editor changes it. The parts'
// saves are counted from 1: those `losing` names are kept but answer that
// what became of them cannot be told; those `failing` names are not kept.
function fakeSite(options: { taken?: string[]; madeElsewhere?: string; style?: string | null; onSave?: (kind: PartKind) => void; refuseChange?: string; losing?: number[]; failing?: number[] } = {}) {
  const pages = new Map<number, { slug: string; store: EditorStore }>();
  let open = 1;
  let next = 100;
  let partSaves = 0;
  const calls: string[] = [];
  const parts: Record<PartKind, PageDocument[]> = { header: [], footer: [] };
  const drafts: Record<PartKind, PageDocument> = structuredClone(ORIGINAL);
  const versions: Record<PartKind, PageDocument[]> = { header: [], footer: [] };
  const styles: unknown[] = [];
  const hooks: SiteHooks = {
    async applyStyle(style) {
      calls.push("style");
      styles.push(style);
      return options.style ?? null;
    },
    async savePart(kind, document, keep, ours) {
      options.onSave?.(kind);
      const call = ++partSaves;
      await Promise.resolve();
      if (options.failing?.includes(call)) {
        calls.push(`${kind}, not saved`);
        return { ok: false, why: "the storage did not answer." };
      }
      const was = drafts[kind];
      const mine = ours !== null && sameJson(was, ours);
      if (!mine) versions[kind].push(was);
      calls.push(mine ? kind : `${kind}, “${keep}” kept`);
      drafts[kind] = document;
      parts[kind].push(document);
      if (options.losing?.includes(call)) return { ok: false, unknown: true, why: `no answer came about the ${kind}'s save, and its draft could not be read back to tell whether it was kept.`, replaced: was };
      return { ok: true, replaced: was };
    },
    async changePage(id, change) {
      const page = pages.get(id)!;
      calls.push(`change /${page.slug}`);
      if (options.refuseChange === page.slug) return "the storage did not answer.";
      const doc = page.store.getState().document;
      const changed = change(doc);
      if (changed === null) return null;
      const made = makeReplacePage(doc, changed.document, changed.label);
      if (made.ok) page.store.getState().dispatch(made.command);
      return null;
    },
    taken: () => [...(options.taken ?? []), ...[...pages.values()].map((page) => page.slug)],
    header: () => ({ schemaVersion: 1, title: "Header", sticky: true, sections: [] }),
    isOpen: (id) => open === id,
    page({ slug, after }) {
      let page: { id: number; slug: string } | null = null;
      return {
        made: () => page,
        async open(title) {
          if (after !== null && open !== after) return LEFT;
          const at = options.madeElsewhere === slug ? `${slug}-2` : slug;
          page = { id: next++, slug: at };
          pages.set(page.id, { slug: at, store: createEditorStore({ document: { schemaVersion: 1, title, sections: [] }, now: () => 0 }) });
          open = page.id;
          calls.push(`page /${at}`);
          return null;
        },
        still: () => page !== null && open === page.id,
        document: () => pages.get(page!.id)!.store.getState().document,
        apply(change: Made) {
          if (!change.ok) return change.error.message;
          const outcome = pages.get(page!.id)!.store.getState().dispatch(change.command);
          return outcome.ok ? null : outcome.error.message;
        },
        upload: async (_file, picture) => ({ ok: true, mediaId: `m-${picture.alt.replace(/[^a-z0-9]+/gi, "-")}` }),
      };
    },
  };
  return { hooks, calls, parts, drafts, versions, styles, pages, leave: () => (open = -1) };
}

// The page made at `slug`, as its store has it now.
const pageAt = (site: ReturnType<typeof fakeSite>, slug: string): PageDocument => [...site.pages.values()].find((page) => page.slug === slug)!.store.getState().document;
// The menu's links of a part as saved last.
const menuOf = (document: PageDocument): string[] => (document.sections[0]!.children[1]!.children[0]!.props as { items: Array<{ href: string }> }).items.map((item) => item.href);

let ids = 0;
const newId = () => `x${++ids}`;

// A maker that counts how many pictures are being made at once, each
// taking a few turns.
function counting() {
  const seen = { now: 0, most: 0, asked: [] as string[], looks: [] as unknown[] };
  const maker = (look: unknown): PictureMaker => {
    seen.looks.push(look);
    return {
      kind: "photo",
      async make(ask: PictureAsk) {
        seen.asked.push(ask.prompt);
        seen.now += 1;
        seen.most = Math.max(seen.most, seen.now);
        for (let turn = 0; turn < 5; turn += 1) await new Promise((done) => setTimeout(done, 1));
        seen.now -= 1;
        return { blob: new Blob(["x"]), type: "image/webp", width: 1024, height: 1024, tally: [] };
      },
    };
  };
  return { seen, maker };
}

test("a whole new site from a gym's brief: the direction, the style (the old one kept), the header and the footer (their drafts kept), three pages written to the direction; the frame settled, its call to action leading to the home page's form", async () => {
  const site = fakeSite();
  const asked: SitePagePlan[] = [];
  const told: SiteWriting["phase"][] = [];
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => {
      asked.push(page);
      return answered(planOf(page));
    },
    style: STYLE,
    facts: { media: [], brief: "A modern fitness gym." },
    hooks: site.hooks,
    newId,
    tell: (writing) => told.push(writing.phase),
  });

  expect(site.calls).toEqual([
    "style",
    `header, “${BEFORE_NEW_SITE}” kept`,
    `footer, “${BEFORE_NEW_SITE}” kept`,
    "page /iron-forge",
    "page /classes",
    "page /membership",
    "header",
  ]);
  expect(result.phase).toBe("done");
  expect(result.error).toBeNull();
  expect(result.steps).toEqual({ direction: "done", style: "done", header: "done", footer: "done" });
  expect(result.pages.map((page) => [page.title, page.path, page.state, page.writing?.phase])).toEqual([
    ["Home", "/iron-forge", "done", "done"],
    ["Classes", "/classes", "done", "done"],
    ["Membership", "/membership", "done", "done"],
  ]);
  expect(result.tally).toEqual(TALLY);
  expect(told.slice(0, 1)).toEqual(["asking"]);
  expect(told).toEqual(expect.arrayContaining(["style", "frame", "pages"]));

  // The style the direction gives, and the one it replaced, in memory.
  expect(site.styles).toEqual([{
    palette: { text: "#16181d", background: "#f7f5f0", primary: "#b3361b", accent: "#f2b33d", soft: "#ece6da", muted: "#5c5f66" },
    typeScale: "strong",
    letterWidth: "wide",
  }]);
  expect(result.before).toEqual({ palette: STYLE.palette, typeScale: STYLE.typeScale, letterWidth: STYLE.letterWidth });

  // Each page asked with the direction, its own purpose, the site's pages.
  expect(asked.map((page) => [page.title, page.path, page.home, page.purpose])).toEqual([
    ["Home", "/iron-forge", true, "What the gym offers."],
    ["Classes", "/classes", false, "The kinds of class."],
    ["Membership", "/membership", false, "How to join."],
  ]);
  expect(asked[1]!.direction.name).toBe("Iron Forge");
  expect(asked[1]!.pages.map((page) => page.path)).toEqual(["/iron-forge", "/classes", "/membership"]);
  // A link to another page of the site is kept.
  const classes = [...site.pages.values()].find((page) => page.slug === "classes")!.store.getState().document;
  expect(classes.sections[0]!.children[0]!.children[1]!.props).toEqual({ label: "Classes", href: "/classes" });

  // The header: the word mark, the pages, the call to action; once the home
  // page was written, it leads to the section holding its form.
  const [first, settled] = site.parts.header;
  const items = (document: PageDocument) => (document.sections[0]!.children[1]!.children[0]!.props as { items: unknown[] }).items;
  expect(first!.sections[0]!.children[0]!.children[0]!.props).toEqual({ name: "Iron Forge", mark: false });
  expect(items(first!)).toEqual([{ label: "Home", href: "/iron-forge" }, { label: "Classes", href: "/classes" }, { label: "Membership", href: "/membership" }]);
  expect(first!.sections[0]!.children[2]!.children[0]!.props).toEqual({ label: "Book a free session", href: "/iron-forge" });
  expect(settled!.sections[0]!.children[2]!.children[0]!.props).toEqual({ label: "Book a free session", href: "/iron-forge#join" });
  // It stays at the top of the window, as the header it replaced did.
  expect(settled!.sticky).toBe(true);
  expect(site.parts.footer).toHaveLength(1);
});

test("the pictures: one queue for the whole site, two at a time at most, and one budget shared among the pages, each told its share and held to it; the site's look reaches the maker", async () => {
  const site = fakeSite();
  const { seen, maker } = counting();
  const shares: number[] = [];
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    // Each page asks for five, whatever its share.
    askPage: (page) => {
      shares.push(page.most);
      return answered(planOf(page, 5));
    },
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    pictures: maker,
    hooks: site.hooks,
    newId,
    tell: () => undefined,
  });
  expect(result.phase).toBe("done");
  // Eight in all: five for the home page, keeping one for each page after it, then two, then one.
  expect(shares).toEqual([5, 2, 1]);
  expect(seen.asked).toHaveLength(SITE_PICTURES_MOST);
  expect(seen.most).toBe(2);
  expect(result.pages.map((page) => page.writing!.pictures.length)).toEqual([5, 2, 1]);
  // The notes of each page say what was left out over its share.
  expect(result.pages[1]!.writing!.notes).toContain("Left out an image to be made for the page: the site's pictures leave this page at most 2.");
  // The maker is made once, with the new palette and the direction's imagery.
  expect(seen.looks).toEqual([{ palette: { text: "#16181d", background: "#f7f5f0", primary: "#b3361b", accent: "#f2b33d", soft: "#ece6da", muted: "#5c5f66" }, imagery: "Warm, contrasty photos of people training." }]);
});

test("on the new palette: a dark site's words over a picture are held to its own colours, not the site's old ones", async () => {
  const site = fakeSite();
  const dark = { ...DIRECTION, palette: { ...DIRECTION.palette, text: { hex: "#f2efe8", role: "" }, background: { hex: "#111214", role: "" }, accent: { hex: "#f2b33d", role: "" }, soft: { hex: "#26282c", role: "" } } };
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(dark))(() => undefined),
    askPage: (page) => answered(JSON.stringify({ title: page.title, description: "", sections: [
      band("Opening", "", [{ kind: "heading", level: 1, text: page.title, display: true }], { source: "library", mediaId: "m-floor", veil: "dark", strength: "strong", focus: "center" }),
    ] })),
    style: STYLE,
    facts: { media: [{ id: "m-floor", alt: "The floor" }], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: () => undefined,
  });
  // A dark veil would draw the words in the dark background's colour: the text colour's veil reads.
  const home = [...site.pages.values()][0]!.store.getState().document;
  expect(home.sections[0]!.style.base).toMatchObject({ veil: "text", veilStrength: "strong" });
  expect(result.pages[0]!.writing!.notes[0]).toMatch(/^Made the veil over the picture of the section “Opening” the site's text colour and strong/);
});

test("an address the site has already is not taken: the page goes at the next one, and the frame links the pages where they were made", async () => {
  const site = fakeSite({ taken: ["classes"], madeElsewhere: "membership" });
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => answered(planOf(page)),
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: () => undefined,
  });
  expect(result.pages.map((page) => page.path)).toEqual(["/iron-forge", "/classes-2", "/membership-2"]);
  const settled = site.parts.header.at(-1)!;
  expect((settled.sections[0]!.children[1]!.children[0]!.props as { items: Array<{ href: string }> }).items.map((item) => item.href)).toEqual(["/iron-forge", "/classes-2", "/membership-2"]);
  expect((site.parts.footer.at(-1)!.sections[0]!.children[1]!.children[0]!.props as { items: Array<{ href: string }> }).items.map((item) => item.href)).toEqual(["/iron-forge", "/classes-2", "/membership-2"]);
});

test("Stop while the second page is written: the first stays, the third is never asked, and the frame is settled on the pages made", async () => {
  const site = fakeSite();
  const stop = new AbortController();
  const asked: string[] = [];
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => {
      asked.push(page.title);
      if (page.index === 1) {
        return async (written) => {
          written(planOf(page).slice(0, 60));
          stop.abort();
          throw new AssistantError("Stopped.", "stopped");
        };
      }
      return answered(planOf(page));
    },
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: () => undefined,
    signal: stop.signal,
  });
  expect(asked).toEqual(["Home", "Classes"]);
  expect(result.phase).toBe("stopped");
  expect(result.pages.map((page) => page.state)).toEqual(["done", "stopped", "stopped"]);
  const settled = site.parts.header.at(-1)!;
  expect((settled.sections[0]!.children[1]!.children[0]!.props as { items: Array<{ label: string }> }).items.map((item) => item.label)).toEqual(["Home", "Classes"]);
});

test("Stop while the header's first save is on its way: that save lands, then the header is put back as it was, said; the footer is never saved, no page is made, and no part is the new site's", async () => {
  const stop = new AbortController();
  const site = fakeSite({ onSave: (kind) => kind === "header" && stop.abort() });
  const asked: string[] = [];
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => {
      asked.push(page.title);
      return answered(linkedPlan(page));
    },
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: () => undefined,
    signal: stop.signal,
  });
  expect(result.phase).toBe("stopped");
  // Saved, the draft it replaced kept; then put back, the run's own header not kept.
  expect(site.calls).toEqual(["style", `header, “${BEFORE_NEW_SITE}” kept`, "header"]);
  expect(site.drafts).toEqual(ORIGINAL);
  expect(site.versions).toEqual({ header: [ORIGINAL.header], footer: [] });
  expect(asked).toEqual([]);
  expect(result.steps).toEqual({ direction: "done", style: "done", header: "done", footer: "stopped" });
  expect(result.frame).toEqual({ header: "back", footer: null });
  expect(result.pages.map((page) => [page.state, page.id])).toEqual([["stopped", null], ["stopped", null], ["stopped", null]]);
  expect(result.notes).toContain("Put the header back as it was: no page of the new site was made.");
});

test("the header's first save kept but its answer lost, not to be told, then Stop: counted as saved all the same, it is put back as it was, said", async () => {
  const stop = new AbortController();
  const site = fakeSite({ onSave: (kind) => kind === "header" && stop.abort(), losing: [1] });
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => answered(linkedPlan(page)),
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: () => undefined,
    signal: stop.signal,
  });
  expect(result.phase).toBe("stopped");
  // Saved (unknown to the run), then put back over the run's own header.
  expect(site.calls).toEqual(["style", `header, “${BEFORE_NEW_SITE}” kept`, "header"]);
  expect(site.drafts).toEqual(ORIGINAL);
  expect(result.frame).toEqual({ header: "back", footer: null });
  expect(result.steps).toMatchObject({ header: "done", footer: "stopped" });
  expect(result.notes).toEqual([
    "The new header may have been saved: no answer came about the header's save, and its draft could not be read back to tell whether it was kept.",
    "Put the header back as it was: no page of the new site was made.",
  ]);
});

test("the header's first save kept but its answer lost, then Stop, and putting it back fails too: the header is one to check, said, which the drawer offers no Publish all for", async () => {
  const stop = new AbortController();
  const site = fakeSite({ onSave: (kind) => kind === "header" && stop.abort(), losing: [1], failing: [2] });
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => answered(linkedPlan(page)),
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: () => undefined,
    signal: stop.signal,
  });
  expect(site.calls).toEqual(["style", `header, “${BEFORE_NEW_SITE}” kept`, "header, not saved"]);
  // The new header is there still, leading to pages never made: marked, and said.
  expect(menuOf(site.drafts.header)).toEqual(["/iron-forge", "/classes", "/membership"]);
  expect(result.frame).toEqual({ header: "stale", footer: null });
  expect(result.steps.header).toBe("failed");
  expect(result.notes).toContain(`The new header was not put back as it was: the storage did not answer. It may lead to pages that were not made; its versions hold the one it replaced, as “${BEFORE_NEW_SITE}”.`);
});

test("the header's first save kept but its answer lost, the pages then made: the clean-up saves it again, though nothing in it changed, made sure of, said", async () => {
  const site = fakeSite({ losing: [1] });
  // Pages with no form: the header the pages settle on is the one first saved.
  const plain = (page: SitePagePlan) => answered(JSON.stringify({ title: page.title, description: "", sections: [band("Opening", "", [{ kind: "heading", level: 1, text: page.title, display: true }])] }));
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: plain,
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: () => undefined,
  });
  expect(result.phase).toBe("done");
  expect(site.calls.filter((call) => call.startsWith("header"))).toEqual([`header, “${BEFORE_NEW_SITE}” kept`, "header"]);
  expect(site.parts.header[1]).toEqual(site.parts.header[0]);
  expect(result.frame).toEqual({ header: "new", footer: "new" });
  expect(result.steps.header).toBe("done");
  expect(result.notes).toContain("Made sure of the new header once the pages were made: it is saved.");
});

test("Stop between two pages: the frame leads only to the page made, and that page's buttons to the pages never made lose their links, a plan's too, each said", async () => {
  const stop = new AbortController();
  const site = fakeSite();
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => answered(linkedPlan(page)),
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: (writing) => {
      if (writing.pages[0]?.state === "done" && !stop.signal.aborted) stop.abort();
    },
    signal: stop.signal,
  });
  expect(result.phase).toBe("stopped");
  expect(result.pages.map((page) => page.state)).toEqual(["done", "stopped", "stopped"]);
  expect(site.calls).toEqual(["style", `header, “${BEFORE_NEW_SITE}” kept`, `footer, “${BEFORE_NEW_SITE}” kept`, "page /iron-forge", "header", "footer", "change /iron-forge"]);
  expect(menuOf(site.drafts.header)).toEqual(["/iron-forge"]);
  expect(menuOf(site.drafts.footer)).toEqual(["/iron-forge"]);
  expect(site.drafts.header.sections[0]!.children[2]!.children[0]!.props).toEqual({ label: "Book a free session", href: "/iron-forge#join" });
  expect(result.frame).toEqual({ header: "new", footer: "new" });
  expect(buttonsOf(pageAt(site, "iron-forge"))).toEqual(["Classes #", "Membership #", "Monthly: Join #"]);
  expect(result.notes).toEqual(expect.arrayContaining([
    "“Home”: Took the link out of the button “Classes”: the page it led to, /classes, was not made.",
    "“Home”: Took the link out of the button “Membership”: the page it led to, /membership, was not made.",
    "“Home”: Took the link out of the button “Join” of the plan “Monthly”: the page it led to, /membership, was not made.",
  ]));
  expect(result.pages[0]!.dangling).toBe(false);
});

test("a run whose every page is refused: none is made, the header and the footer are put back as they were, each said; the style stays", async () => {
  const site = fakeSite();
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: () => async () => {
      throw new AssistantError("Anthropic refused the request.", "other");
    },
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: () => undefined,
  });
  expect(result.phase).toBe("done");
  expect(result.pages.map((page) => [page.state, page.id])).toEqual([["failed", null], ["failed", null], ["failed", null]]);
  expect(site.calls).toEqual(["style", `header, “${BEFORE_NEW_SITE}” kept`, `footer, “${BEFORE_NEW_SITE}” kept`, "header", "footer"]);
  expect(site.drafts).toEqual(ORIGINAL);
  expect(result.frame).toEqual({ header: "back", footer: "back" });
  expect(result.steps.style).toBe("done");
  expect(result.notes).toEqual(expect.arrayContaining([
    "The page “Home” was not written: Anthropic refused the request.",
    "Put the header back as it was: no page of the new site was made.",
    "Put the footer back as it was: no page of the new site was made.",
  ]));
});

test("once the run ends, a button of a page made that leads to a page not made loses its link, and one to a page made at another address leads there, each said; a page whose change is not saved is marked, and said", async () => {
  const refuse = (page: SitePagePlan) => (page.index === 1 ? async () => {
    throw new AssistantError("Anthropic refused the request.", "other");
  } : answered(linkedPlan(page)));
  const site = fakeSite({ madeElsewhere: "membership" });
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: refuse,
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: () => undefined,
  });
  expect(result.phase).toBe("done");
  expect(result.pages.map((page) => [page.path, page.state])).toEqual([["/iron-forge", "done"], ["/classes", "failed"], ["/membership-2", "done"]]);
  expect(buttonsOf(pageAt(site, "iron-forge"))).toEqual(["Classes #", "Membership /membership-2", "Monthly: Join /membership-2"]);
  expect(buttonsOf(pageAt(site, "membership-2"))).toEqual(["Home /iron-forge", "Classes #", "Monthly: Join #"]);
  expect(menuOf(site.drafts.header)).toEqual(["/iron-forge", "/membership-2"]);
  expect(result.notes).toEqual(expect.arrayContaining([
    "“Home”: Took the link out of the button “Classes”: the page it led to, /classes, was not made.",
    "“Home”: Led the button “Membership” to /membership-2, where its page was made, in place of /membership.",
    "“Home”: Led the button “Join” of the plan “Monthly” to /membership-2, where its page was made, in place of /membership.",
    "“Membership”: Took the link out of the button “Classes”: the page it led to, /classes, was not made.",
    "“Membership”: Took the link out of the button “Join” of the plan “Monthly”: the page it led to, /classes, was not made.",
  ]));
  expect(result.pages.map((page) => page.dangling)).toEqual([false, false, false]);

  // The storage does not take the home page's change: its links stay, said, and it is marked.
  const refusing = fakeSite({ refuseChange: "iron-forge" });
  const held = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: refuse,
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: refusing.hooks,
    newId,
    tell: () => undefined,
  });
  expect(buttonsOf(pageAt(refusing, "iron-forge"))).toEqual(["Classes /classes", "Membership /membership", "Monthly: Join /membership"]);
  expect(held.pages.map((page) => page.dangling)).toEqual([true, false, false]);
  expect(held.notes).toContain("“Home”: Its buttons that lead to pages not made keep their links, as the change was not saved: the storage did not answer.");
});

test("another page opened by the person between two pages stops the site there, said; nothing is asked after", async () => {
  const site = fakeSite();
  const asked: string[] = [];
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => {
      asked.push(page.title);
      return answered(planOf(page));
    },
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    // The person goes elsewhere the moment the first page is written.
    tell: (writing) => {
      if (writing.pages[0]?.state === "done") site.leave();
    },
  });
  expect(asked).toEqual(["Home"]);
  expect(result.phase).toBe("stopped");
  expect(result.error).toBe(LEFT_SITE);
  expect(result.pages.map((page) => page.state)).toEqual(["done", "stopped", "stopped"]);
  // The frame settled all the same, on the page made, and its button to a page not made gone.
  expect(menuOf(site.drafts.header)).toEqual(["/iron-forge"]);
  expect(result.notes).toContain("“Home”: Took the link out of the button “Classes”: the page it led to, /classes, was not made.");
});

test("another page opened while the next page's plan comes: it is not made, and the site stops there, said", async () => {
  const site = fakeSite();
  const result = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => async (written) => {
      if (page.index === 1) site.leave();
      return answered(planOf(page))(written);
    },
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: site.hooks,
    newId,
    tell: () => undefined,
  });
  expect(site.calls.filter((call) => call.startsWith("page"))).toEqual(["page /iron-forge"]);
  expect([result.phase, result.error]).toEqual(["stopped", LEFT_SITE]);
  expect(result.pages.map((page) => page.state)).toEqual(["done", "failed", "stopped"]);
});

test("a page the model refuses is said and the next one written; a key no longer accepted, or forgotten, stops the site, its frame settled on the page made", async () => {
  const refusing = fakeSite();
  const once = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => (page.index === 1 ? async () => { throw new AssistantError("Anthropic refused the request.", "other"); } : answered(planOf(page))),
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: refusing.hooks,
    newId,
    tell: () => undefined,
  });
  expect(once.phase).toBe("done");
  expect(once.pages.map((page) => page.state)).toEqual(["done", "failed", "done"]);
  expect(once.notes).toContain("The page “Classes” was not written: Anthropic refused the request.");

  const keyless = fakeSite();
  const halted = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => (page.index === 1 ? async () => { throw new AssistantError("Anthropic did not accept this key.", "key"); } : answered(planOf(page))),
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: keyless.hooks,
    newId,
    tell: () => undefined,
  });
  expect(halted.phase).toBe("failed");
  expect(halted.error).toBe("Anthropic did not accept this key.");
  expect(halted.pages.map((page) => page.state)).toEqual(["done", "failed", "stopped"]);
  expect(menuOf(keyless.drafts.header)).toEqual(["/iron-forge"]);
  expect(buttonsOf(pageAt(keyless, "iron-forge")).slice(0, 1)).toEqual(["Classes #"]);

  // A key forgotten while the run goes: what was asked with it is refused the same way.
  const forgotten = fakeSite();
  const gone = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: (page) => (page.index === 1 ? async () => { throw new AssistantError(KEY_GONE, "key"); } : answered(planOf(page))),
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: forgotten.hooks,
    newId,
    tell: () => undefined,
  });
  expect([gone.phase, gone.error]).toEqual(["failed", KEY_GONE]);
  expect(menuOf(forgotten.drafts.header)).toEqual(["/iron-forge"]);
  expect(gone.notes).toContain("“Home”: Took the link out of the button “Classes”: the page it led to, /classes, was not made.");
});

test("a direction that is none changes nothing; a style the storage refuses stops the site before its frame", async () => {
  const none = fakeSite();
  const failed = await writeSite({
    askDirection: () => answered(JSON.stringify({ ...DIRECTION, pages: [] }))(() => undefined),
    askPage: () => answered("{}"),
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: none.hooks,
    newId,
    tell: () => undefined,
  });
  expect([failed.phase, failed.error]).toEqual(["failed", "The direction named no page for the site."]);
  expect(failed.steps).toEqual({ direction: "failed", style: "stopped", header: "stopped", footer: "stopped" });
  expect(none.calls).toEqual([]);
  // What asking used is said all the same.
  expect(failed.tally).toEqual(TALLY);

  const refused = fakeSite({ style: "a tone is not one of the choices" });
  const styled = await writeSite({
    askDirection: () => answered(JSON.stringify(DIRECTION))(() => undefined),
    askPage: () => answered("{}"),
    style: STYLE,
    facts: { media: [], brief: "A gym." },
    hooks: refused.hooks,
    newId,
    tell: () => undefined,
  });
  expect([styled.phase, styled.error]).toEqual(["failed", "The new style was not kept: a tone is not one of the choices"]);
  expect(refused.calls).toEqual(["style"]);
  expect(styled.before).toBeNull();
});
