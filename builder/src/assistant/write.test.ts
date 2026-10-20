// A page written from a brief (./write.ts), on a real editor store and an
// answer of the test's own that comes in pieces: the page is made from the
// plan's title, each section goes in as a command of the Assistant's, a
// button whose section never came goes (a plan's loses its link), and a
// stop, a failure or another page opened midway keep what is in and add
// nothing more. What the answer used, priced, is said at the end, an
// answer cut short's too. Pictures made for the page: asked for as their
// sections land, two at once, into the library, then onto the page as
// steps of their own; one that fails leaves its section as it was, a
// refused key asks for no more, and a stop stops those being made. Another
// page opened, or the run's key gone, stops those in flight at once and
// asks for none of the rest; what was not made is said.
import { expect, test } from "vitest";
import type { Made } from "../document/commands.ts";
import { createEditorStore, type EditorStore } from "../store/editor-store.ts";
import type { PageDocument } from "../shared/document.ts";
import type { PictureAsk } from "./build.ts";
import { AssistantError, type Answer, type Usage } from "./providers.ts";
import { photoTallyOf, tallyOf, type Tally } from "./tally.ts";
import { PAGE_WATCH_MS, PictureError, PICTURES_AT_ONCE, writePage, type PageHooks, type PictureMaker, type Writing } from "./write.ts";

const USED: Usage = { input: 10, cacheRead: 0, cacheWrite: 0, output: 20 };
const TALLY = tallyOf("anthropic", "claude-opus-5-5", USED);

const FACTS = { media: [], paths: ["/"], brief: "An open day." };

const words = (text: string) => ({ kind: "text", paragraphs: [text] });
const section = (label: string, blocks: unknown[], anchor = "") => ({ label, anchor, background: "none", widths: "equal", columns: [{ align: "left", blocks }] });
const PLAN = {
  title: "Open day",
  description: "Swim with us on 12 April.",
  sections: [
    section("Hero", [{ kind: "heading", level: 1, text: "Open day", display: true }, { kind: "button", label: "Book", target: "#join" }, { kind: "button", label: "Prices", target: "#prices" }]),
    section("Empty", [{ kind: "image", mediaId: "none", alt: "" }]),
    section("Join", [words("Write to us.")], "join"),
  ],
};

function editor(opened = true) {
  let store: EditorStore | null = null;
  let still = true;
  const titles: string[] = [];
  const hooks: PageHooks = {
    open: async (title) => {
      titles.push(title);
      if (!opened) return "The page could not be made.";
      const doc: PageDocument = { schemaVersion: 1, title, sections: [] };
      store = createEditorStore({ document: doc, now: () => 0 });
      return null;
    },
    still: () => still,
    document: () => store!.getState().document,
    apply: (made: Made) => {
      if (!made.ok) return made.error.message;
      const outcome = store!.getState().dispatch(made.command);
      return outcome.ok ? null : outcome.error.message;
    },
  };
  return { hooks, titles, page: () => store, leave: () => (still = false) };
}

let ids = 0;
const newId = () => `x${++ids}`;

// An answer that writes `text` in pieces of `size`, then ends as asked.
function answer(text: string, size = 7, end: (written: number) => (Answer & { tally?: Tally }) | Error = () => ({ text, usage: USED, tally: TALLY }), between?: (at: number) => void) {
  return async (written: (piece: string) => void): Promise<Answer & { tally?: Tally }> => {
    let at = 0;
    for (; at < text.length; at += size) {
      written(text.slice(at, at + size));
      between?.(at);
      await Promise.resolve();
    }
    const ending = end(at);
    if (ending instanceof Error) throw ending;
    return ending;
  };
}

test("the page is made from the plan's title; each section goes in as the Assistant's own step; a button whose section never came goes", async () => {
  const { hooks, titles, page } = editor();
  const told: Writing["phase"][] = [];
  const result = await writePage({ ask: answer(JSON.stringify(PLAN)), facts: FACTS, newId, hooks, tell: (writing) => told.push(writing.phase) });
  expect(titles).toEqual(["Open day"]);
  const state = page()!.getState();
  expect(state.document.description).toBe("Swim with us on 12 April.");
  expect(state.document.sections.map((s) => s.props.label)).toEqual(["Hero", "Join"]);
  expect(state.document.sections[0]!.children[0]!.children.map((b) => b.props)).toEqual([
    { level: 1, text: "Open day" },
    { label: "Book", href: "#join" },
  ]);
  expect(state.past.map((entry) => entry.command.label)).toEqual([
    "Assistant changed the page description",
    "Assistant added section Hero",
    "Assistant added section Join",
    "Assistant deleted Button in Hero",
  ]);
  expect(result).toEqual({
    phase: "done",
    title: "Open day",
    sections: [{ label: "Hero", kept: true }, { label: "Empty", kept: false }, { label: "Join", kept: true }],
    pictures: [],
    notes: [
      "Left out an image that is not in the site's library.",
      "Left out the section “Empty”: nothing in it could be kept.",
      "Took out the button “Prices”: the section it leads to was not written.",
    ],
    tally: TALLY,
    error: null,
  });
  expect(told[0]).toBe("asking");
  expect(told).toContain("writing");
  expect(told.at(-1)).toBe("done");
});

test("stopped while writing: the sections that had come stay, nothing more is asked", async () => {
  const { hooks, page } = editor();
  const text = JSON.stringify(PLAN);
  const cut = text.indexOf("\"label\":\"Join\"");
  const result = await writePage({
    ask: answer(text.slice(0, cut), 7, () => new AssistantError("Stopped.", "stopped")),
    facts: FACTS, newId, hooks, tell: () => undefined,
  });
  expect(result.phase).toBe("stopped");
  expect(result.error).toBeNull();
  // Stopped before its end, the provider never said what it used.
  expect(result.tally).toBeNull();
  expect(page()!.getState().document.sections.map((s) => s.props.label)).toEqual(["Hero"]);
});

test("an answer cut short says what it used all the same; an answer with no tally, as a sample's, says none", async () => {
  const text = JSON.stringify(PLAN);
  const cut = await writePage({
    ask: answer(text.slice(0, 40), 7, () => new AssistantError("The answer was longer than the Assistant allows, and was cut. Ask for less.", "cut", USED, TALLY)),
    facts: FACTS, newId, hooks: editor().hooks, tell: () => undefined,
  });
  expect(cut).toMatchObject({ phase: "failed", error: "The answer was longer than the Assistant allows, and was cut. Ask for less.", tally: TALLY });
  const sample = await writePage({ ask: answer(text, 7, () => ({ text, usage: USED })), facts: FACTS, newId, hooks: editor().hooks, tell: () => undefined });
  expect(sample).toMatchObject({ phase: "done", tally: null });
});

test("refused before a word: no page is made, and the reason is said", async () => {
  const { hooks, titles } = editor();
  const result = await writePage({
    ask: async () => {
      throw new AssistantError("Anthropic did not accept this key.", "key");
    },
    facts: FACTS, newId, hooks, tell: () => undefined,
  });
  expect(titles).toEqual([]);
  expect(result).toMatchObject({ phase: "failed", error: "Anthropic did not accept this key.", sections: [] });
});

test("another page opened midway: nothing more lands, on it or anywhere", async () => {
  const { hooks, page, leave } = editor();
  const text = JSON.stringify(PLAN);
  const result = await writePage({
    // Once Hero is on the page, as a person would open another page.
    ask: answer(text, 7, undefined, () => {
      if ((page()?.getState().document.sections.length ?? 0) >= 1) leave();
    }),
    facts: FACTS, newId, hooks, tell: () => undefined,
  });
  expect(result.phase).toBe("failed");
  expect(result.error).toBe("Another page was opened: the Assistant stopped writing to this one.");
  expect(page()!.getState().document.sections.map((s) => s.props.label)).toEqual(["Hero"]);
});

test("a page that cannot be made: nothing is written, and the reason is said", async () => {
  const { hooks } = editor(false);
  const result = await writePage({ ask: answer(JSON.stringify(PLAN)), facts: FACTS, newId, hooks, tell: () => undefined });
  expect(result).toMatchObject({ phase: "failed", error: "The page could not be made.", title: null });
});

test("an answer that ends before it is whole: what came is on the page, and it is said", async () => {
  const { hooks, page } = editor();
  const text = JSON.stringify(PLAN);
  const result = await writePage({ ask: answer(text.slice(0, text.lastIndexOf("]"))), facts: FACTS, newId, hooks, tell: () => undefined });
  expect(result.phase).toBe("done");
  expect(result.notes).toContain("The answer ended before it was whole: what came is on the page.");
  expect(page()!.getState().document.sections).toHaveLength(2);
});

test("stopped while the new page is still being made: the sections that had come wait no longer, and none lands", async () => {
  const { hooks, page } = editor();
  let opened: () => void = () => undefined;
  const slow: PageHooks = { ...hooks, open: (title) => new Promise((done) => (opened = () => void hooks.open(title).then(done))) };
  const stop = new AbortController();
  const text = JSON.stringify(PLAN);
  const result = writePage({
    // Every section comes, then the answer waits until it is stopped.
    ask: async (written) => {
      written(text);
      await new Promise((done) => stop.signal.addEventListener("abort", done));
      throw new AssistantError("Stopped.", "stopped");
    },
    facts: FACTS, newId, hooks: slow, tell: () => undefined, signal: stop.signal,
  });
  await new Promise((done) => setTimeout(done, 0));
  stop.abort();
  opened();
  expect((await result).phase).toBe("stopped");
  expect(page()!.getState().document.sections).toEqual([]);
});

test("stats, steps and pricing stream in like the others; a plan's button whose section never came keeps its plan and loses its link, as the Assistant's step", async () => {
  const { hooks, page } = editor();
  const plan = (name: string, target: string) => ({ name, price: "€20", period: "a month", text: "", features: ["Two swims a week"], buttonLabel: "Join", buttonTarget: target, featured: false, badge: "" });
  const text = JSON.stringify({
    title: "Membership",
    description: "",
    sections: [
      section("Club", [
        { kind: "heading", level: 1, text: "Membership", display: true },
        { kind: "stats", figures: [{ value: "120", label: "Members" }] },
        { kind: "steps", steps: [{ title: "Come along", text: "Any Saturday." }, { title: "Join", text: "If it suits you." }] },
        { kind: "pricing", plans: [plan("Swimmer", "#join"), plan("Family", "#welcome")] },
      ]),
      section("Welcome", [words("Come along on Saturday.")], "welcome"),
    ],
  });
  const result = await writePage({ ask: answer(text, 5), facts: FACTS, newId, hooks, tell: () => undefined });
  const state = page()!.getState();
  const club = state.document.sections[0]!.children[0]!.children;
  expect(club.map((block) => block.type)).toEqual(["heading", "stats", "steps", "pricing"]);
  expect(club[3]!.props).toMatchObject({ plans: [{ name: "Swimmer", button: { label: "Join", href: "#" } }, { name: "Family", button: { label: "Join", href: "#welcome" } }] });
  expect(result).toMatchObject({ phase: "done", sections: [{ label: "Club", kept: true }, { label: "Welcome", kept: true }] });
  expect(result.notes).toEqual(["Took the link out of the button “Join” of the plan “Swimmer”: the section it leads to was not written."]);
  expect(state.past.map((entry) => entry.command.label)).toEqual([
    "Assistant added section Club",
    "Assistant added section Welcome",
    "Assistant changed plan 1 in Pricing in Club",
  ]);
});

// ------------------------------------------------------- pictures made

// 50 words in and 1,372 out on gpt-image-2: 50 × $5 + 1,372 × $30 a million tokens.
const PHOTO_TALLY = photoTallyOf("gpt-image-2", { textInput: 50, imageInput: 0, output: 1372 });
const MADE_FACTS = { ...FACTS, made: true };

// A picture maker of the test's own: each picture made after a turn, or,
// held, when the test lets it go, by what it shows, made or failing.
function maker(options: { hold?: boolean } = {}) {
  const asked: PictureAsk[] = [];
  const held = new Map<string, (error?: Error) => void>();
  let atOnce = 0;
  let most = 0;
  const made: PictureMaker = {
    kind: "photo",
    async make(ask, signal) {
      asked.push(ask);
      atOnce += 1;
      most = Math.max(most, atOnce);
      try {
        if (options.hold) {
          await new Promise<void>((done, fail) => {
            held.set(ask.prompt, (error) => (error ? fail(error) : done()));
            signal.addEventListener("abort", () => fail(new AssistantError("Stopped.", "stopped")));
          });
        } else {
          await new Promise((done) => setTimeout(done, 1));
        }
        return { blob: new Blob(["picture"]), type: "image/webp", width: 1536, height: 1024, tally: PHOTO_TALLY };
      } finally {
        atOnce -= 1;
        held.delete(ask.prompt);
      }
    },
  };
  return {
    made, asked, most: () => most,
    waiting: () => [...held.keys()],
    release: (prompt: string, error?: Error) => held.get(prompt)!(error),
  };
}

// The library a picture goes into: each upload, and its id; one refused,
// held, or failing in a way of its own.
function library(options: { refuse?: string; hold?: boolean; fail?: boolean } = {}) {
  const uploads: Array<{ name: string; type: string; width: number; height: number; alt: string }> = [];
  const releases: Array<() => void> = [];
  const upload: NonNullable<PageHooks["upload"]> = async (file, picture) => {
    uploads.push({ name: file.name, type: file.type, ...picture });
    if (options.hold) await new Promise<void>((done) => releases.push(done));
    if (options.fail) throw new Error("the storage broke");
    if (options.refuse) return { ok: false, reason: options.refuse };
    return { ok: true, mediaId: `m-${uploads.length}` };
  };
  return { upload, uploads, release: () => releases.shift()?.() };
}

const madePicture = (prompt: string, more: Record<string, unknown> = {}) => ({ source: "made", prompt, alt: `${prompt}, close`, shape: "landscape", veil: "dark", strength: "strong", focus: "center", ...more });
const madeImage = (prompt: string, alt = "") => ({ kind: "image", source: "made", prompt, alt, shape: "square" });
const PICTURED = {
  title: "Gym",
  description: "",
  sections: [
    { ...section("Hero", [{ kind: "heading", level: 1, text: "Train with us", display: true }]), picture: madePicture("A gym at dawn") },
    { label: "Cards", anchor: "", background: "none", widths: "equal", columns: [
      { align: "left", blocks: [madeImage("Free weights", "Free weights on a rack"), { kind: "heading", level: 2, text: "Strength", display: false }] },
      { align: "left", blocks: [{ kind: "heading", level: 2, text: "Cardio", display: false }, madeImage("Rowers"), madeImage("Bikes")] },
    ] },
  ],
};

test("pictures made for the page: each asked for once its section is in, two at once at most, into the library with its alt text, then onto its section or into its column as a step of its own", async () => {
  const { hooks, page } = editor();
  const pictures = maker();
  const kept = library();
  const told: Writing[] = [];
  const result = await writePage({
    ask: answer(JSON.stringify(PICTURED)), facts: MADE_FACTS, newId, hooks: { ...hooks, upload: kept.upload }, tell: (writing) => told.push(writing), pictures: pictures.made,
  });
  expect(result.phase).toBe("done");
  expect(result.notes).toEqual([]);
  expect(pictures.asked.map((ask) => ask.prompt)).toEqual(["A gym at dawn", "Free weights", "Rowers", "Bikes"]);
  expect(pictures.most()).toBe(PICTURES_AT_ONCE);
  // Into the library, named after the page and what each shows, with its alt text.
  expect(kept.uploads).toEqual([
    { name: "gym-a-gym-at-dawn-close.webp", type: "image/webp", width: 1536, height: 1024, alt: "A gym at dawn, close" },
    { name: "gym-free-weights-on-a-rack.webp", type: "image/webp", width: 1536, height: 1024, alt: "Free weights on a rack" },
    { name: "gym-rowers.webp", type: "image/webp", width: 1536, height: 1024, alt: "" },
    { name: "gym-bikes.webp", type: "image/webp", width: 1536, height: 1024, alt: "" },
  ]);
  const state = page()!.getState();
  const [hero, cards] = state.document.sections;
  // Behind the opening, under the veil it came with.
  expect(hero!.props.picture).toEqual({ mediaId: "m-1" });
  expect(hero!.style.base).toMatchObject({ veil: "dark", veilStrength: "strong" });
  // In the cards' columns, where the plan put them, each in turn.
  expect(cards!.children.map((column) => column.children.map((block) => block.type === "image" ? block.props : block.type))).toEqual([
    [{ mediaId: "m-2", alt: "Free weights on a rack" }, "heading"],
    ["heading", { mediaId: "m-3", decorative: true }, { mediaId: "m-4", decorative: true }],
  ]);
  // Each a step of the Assistant's, after its section's.
  const labels = state.past.map((entry) => entry.command.label);
  expect(labels.slice(0, 2)).toEqual(["Assistant added section Hero", "Assistant added section Cards"]);
  expect(labels.filter((label) => label.includes("picture") || label.includes("Image")).toSorted()).toEqual([
    "Assistant added Image to Column 1 in Cards", "Assistant added Image to Column 2 in Cards", "Assistant added Image to Column 2 in Cards", "Assistant set a picture behind Hero",
  ]);
  // Said as they go: waiting, being made, into the library, in, each with what it used.
  expect(result.pictures).toEqual([
    { section: 0, behind: true, kind: "photo", state: "placed", tally: PHOTO_TALLY },
    { section: 1, behind: false, kind: "photo", state: "placed", tally: PHOTO_TALLY },
    { section: 1, behind: false, kind: "photo", state: "placed", tally: PHOTO_TALLY },
    { section: 1, behind: false, kind: "photo", state: "placed", tally: PHOTO_TALLY },
  ]);
  const states = told.map((writing) => writing.pictures[0]?.state).filter((state) => state !== undefined);
  expect([...new Set(states)]).toEqual(["waiting", "making", "placing", "placed"]);
  expect(told.some((writing) => writing.phase === "pictures")).toBe(true);
});

test("a picture that fails leaves its section as it was, said; a refusal of the key asks for no more; one the library refuses is said too", async () => {
  const { hooks, page } = editor();
  const pictures = maker({ hold: true });
  const writing = writePage({ ask: answer(JSON.stringify(PICTURED)), facts: MADE_FACTS, newId, hooks: { ...hooks, upload: library().upload }, tell: () => undefined, pictures: pictures.made });
  // Two at once: the opening's and the first card's; the first card's is not clean.
  await expect.poll(() => pictures.waiting()).toEqual(["A gym at dawn", "Free weights"]);
  pictures.release("Free weights", new PictureError("it was not clean: it holds a script element.", PHOTO_TALLY));
  // The next takes its place, and the key is refused for it: the last is not asked for.
  await expect.poll(() => pictures.waiting()).toEqual(["A gym at dawn", "Rowers"]);
  pictures.release("Rowers", new AssistantError("OpenAI does not let this key do this.", "key"));
  await expect.poll(() => pictures.waiting()).toEqual(["A gym at dawn"]);
  pictures.release("A gym at dawn");
  const result = await writing;
  expect(result.phase).toBe("done");
  const [hero, cards] = page()!.getState().document.sections;
  expect(hero!.props.picture).toEqual({ mediaId: "m-1" });
  // The cards' columns as they went in: no image, nothing broken.
  expect(cards!.children.map((column) => column.children.map((block) => block.type))).toEqual([["heading"], ["heading"]]);
  expect(result.notes).toEqual([
    "Left out the photo for an image in the section “Cards”: it was not clean: it holds a script element.",
    "Left out the photo for an image in the section “Cards”: OpenAI does not let this key do this.",
    "Asked for no more pictures: the same would come again.",
  ]);
  expect(pictures.asked.map((ask) => ask.prompt)).toEqual(["A gym at dawn", "Free weights", "Rowers"]);
  expect(result.pictures.map((one) => [one.state, one.tally])).toEqual([["placed", PHOTO_TALLY], ["failed", PHOTO_TALLY], ["failed", null], ["failed", null]]);

  const refused = editor();
  const said = await writePage({
    ask: answer(JSON.stringify({ ...PICTURED, sections: [PICTURED.sections[0]] })), facts: MADE_FACTS, newId, hooks: { ...refused.hooks, upload: library({ refuse: "the CMS refused it: it takes images up to 10 MB." }).upload }, tell: () => undefined, pictures: maker().made,
  });
  expect(refused.page()!.getState().document.sections[0]!.props.picture).toBeUndefined();
  expect(said.notes).toEqual(["Left out the photo behind the section “Hero”: the CMS refused it: it takes images up to 10 MB."]);
  // A library that fails in a way of its own fails the picture, not the page.
  const broken = editor();
  const failed = await writePage({
    ask: answer(JSON.stringify({ ...PICTURED, sections: [PICTURED.sections[0]] })), facts: MADE_FACTS, newId, hooks: { ...broken.hooks, upload: library({ fail: true }).upload }, tell: () => undefined, pictures: maker().made,
  });
  expect(failed).toMatchObject({ phase: "done", pictures: [{ state: "failed" }], notes: ["Left out the photo behind the section “Hero”: it could not be kept: the storage broke"] });
});

test("stopped while pictures are made: those still being made stop, and nothing more lands; one already made goes into the library only, said", async () => {
  const { hooks, page } = editor();
  const pictures = maker({ hold: true });
  const kept = library({ hold: true });
  const stop = new AbortController();
  const result = writePage({ ask: answer(JSON.stringify(PICTURED)), facts: MADE_FACTS, newId, hooks: { ...hooks, upload: kept.upload }, tell: () => undefined, pictures: pictures.made, signal: stop.signal });
  // Two being made at once; the opening's is made, and on its way into the library.
  await expect.poll(() => pictures.waiting()).toEqual(["A gym at dawn", "Free weights"]);
  pictures.release("A gym at dawn");
  await expect.poll(() => kept.uploads.length).toBe(1);
  stop.abort();
  kept.release();
  const written = await result;
  expect(written.phase).toBe("stopped");
  expect(page()!.getState().document.sections.map((s) => s.props.picture)).toEqual([undefined, undefined]);
  expect(page()!.getState().past.map((entry) => entry.command.label)).toEqual(["Assistant added section Hero", "Assistant added section Cards"]);
  expect(written.pictures.map((one) => one.state)).toEqual(["stopped", "stopped", "stopped", "stopped"]);
  expect(written.notes).toEqual([
    "Put the photo behind the section “Hero” in the library only: the writing stopped before it went on the page.",
    "Did not make 3 pictures still to come: the writing was stopped.",
  ]);
  // The two not yet begun were never asked for.
  expect(pictures.asked.map((ask) => ask.prompt)).toEqual(["A gym at dawn", "Free weights"]);
});

test("another page opened while pictures wait their turn: after two fail, the others are never asked for, the run is not written, and what was not made is said", async () => {
  const { hooks, page, leave } = editor();
  const pictures = maker({ hold: true });
  const result = writePage({ ask: answer(JSON.stringify(PICTURED)), facts: MADE_FACTS, newId, hooks: { ...hooks, upload: library().upload }, tell: () => undefined, pictures: pictures.made });
  await expect.poll(() => pictures.waiting()).toEqual(["A gym at dawn", "Free weights"]);
  // The person opens another page; the two being made fail, the provider busy.
  leave();
  pictures.release("A gym at dawn", new AssistantError("OpenAI is busy just now. Try again in a minute.", "busy"));
  pictures.release("Free weights", new AssistantError("OpenAI is busy just now. Try again in a minute.", "busy"));
  const written = await result;
  expect(pictures.asked.map((ask) => ask.prompt)).toEqual(["A gym at dawn", "Free weights"]);
  expect(written).toMatchObject({ phase: "failed", error: "Another page was opened: the Assistant stopped writing to this one." });
  expect(written.pictures.map((one) => one.state)).toEqual(["failed", "failed", "stopped", "stopped"]);
  expect(written.notes).toEqual([
    "Left out the photo behind the section “Hero”: OpenAI is busy just now. Try again in a minute.",
    "Left out the photo for an image in the section “Cards”: OpenAI is busy just now. Try again in a minute.",
    "Did not make 2 pictures still to come: another page was opened.",
  ]);
  expect(page()!.getState().document.sections.flatMap((s) => s.children.flatMap((c) => c.children)).filter((b) => b.type === "image")).toEqual([]);
});

test("the page left the moment a picture lands: the next is not asked for, the page looked at before each request", async () => {
  const { hooks, leave } = editor();
  const pictures = maker();
  // The person opens another page just as the first picture is put in.
  const apply: PageHooks["apply"] = (made, options) => {
    const refused = hooks.apply(made, options);
    if (options?.quiet) leave();
    return refused;
  };
  const written = await writePage({ ask: answer(JSON.stringify(PICTURED)), facts: MADE_FACTS, newId, hooks: { ...hooks, apply, upload: library().upload }, tell: () => undefined, pictures: pictures.made });
  expect(pictures.asked.map((ask) => ask.prompt)).toEqual(["A gym at dawn", "Free weights"]);
  expect(written.pictures.map((one) => one.state)).toEqual(["placed", "stopped", "stopped", "stopped"]);
  expect(written.notes).toEqual([
    "Put the photo for an image in the section “Cards” in the library only: the writing stopped before it went on the page.",
    "Did not make 2 pictures still to come: another page was opened.",
  ]);
  expect(written.error).toBe("Another page was opened: the Assistant stopped writing to this one.");
});

// Two pictures, both made at once, none waiting its turn: a failure is
// then the only thing to pass a page left on before the next look at it.
const TWO = JSON.stringify({ ...PICTURED, sections: [PICTURED.sections[0], { ...PICTURED.sections[1], columns: [PICTURED.sections[1]!.columns[0]] }] });

test("a picture the library refuses after the page was left passes it on at once: the one still in flight is aborted then, not at the next look", async () => {
  const { hooks, leave } = editor();
  const pictures = maker({ hold: true });
  const result = writePage({ ask: answer(TWO), facts: MADE_FACTS, newId, hooks: { ...hooks, upload: library({ refuse: "the CMS refused it: it is too large." }).upload }, tell: () => undefined, pictures: pictures.made });
  await expect.poll(() => pictures.waiting()).toEqual(["A gym at dawn", "Free weights"]);
  leave();
  pictures.release("A gym at dawn");
  // Well before the page is looked at again (PAGE_WATCH_MS), the other is stopped.
  await expect.poll(() => pictures.waiting(), { timeout: PAGE_WATCH_MS / 2, interval: 5 }).toEqual([]);
  const written = await result;
  expect(written.notes).toEqual(["Left out the photo behind the section “Hero”: the CMS refused it: it is too large.", "Did not make one picture still to come: another page was opened."]);
});

test("a picture that fails after the page was left passes it on at once: the one still in flight is aborted then, not at the next look", async () => {
  const { hooks, leave } = editor();
  const pictures = maker({ hold: true });
  const result = writePage({ ask: answer(TWO), facts: MADE_FACTS, newId, hooks: { ...hooks, upload: library().upload }, tell: () => undefined, pictures: pictures.made });
  await expect.poll(() => pictures.waiting()).toEqual(["A gym at dawn", "Free weights"]);
  leave();
  pictures.release("A gym at dawn", new AssistantError("OpenAI is busy just now. Try again in a minute.", "busy"));
  await expect.poll(() => pictures.waiting(), { timeout: PAGE_WATCH_MS / 2, interval: 5 }).toEqual([]);
  const written = await result;
  expect(written.pictures.map((one) => one.state)).toEqual(["failed", "stopped"]);
  expect(written.notes).toEqual(["Left out the photo behind the section “Hero”: OpenAI is busy just now. Try again in a minute.", "Did not make one picture still to come: another page was opened."]);
});

test("another page opened while pictures are in flight: they are stopped at once, failing or not, and nothing more is asked", async () => {
  const { hooks, leave } = editor();
  const pictures = maker({ hold: true });
  const result = writePage({ ask: answer(JSON.stringify(PICTURED)), facts: MADE_FACTS, newId, hooks: { ...hooks, upload: library().upload }, tell: () => undefined, pictures: pictures.made });
  await expect.poll(() => pictures.waiting()).toEqual(["A gym at dawn", "Free weights"]);
  leave();
  // Nothing is let go: the page is looked at, and what is in flight is aborted.
  const written = await result;
  expect(pictures.asked).toHaveLength(2);
  expect(written.pictures.map((one) => one.state)).toEqual(["stopped", "stopped", "stopped", "stopped"]);
  expect(written.notes).toEqual(["Did not make 4 pictures still to come: another page was opened."]);
  expect(written.error).toBe("Another page was opened: the Assistant stopped writing to this one.");
});

test("the key a run began with forgotten or replaced: its pictures in flight stop, the rest are never asked, the page stays written, and what was not made is said", async () => {
  const { hooks, page } = editor();
  const pictures = maker({ hold: true });
  const gone = new AbortController();
  const result = writePage({ ask: answer(JSON.stringify(PICTURED)), facts: MADE_FACTS, newId, hooks: { ...hooks, upload: library().upload }, tell: () => undefined, pictures: { ...pictures.made, gone: gone.signal } });
  await expect.poll(() => pictures.waiting()).toEqual(["A gym at dawn", "Free weights"]);
  gone.abort();
  const written = await result;
  expect(pictures.asked).toHaveLength(2);
  expect(written).toMatchObject({ phase: "done", error: null });
  expect(written.pictures.map((one) => one.state)).toEqual(["stopped", "stopped", "stopped", "stopped"]);
  expect(written.notes).toEqual(["Did not make 4 pictures still to come: the key they were to be made with is no longer kept."]);
  expect(page()!.getState().document.sections.map((s) => s.props.label)).toEqual(["Hero", "Cards"]);
});

test("another page opened while a picture is made: it goes into the library, and nothing lands on either page", async () => {
  const { hooks, page, leave } = editor();
  const pictures = maker({ hold: true });
  const result = writePage({ ask: answer(JSON.stringify({ ...PICTURED, sections: [PICTURED.sections[0]] })), facts: MADE_FACTS, newId, hooks: { ...hooks, upload: library().upload }, tell: () => undefined, pictures: pictures.made });
  await expect.poll(() => pictures.waiting()).toEqual(["A gym at dawn"]);
  leave();
  pictures.release("A gym at dawn");
  const written = await result;
  expect(written).toMatchObject({ phase: "failed", error: "Another page was opened: the Assistant stopped writing to this one." });
  expect(page()!.getState().document.sections[0]!.props.picture).toBeUndefined();
  expect(written.notes).toEqual(["Put the photo behind the section “Hero” in the library only: the writing stopped before it went on the page."]);
});

test("with no picture maker, or no library to put pictures in, the plan's pictures are left out, said", async () => {
  const plan = JSON.stringify({ ...PICTURED, sections: [PICTURED.sections[0]] });
  const none = await writePage({ ask: answer(plan), facts: MADE_FACTS, newId, hooks: { ...editor().hooks, upload: library().upload }, tell: () => undefined });
  const noLibrary = await writePage({ ask: answer(plan), facts: MADE_FACTS, newId, hooks: editor().hooks, tell: () => undefined, pictures: maker().made });
  for (const written of [none, noLibrary]) {
    expect(written.pictures).toEqual([]);
    expect(written.notes).toEqual(["Left out the picture of the section “Hero”: no picture is made for this page."]);
  }
});

test("an answer that fails after a button's section was named but never written: the button still goes, as at a whole answer's end", async () => {
  const { hooks, page } = editor();
  const text = JSON.stringify(PLAN);
  // Hero, whose Book button leads to #join, comes; then the provider fails.
  const cut = text.indexOf("\"label\":\"Empty\"");
  const result = await writePage({
    ask: answer(text.slice(0, cut), 7, () => new AssistantError("Anthropic is busy just now. Try again in a minute.", "busy")),
    facts: FACTS, newId, hooks, tell: () => undefined,
  });
  expect(result.phase).toBe("failed");
  const hero = page()!.getState().document.sections[0]!.children[0]!.children;
  expect(hero.map((block) => block.type)).toEqual(["heading"]);
  expect(result.notes).toEqual([
    "Took out the button “Book”: the section it leads to was not written.",
    "Took out the button “Prices”: the section it leads to was not written.",
  ]);
});
