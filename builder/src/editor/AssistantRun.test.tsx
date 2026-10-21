// The Assistant's run window (./AssistantRun.tsx), drawn with its drawer on
// providers of the test's own and a storage that keeps the pages written
// aside: it opens as each run begins, a page's, a new site's once asked
// twice, the sample's, its title the run's phase and its status line the one
// live region; closing it or its Stop key while the run goes asks first,
// Keep writing going on and giving the focus back, Stop from its close
// stopping the run and closing it, from its Stop key stopping it and
// staying; once the run is over it says how it ended, Done closes it, Open
// the page opens the page written and closes it, and nothing is asked. Its
// meter says what the run has cost so far, then in all; its preview draws
// the page as its sections land, not to be edited, and at a new site's end
// its home page, with a switch for each page it made. How far a run has
// come, for its bar.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { asideStorage } from "../../test/aside-storage.ts";
import { editorKit } from "../../test/editor-kit.tsx";
import type { ShownSite, ShownWriting } from "../assistant/context.tsx";
import { AssistantError, type Answer, type ModelChoice, type ProviderClient, type Usage } from "../assistant/providers.ts";
import type { SiteStyle } from "../storage/adapter.ts";
import { AssistantPanel } from "./AssistantPanel.tsx";
import { AssistantRun, progressOf } from "./AssistantRun.tsx";

const words = (text: string) => ({ kind: "text", paragraphs: [text] });
const PLAN = JSON.stringify({
  title: "Open day",
  description: "",
  sections: [
    { label: "Hero", anchor: "", background: "none", picture: { source: "none" }, motion: "none", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: "Open day at the slipway", display: true }] }] },
    { label: "Book", anchor: "", background: "soft", picture: { source: "none" }, motion: "none", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "heading", level: 2, text: "Book a place", display: false }, words("Saturday, from 8.")] }] },
  ],
});
// Where the second section begins: what comes before it holds the first one whole.
const FIRST = PLAN.indexOf("{\"label\":\"Book\"");

// 3,144 tokens in, 1,024 of them read from the cache, and 1,415 out.
const USED: Usage = { input: 2120, cacheRead: 1024, cacheWrite: 0, output: 1415 };
const KIT_DOC = { schemaVersion: 1 as const, title: "Start", sections: [] };

// A provider whose answer comes when the test lets it: written in pieces,
// ended, or stopped with the run.
function holding(models: ModelChoice[] = [{ id: "gpt-6.1-sol", name: "gpt-6.1-sol" }]) {
  const held = { write: (_piece: string): void => undefined, end: (): void => undefined };
  const client: ProviderClient = {
    models: async () => models,
    ask: (_key, _question, written, signal) => new Promise<Answer>((done, fail) => {
      held.write = written;
      held.end = () => done({ text: PLAN, usage: USED });
      signal?.addEventListener("abort", () => fail(new AssistantError("Stopped.", "stopped")));
    }),
  };
  return { held, client };
}

function setUp(client: ProviderClient, session: Parameters<typeof editorKit>[0]["session"] = {}) {
  const kept = asideStorage({ first: 20 });
  const openPage = vi.fn(async () => null);
  const kit = editorKit({ document: KIT_DOC, session: { ...kept.session, openPage, ...session }, providers: async () => client });
  kit.render(<><AssistantPanel /><AssistantRun /></>);
  return { kit, kept, openPage };
}

const turn = () => act(async () => {
  await new Promise((done) => setTimeout(done, 10));
});

async function writeAPage(kit: ReturnType<typeof editorKit>) {
  await act(async () => {
    await kit.assistant.getState().connect("openai", "sk-not-a-real-key");
  });
  fireEvent.change(screen.getByLabelText("What is the page for?"), { target: { value: "An open day at the club." } });
  fireEvent.click(screen.getByRole("button", { name: "Write the page" }));
  await turn();
}

const run = () => screen.getByRole("dialog", { name: /^(Asking|Writing|Making pictures|Written|Stopped|Not written)/ });
const asked = () => screen.queryByRole("alertdialog", { name: "Stop the Assistant?" });

test("the run window opens as a page's run begins, its title the run's phase, its status line the one live region; the drawer's says nothing meanwhile, and speaks again once it closes", async () => {
  const { held, client } = holding();
  const { kit } = setUp(client);
  expect(screen.queryByRole("dialog")).toBeNull();
  await writeAPage(kit);
  expect(screen.getByRole("dialog", { name: "Asking" })).toBeTruthy();
  expect(screen.getAllByRole("status").map((status) => status.textContent)).toEqual(["Asking gpt-6.1-sol…"]);
  expect(within(run()).getByRole("status")).toBeTruthy();
  await act(async () => {
    held.write(PLAN.slice(0, FIRST));
    await new Promise((done) => setTimeout(done, 10));
  });
  expect(screen.getByRole("dialog", { name: "Writing" })).toBeTruthy();
  expect(within(run()).getByRole("status").textContent).toBe("Writing “Open day”: 1 section so far.");
  // Its steps, as the drawer's.
  expect(within(run()).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Hero"]);
  await act(async () => {
    held.write(PLAN.slice(FIRST));
    held.end();
    await new Promise((done) => setTimeout(done, 10));
  });
  expect(screen.getByRole("dialog", { name: "Written" })).toBeTruthy();
  expect(screen.getAllByRole("status").map((status) => status.textContent)).toEqual(["2 sections on “Open day”, saved as its draft."]);
  fireEvent.click(within(run()).getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getAllByRole("status").map((status) => status.textContent)).toEqual(["2 sections on “Open day”, saved as its draft."]);
  expect(document.querySelector(".as-progress")!.contains(screen.getByRole("status"))).toBe(true);
});

test("it opens for the sample too, and for a new site once its Write is asked twice", async () => {
  const sample = setUp(holding().client);
  fireEvent.click(screen.getByRole("button", { name: "Build the sample page" }));
  await turn();
  expect(screen.getByRole("dialog", { name: "Asking · sample" })).toBeTruthy();
  sample.kit.assistant.getState().stop();
  await act(async () => {
    await sample.kit.clock.advance(100);
  });
  expect(screen.getByRole("dialog", { name: "Stopped · sample" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  sample.kit.assistant.getState().setRunWindow(false);
});

test("a new site's window, once asked twice", async () => {
  const site = holding([{ id: "claude-opus-5-5", name: "Claude Opus 5.5" }]);
  const { kit } = setUp(site.client);
  kit.ui.getState().setSiteStyle(STYLE_NOW);
  await act(async () => {
    await kit.assistant.getState().connect("anthropic", "sk-ant-not-a-real-key");
  });
  fireEvent.click(screen.getByRole("radio", { name: "A new site" }));
  fireEvent.change(screen.getByLabelText("What is the site for?"), { target: { value: "A gym." } });
  fireEvent.click(screen.getByRole("button", { name: "Write the new site" }));
  // Asked once: no window yet.
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(within(screen.getByRole("group", { name: "Write the new site" })).getByRole("button", { name: "Write the new site" }));
  await turn();
  expect(screen.getByRole("dialog", { name: "Asking for a direction · new site" })).toBeTruthy();
  expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toBe("Asking Claude Opus 5.5 for the site's direction…");
  kit.assistant.getState().stop();
  await turn();
});

test("closing it while the run goes asks first: its close key, Esc and the scrim; Keep writing goes on, Esc is it, and the focus goes back; Stop stops the run and closes the window", async () => {
  const { held, client } = holding();
  const { kit } = setUp(client);
  await writeAPage(kit);
  await act(async () => {
    held.write(PLAN.slice(0, FIRST));
    await new Promise((done) => setTimeout(done, 10));
  });
  const close = within(run()).getByRole("button", { name: "Close" });
  close.focus();
  fireEvent.click(close);
  const question = asked()!;
  expect(question.textContent).toContain("What was made stays, as the page's draft. Nothing else is written. The window closes.");
  // The safe answer has the focus, and goes on.
  expect(document.activeElement).toBe(within(question).getByRole("button", { name: "Keep writing" }));
  fireEvent.click(within(question).getByRole("button", { name: "Keep writing" }));
  expect(asked()).toBeNull();
  expect(document.activeElement).toBe(close);
  expect(kit.assistant.getState().running?.signal.aborted).toBe(false);
  // Esc asks; Esc again is Keep writing.
  fireEvent.keyDown(run(), { key: "Escape" });
  expect(asked()).not.toBeNull();
  fireEvent.keyDown(asked()!, { key: "Escape" });
  expect(asked()).toBeNull();
  expect(kit.assistant.getState().running?.signal.aborted).toBe(false);
  // The scrim asks too; Stop stops the run and closes the window.
  fireEvent.click(document.querySelector(".scrim")!);
  fireEvent.click(within(asked()!).getByRole("button", { name: "Stop" }));
  await turn();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(kit.assistant.getState().writing?.phase).toBe("stopped");
  // The drawer's summary is there, and speaks.
  expect(screen.getByRole("status").textContent).toBe("Stopped. The 1 section on “Open day” stay, saved as its draft.");
});

test("its Stop key asks too: Stop stops the run and the window stays, to say what stays and what it cost; closing it then asks nothing", async () => {
  const { held, client } = holding();
  const { kit } = setUp(client);
  await writeAPage(kit);
  await act(async () => {
    held.write(PLAN.slice(0, FIRST));
    await new Promise((done) => setTimeout(done, 10));
  });
  const stop = within(run()).getByRole("button", { name: "Stop" });
  stop.focus();
  fireEvent.click(stop);
  expect(asked()!.textContent).not.toContain("The window closes.");
  fireEvent.click(within(asked()!).getByRole("button", { name: "Keep writing" }));
  expect(document.activeElement).toBe(stop);
  fireEvent.click(stop);
  fireEvent.click(within(asked()!).getByRole("button", { name: "Stop" }));
  await turn();
  expect(screen.getByRole("dialog", { name: "Stopped" })).toBeTruthy();
  expect(within(run()).getByRole("status").textContent).toBe("Stopped. The 1 section on “Open day” stay, saved as its draft.");
  // Its tokens are not known: the request was stopped.
  expect(within(run()).getByText("Its tokens are not known: the provider counts them when a request ends, and this one was stopped.")).toBeTruthy();
  expect(within(run()).getByText("1 request ended before the provider counted it: what it cost, if anything, is not known.")).toBeTruthy();
  // Over: Esc closes it, asking nothing.
  fireEvent.keyDown(run(), { key: "Escape" });
  expect(asked()).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("once the run is over: Done closes it, Open the page opens the page written in the editor and closes it; Done alone when nothing was made", async () => {
  const { held, client } = holding();
  const { kit, openPage } = setUp(client);
  await writeAPage(kit);
  await act(async () => {
    held.write(PLAN);
    held.end();
    await new Promise((done) => setTimeout(done, 10));
  });
  const footer = run().querySelector(".dlg-foot")!;
  expect([...footer.querySelectorAll("button")].map((key) => key.textContent)).toEqual(["Done", "Open the page"]);
  // The focus on the key that opens what was made.
  expect(document.activeElement?.textContent).toBe("Open the page");
  fireEvent.click(within(run()).getByRole("button", { name: "Open the page" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(openPage).toHaveBeenCalledWith(20);
});

test("a run refused before a word made nothing: Done alone", async () => {
  const refused: ProviderClient = { models: holding().client.models, ask: async () => { throw new AssistantError("OpenAI did not accept this key.", "key"); } };
  const again = setUp(refused);
  await writeAPage(again.kit);
  const failed = screen.getByRole("dialog", { name: "Not written" });
  expect(within(failed).getByRole("status").textContent).toBe("OpenAI did not accept this key.");
  expect([...failed.querySelectorAll(".dlg-foot button")].map((key) => key.textContent)).toEqual(["Done"]);
  fireEvent.click(within(failed).getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(again.openPage).not.toHaveBeenCalled();
});

test("the meter: what it has cost so far, large, its tokens in and out, the model at its list price and the day the prices were read, a live estimate; once over, what it cost in all, in the drawer's own words", async () => {
  const { held, client } = holding();
  const { kit } = setUp(client);
  await writeAPage(kit);
  const meter = () => within(run()).getByRole("region", { name: "Cost" });
  expect(meter().querySelector(".ar-dollars")?.textContent).toMatch(/^≈ \$0\.\d{4}$/);
  expect(meter().querySelector(".ar-when")?.textContent).toBe("so far");
  expect([...meter().querySelectorAll(".ar-tokens dt")].map((term) => term.textContent)).toEqual(["Tokens in", "Tokens out"]);
  expect(meter().querySelector(".ar-price")?.textContent).toBe("gpt-6.1-sol: $2 in, $10 out per million tokens");
  expect(meter().querySelector(".ar-note")?.textContent).toBe("Prices of 20 Oct 2026 · live estimate, exact as each request ends");
  await act(async () => {
    held.write(PLAN);
    held.end();
    await new Promise((done) => setTimeout(done, 10));
  });
  // 2,120 × $2 + 1,024 × $0.10 + 1,415 × $10 a million tokens: $0.0184924.
  expect(meter().querySelector(".ar-dollars")?.textContent).toBe("≈ $0.0185");
  expect(meter().querySelector(".ar-when")?.textContent).toBe("in all");
  expect(meter().querySelector(".as-used")?.textContent).toBe("Used 3,144 tokens in, 1,024 of them cached, and 1,415 out, on your key.");
  expect(meter().querySelector(".as-cost")?.textContent).toBe("≈ $0.018 at gpt-6.1-sol's list price ($2 in, $0.10 cached, $10 out per million tokens; prices of 20 Oct 2026).");
  expect(meter().querySelector(".ar-note")?.textContent).toBe("An estimate from the providers' list prices. The provider's bill is what counts: taxes, discounts and regional uplift are not included.");
  expect(meter().querySelector(".ar-tokens")).toBeNull();
});

test("the sample's meter says nothing is spent, then that no model was asked", async () => {
  const { kit } = setUp(holding().client);
  fireEvent.click(screen.getByRole("button", { name: "Build the sample page" }));
  await act(async () => {
    await kit.clock.advance(300);
  });
  const meter = () => within(screen.getByRole("dialog")).getByRole("region", { name: "Cost" });
  expect([meter().querySelector(".ar-dollars")?.textContent, meter().querySelector(".ar-when")?.textContent]).toEqual(["$0.0000", "so far"]);
  expect(within(meter()).getByText("A sample written by hand: nothing is spent.")).toBeTruthy();
  await act(async () => {
    await kit.clock.advance(60_000);
  });
  expect(screen.getByRole("dialog", { name: "Written · sample" })).toBeTruthy();
  expect([meter().querySelector(".ar-dollars")?.textContent, meter().querySelector(".ar-when")?.textContent]).toEqual(["$0.0000", "in all"]);
  expect(within(meter()).getByText("A sample written by hand: no model was asked.")).toBeTruthy();
});

test("the preview draws the page as it is written, its sections as they land, not to be edited, and says in words what it shows", async () => {
  const { held, client } = holding();
  const { kit } = setUp(client);
  await writeAPage(kit);
  // No page yet.
  expect(within(run()).getByText("The page shows here as it is written.")).toBeTruthy();
  await act(async () => {
    held.write(PLAN.slice(0, FIRST));
    await new Promise((done) => setTimeout(done, 10));
    await kit.clock.advance(250);
  });
  const preview = () => within(run()).getByRole("region", { name: /^Preview of/ });
  expect(preview().getAttribute("aria-label") ?? within(run()).getByText(/^Preview of/).textContent).toBe("Preview of “Open day”, 1 section");
  const drawing = preview().querySelector(".ar-preview-page")!;
  expect([drawing.hasAttribute("inert"), drawing.getAttribute("aria-hidden")]).toEqual([true, "true"]);
  expect([...drawing.querySelectorAll(".sw-main > [data-block-type='section'] h1, .sw-main > [data-block-type='section'] h2")].map((heading) => heading.textContent)).toEqual(["Open day at the slipway"]);
  await act(async () => {
    held.write(PLAN.slice(FIRST));
    await new Promise((done) => setTimeout(done, 10));
    await kit.clock.advance(250);
  });
  expect(within(run()).getByText(/^Preview of/).textContent).toBe("Preview of “Open day”, 2 sections");
  expect([...preview().querySelectorAll(".sw-main > [data-block-type='section'] :is(h1, h2)")].map((heading) => heading.textContent)).toEqual(["Open day at the slipway", "Book a place"]);
  // The page open is as it was.
  expect(kit.doc()).toEqual(KIT_DOC);
});

const STYLE_NOW: SiteStyle = { palette: { text: "site-deep-water", background: "site-paper", primary: "site-signal", accent: "site-buoy", soft: "site-shallows", muted: "site-slate" }, typeScale: "balanced", letterWidth: "normal", customCss: "", updatedAt: null, kept: null, choices: { palette: Object.fromEntries(["text", "background", "primary", "accent", "soft", "muted"].map((slot) => [slot, []])), typeScales: [{ name: "balanced", label: "Balanced" }, { name: "strong", label: "Strong" }], letterWidths: [{ name: "normal", label: "Normal" }, { name: "wide", label: "Wide" }] } };

test("at a new site's end, the preview shows its home page, and a switch shows each page it made, from memory; Open the home page opens it", async () => {
  const DIRECTION = JSON.stringify({
    name: "Iron Forge", tagline: "Strength under one roof", voice: "Direct.",
    palette: { text: { hex: "#16181d", role: "" }, background: { hex: "#f7f5f0", role: "" }, primary: { hex: "#b3361b", role: "" }, accent: { hex: "#f2b33d", role: "" }, soft: { hex: "#ece6da", role: "" }, muted: { hex: "#5c5f66", role: "" } },
    typeScale: "strong", letterWidth: "wide", imagery: "Warm photos.", motion: "little", action: "Book a session",
    pages: [{ title: "Home", address: "iron-forge", purpose: "The gym." }, { title: "Classes", address: "classes", purpose: "Classes." }],
  });
  const plan = (title: string) => JSON.stringify({ title, description: "", sections: [{ label: "Opening", anchor: "", background: "none", picture: { source: "none" }, motion: "none", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: `${title} at Iron Forge`, display: true }] }] }] });
  const client: ProviderClient = {
    models: async () => [{ id: "claude-opus-5-5", name: "Claude Opus 5.5" }],
    ask: async (_key, question, written) => {
      const text = question.name === "site_direction" ? DIRECTION : plan(/This page: “([^”]+)”/.exec(question.system)?.[1] ?? "Page");
      written(text);
      return { text, usage: USED };
    },
  };
  const { kit, openPage } = setUp(client, {
    pages: [],
    parts: [],
    applySiteStyle: async () => null,
    replacePart: async (_kind, document) => ({ ok: true, replaced: document }),
    changeDraft: async () => null,
  });
  kit.ui.getState().setSiteStyle(STYLE_NOW);
  await act(async () => {
    await kit.assistant.getState().connect("anthropic", "sk-ant-not-a-real-key");
  });
  fireEvent.click(screen.getByRole("radio", { name: "A new site" }));
  fireEvent.click(screen.getByRole("switch", { name: "Draw illustrations for the site" }));
  fireEvent.change(screen.getByLabelText("What is the site for?"), { target: { value: "A gym." } });
  fireEvent.click(screen.getByRole("button", { name: "Write the new site" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Write the new site" })).getByRole("button", { name: "Write the new site" }));
  await act(async () => {
    await new Promise((done) => setTimeout(done, 50));
  });
  const dialog = screen.getByRole("dialog", { name: "Written · new site" });
  const pages = within(dialog).getByRole("radiogroup", { name: "Page shown" });
  expect(within(pages).getAllByRole("radio").map((radio) => [radio.textContent, radio.getAttribute("aria-checked")])).toEqual([["Home", "true"], ["Classes", "false"]]);
  const heading = () => dialog.querySelector(".ar-preview-page .sw-main h1")?.textContent;
  expect(heading()).toBe("Home at Iron Forge");
  fireEvent.click(within(pages).getByRole("radio", { name: "Classes" }));
  expect(heading()).toBe("Classes at Iron Forge");
  expect(within(dialog).getByText(/^Preview of/).textContent).toBe("Preview of “Classes”, 1 section");
  fireEvent.click(within(dialog).getByRole("button", { name: "Open the home page" }));
  expect(openPage).toHaveBeenCalledWith(20);
  expect(screen.queryByRole("dialog")).toBeNull();
  // The focus back where the window found it: the site's summary in the drawer, where the site began.
  await turn();
  expect(document.activeElement?.id).toBe("as_site_title");
});

test("how far a run has come: a new site's own four steps and its pages once its direction names them; a page's sections and pictures once its plan has said how many; not known before", () => {
  const page: ShownWriting = { phase: "writing", title: "Gym", sections: [{ label: "A", kept: true }], pictures: [], notes: [], tally: null, error: null };
  expect(progressOf(page, null)).toBeNull();
  expect(progressOf({ ...page, phase: "pictures", sections: [{ label: "A", kept: true }, { label: "B", kept: true }], pictures: [{ section: 0, behind: true, kind: "photo", state: "placed", tally: null }, { section: 1, behind: false, kind: "photo", state: "making", tally: null }] }, null)).toEqual({ value: 3, max: 4, words: "2 sections, and 1 of 2 pictures" });
  expect(progressOf({ ...page, phase: "done" }, null)).toMatchObject({ value: 1, max: 1 });
  const site: ShownSite = { phase: "asking", direction: null, steps: { direction: "doing", style: "waiting", header: "waiting", footer: "waiting" }, frame: { header: null, footer: null }, pages: [], notes: [], tally: null, error: null, before: null };
  expect(progressOf(null, site)).toBeNull();
  const going: ShownSite = {
    ...site, phase: "pages", direction: { name: "Iron Forge" } as ShownSite["direction"],
    steps: { direction: "done", style: "done", header: "done", footer: "failed" },
    pages: [{ title: "Home", path: "/home", state: "done", id: 1, writing: null, dangling: false }, { title: "Classes", path: "/classes", state: "writing", id: null, writing: null, dangling: false }],
  };
  expect(progressOf(null, going)).toEqual({ value: 5, max: 6, words: "5 of 6 steps: the site's own 4, then its 2 pages" });
});
