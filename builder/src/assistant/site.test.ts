// A new site from a brief (./site.ts), on fakes of the test's own: an
// editor whose pages are real editor stores, opened one at a time, and a
// storage that keeps the style and the parts. The direction first; the
// style it gives, the old one kept; the header and the footer, the drafts
// they replace kept as versions; then the pages, one after the other, each
// asked with the direction and the site's pages, their pictures through
// one queue, two at a time, within one budget shared among the pages; the
// frame settled at the end on the pages made, its call to action leading
// to the home page's form. A stop, another page opened, a refused key end
// it; a page the model refused is said and the next written; a direction
// that is none, or a style the storage refuses, change nothing more.
import { expect, test } from "vitest";
import type { Made } from "../document/commands.ts";
import type { PageDocument } from "../shared/document.ts";
import { defaultSiteStyle, siteStyleChoices } from "../shared/site-tokens.ts";
import type { PartKind } from "../storage/adapter.ts";
import { createEditorStore, type EditorStore } from "../store/editor-store.ts";
import type { PictureAsk } from "./build.ts";
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

const answered = (text: string) => async (written: (piece: string) => void): Promise<Answer & { tally?: Tally }> => {
  written(text);
  await Promise.resolve();
  return { text, usage: USED, tally: TALLY };
};

// The editor and the storage, faked: pages made at an address, opened one
// at a time, the person on a page of their own (id 1) to begin with.
function fakeSite(options: { taken?: string[]; madeElsewhere?: string; style?: string | null } = {}) {
  const pages = new Map<number, { slug: string; store: EditorStore }>();
  let open = 1;
  let next = 100;
  const calls: string[] = [];
  const parts: Record<PartKind, PageDocument[]> = { header: [], footer: [] };
  const styles: unknown[] = [];
  const hooks: SiteHooks = {
    async applyStyle(style) {
      calls.push("style");
      styles.push(style);
      return options.style ?? null;
    },
    async savePart(kind, document, keep) {
      calls.push(keep === null ? kind : `${kind}, “${keep}” kept`);
      parts[kind].push(document);
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
  return { hooks, calls, parts, styles, pages, leave: () => (open = -1) };
}

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

test("a page the model refuses is said and the next one written; a key no longer accepted stops the site", async () => {
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
