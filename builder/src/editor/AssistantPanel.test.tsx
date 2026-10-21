// The Assistant's drawer (./AssistantPanel.tsx) on a provider of the test's
// own: after a page, the tokens it used, in, cached and out, and what they
// come to at the model's list price, the price and the day it was read
// named; at the drawer's foot, the total of every request since the key was
// connected, with what an estimate leaves out, gone with the key. A model
// with no price on file is said to have none; a sample says no model was
// asked, and adds nothing. Where the provider is chosen, what each one
// does; with a key, the switch for pictures, and for photos the quality
// and its price per photo before anything is made; after a page with
// photos, each one's step with its cost, a line for the photos and the
// whole, and the total counting them. Two choices, a page or a new site,
// the new site said plainly first; what its pictures may cost at most said
// before it is written; its Write asked twice, Cancel asking nothing; its
// steps grouped by page, its cost after, then what becomes of it, each
// asked: the home page, Publish all, and the old style put back.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { describedText, editorKit } from "../../test/editor-kit.tsx";
import { AssistantError, type ModelChoice, type ProviderClient, type Usage } from "../assistant/providers.ts";
import type { SiteStyle } from "../storage/adapter.ts";
import { AssistantPanel } from "./AssistantPanel.tsx";
import { createMediaService, type MediaAdapter, type MediaService } from "./library/service.ts";
import type { UiStore } from "./ui-store.ts";

const PLAN = JSON.stringify({
  title: "Open day",
  description: "",
  sections: [{ label: "Hero", anchor: "", background: "none", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: "Open day at the slipway", display: true }] }] }],
});

// 3,144 tokens in, 1,024 of them read from the cache, and 1,415 out.
const USED: Usage = { input: 2120, cacheRead: 1024, cacheWrite: 0, output: 1415 };

function setUp(models: ModelChoice[] = [{ id: "gpt-6.1-sol", name: "gpt-6.1-sol" }]) {
  let pages = 0;
  const client: ProviderClient = {
    models: async () => models,
    ask: async (_key, _question, written) => {
      written(PLAN);
      return { text: PLAN, usage: USED };
    },
  };
  const kit = editorKit({
    document: { schemaVersion: 1, title: "Start", sections: [] },
    session: { makePage: async () => ({ ok: true, id: ++pages }), isOpen: (id) => id === pages },
    providers: async () => client,
  });
  kit.render(<AssistantPanel />);
  return kit;
}

const connect = async (kit: ReturnType<typeof editorKit>) => {
  await act(async () => {
    await kit.assistant.getState().connect("openai", "sk-not-a-real-key");
  });
};

async function writeThePage() {
  fireEvent.change(screen.getByLabelText("What is the page for?"), { target: { value: "An open day at the club." } });
  fireEvent.click(screen.getByRole("button", { name: "Write the page" }));
  await act(async () => {
    await new Promise((done) => setTimeout(done, 20));
  });
  expect(screen.getByRole("heading", { level: 3, name: "Written" })).toBeTruthy();
}

const foot = () => document.querySelector(".drawer-foot");

test("after a page: the tokens in, cached and out, then what they come to at the model's list price, the price used and the day it was read", async () => {
  const kit = setUp();
  await connect(kit);
  expect(foot()).toBeNull();
  await writeThePage();
  expect(screen.getByText("Used 3,144 tokens in, 1,024 of them cached, and 1,415 out, on your key.")).toBeTruthy();
  // 2,120 × $2 + 1,024 × $0.10 + 1,415 × $10 a million tokens: $0.0184924.
  expect(screen.getByText("≈ $0.018 at gpt-6.1-sol's list price ($2 in, $0.10 cached, $10 out per million tokens; prices of 20 Oct 2026).")).toBeTruthy();
});

test("the drawer's foot keeps the total since the key was connected, says it is an estimate, and goes with the key", async () => {
  const kit = setUp();
  await connect(kit);
  await writeThePage();
  expect(foot()?.textContent).toBe(
    "Since you connected this key: 1 request, 3,144 tokens in, 1,024 of them cached, and 1,415 out, ≈ $0.018."
    + "An estimate from the providers' list prices. The provider's bill is what counts: taxes, discounts and regional uplift are not included.",
  );
  await writeThePage();
  expect(foot()?.querySelector(".as-total")?.textContent).toBe("Since you connected this key: 2 requests, 6,288 tokens in, 2,048 of them cached, and 2,830 out, ≈ $0.037.");

  // Forgotten with the key: the page's own words stay, with what they leave out.
  fireEvent.click(screen.getByRole("button", { name: "Forget key" }));
  expect(kit.assistant.getState().spent).toEqual([]);
  expect(foot()?.querySelector(".as-total")).toBeNull();
  expect(foot()?.textContent).toBe("An estimate from the providers' list prices. The provider's bill is what counts: taxes, discounts and regional uplift are not included.");
  expect(screen.getByText("≈ $0.018 at gpt-6.1-sol's list price ($2 in, $0.10 cached, $10 out per million tokens; prices of 20 Oct 2026).")).toBeTruthy();
  // A new key starts its own total, with its first request.
  fireEvent.click(screen.getByRole("button", { name: "Clear this summary" }));
  expect(foot()).toBeNull();
  await connect(kit);
  expect(foot()).toBeNull();
  await writeThePage();
  expect(foot()?.querySelector(".as-total")?.textContent).toBe("Since you connected this key: 1 request, 3,144 tokens in, 1,024 of them cached, and 1,415 out, ≈ $0.018.");
});

test("a model with no list price on file is said to have none: only its tokens are shown, and counted", async () => {
  // A dated snapshot neither page prices by its id.
  const kit = setUp([{ id: "gpt-5-2025-08-07", name: "gpt-5-2025-08-07" }]);
  await connect(kit);
  await writeThePage();
  expect(screen.getByText("Used 3,144 tokens in, 1,024 of them cached, and 1,415 out, on your key.")).toBeTruthy();
  expect(screen.getByText("No list price on file for gpt-5-2025-08-07: only its tokens are shown.")).toBeTruthy();
  expect(foot()?.querySelector(".as-total")?.textContent).toBe("Since you connected this key: 1 request, 3,144 tokens in, 1,024 of them cached, and 1,415 out, with no list price on file.");
});

// ------------------------------------------------------------- pictures

const KIT_DOC = { schemaVersion: 1 as const, title: "Start", sections: [] };

test("where the provider is chosen, what each one does: OpenAI makes photos at a cost shown before, Anthropic draws illustrations as its models make no photos", () => {
  editorKit({ document: KIT_DOC }).render(<AssistantPanel />);
  const compare = document.querySelector("dl.as-compare")!;
  expect([...compare.querySelectorAll(":scope > div")].map((row) => [row.querySelector("dt")?.textContent, row.querySelector("dd")?.textContent, row.className])).toEqual([
    ["Anthropic", "Writes pages, and draws illustrations for them in the site's colours, as its models make no photos.", "as-compare-on"],
    ["OpenAI", "Writes pages, and makes photos for them, each at a cost shown before you write.", ""],
  ]);
  fireEvent.click(screen.getByRole("radio", { name: "OpenAI" }));
  expect(document.querySelector(".as-compare-on dt")?.textContent).toBe("OpenAI");
  expect(screen.getByRole("radiogroup", { name: "Provider" }).getAttribute("aria-describedby")).toBe(compare.id);
});

// A provider of the test's own, with photos where `imageModel` is given.
function picturing(plan: string, imageModel: string | null, made: { asked: unknown[] } = { asked: [] }): ProviderClient {
  return {
    models: async () => [{ id: "gpt-6.1-sol", name: "gpt-6.1-sol" }],
    ask: async (_key, _question, written) => {
      written(plan);
      return { text: plan, usage: USED };
    },
    photos: {
      model: async () => imageModel,
      async make(_key, ask) {
        made.asked.push(ask);
        // A WebP's first bytes; the browser's decoding is the test's own below.
        return { base64: "UklGRgAAAABXRUJQVlA4IA==", usage: { textInput: 50, imageInput: 0, output: 1372 } };
      },
    },
  };
}

// A library that takes every upload, each a new item.
function library(ui: UiStore): MediaService {
  let count = 0;
  const adapter: MediaAdapter = {
    capabilities: { publish: true, schedule: false, responses: false, imageVariants: false, livePages: true, collections: false, shop: false },
    listMedia: async () => [...ui.getState().media.values()],
    uploadMedia: async (upload) => ({ ok: true, value: { id: `made-${++count}`, alt: upload.alt ?? "", width: upload.width, height: upload.height, contentType: "image/webp", byteSize: upload.file.size, filename: upload.file.name, url: `/media/made-${count}.webp`, createdAt: "2026-10-20T08:00:00.000Z" } }),
    setMediaAlt: async () => ({ ok: false, problem: { kind: "invalid", code: "invalid_request", message: "no", errors: [] } }),
    deleteMedia: async () => ({ ok: true, value: null }),
  };
  return createMediaService({ adapter, ui });
}

test("with an OpenAI key that may use GPT Image 2: photos on, at medium, its price per photo said before; another quality, another price; switched off, none", async () => {
  const kit = editorKit({ document: KIT_DOC, media: library, providers: async () => picturing(PLAN, "gpt-image-2") });
  kit.render(<AssistantPanel />);
  await connect(kit);
  const toggle = screen.getByRole("switch", { name: "Make photos for the page" }) as HTMLInputElement;
  expect(toggle.checked).toBe(true);
  expect(describedText(toggle)).toBe("gpt-image-2 makes them where the page needs them, 5 at most, each kept in your library with its alt text.");
  const quality = screen.getByRole("radiogroup", { name: "Photo quality" });
  expect(within(quality).getByRole("radio", { name: "Medium" }).getAttribute("aria-checked")).toBe("true");
  expect(describedText(quality)).toBe("$0.041 a photo, landscape or portrait, $0.053 a square one, at gpt-image-2's price per image of 20 Oct 2026. Up to 5 on a page: $0.265 at most.");
  fireEvent.click(within(quality).getByRole("radio", { name: "High" }));
  expect(describedText(quality)).toBe("$0.165 a photo, landscape or portrait, $0.211 a square one, at gpt-image-2's price per image of 20 Oct 2026. Up to 5 on a page: $1.055 at most.");
  fireEvent.click(within(quality).getByRole("radio", { name: "Low" }));
  expect(describedText(quality)).toBe("$0.005 a photo, landscape or portrait, $0.006 a square one, at gpt-image-2's price per image of 20 Oct 2026. Up to 5 on a page: $0.03 at most.");
  fireEvent.click(toggle);
  expect(toggle.checked).toBe(false);
  expect(screen.queryByRole("radiogroup", { name: "Photo quality" })).toBeNull();
});

test("a model with no price per image on file says its cost comes after each photo; a key with no image model writes without photos, said", async () => {
  const later = editorKit({ document: KIT_DOC, media: library, providers: async () => picturing(PLAN, "gpt-image-2.5-flare") });
  const drawn = later.render(<AssistantPanel />);
  await connect(later);
  expect(describedText(screen.getByRole("radiogroup", { name: "Photo quality" }))).toBe("gpt-image-2.5-flare has no published price per image: each photo's cost is said once it is made, from the tokens it used.");
  drawn.unmount();
  const none = editorKit({ document: KIT_DOC, media: library, providers: async () => picturing(PLAN, null) });
  none.render(<AssistantPanel />);
  await connect(none);
  const toggle = screen.getByRole("switch", { name: "Make photos for the page" }) as HTMLInputElement;
  expect([toggle.checked, toggle.disabled]).toEqual([false, true]);
  expect(describedText(toggle)).toBe("This key may use no GPT Image model, so the page is written without photos.");
});

test("with an Anthropic key, the model chosen draws illustrations, its tokens counted with the page's", async () => {
  const writer: ProviderClient = { models: async () => [{ id: "claude-opus-5-5", name: "Claude Opus 5.5" }], ask: picturing(PLAN, null).ask };
  const kit = editorKit({ document: KIT_DOC, media: library, providers: async () => writer });
  kit.render(<AssistantPanel />);
  await act(async () => {
    await kit.assistant.getState().connect("anthropic", "sk-ant-not-a-real-key");
  });
  const toggle = screen.getByRole("switch", { name: "Draw illustrations for the page" }) as HTMLInputElement;
  expect(toggle.checked).toBe(true);
  expect(describedText(toggle)).toBe("Claude Opus 5.5 draws them in the site's colours where the page needs them, 5 at most, each kept in your library with its alt text. Each is a request of its own, its tokens counted with the page's.");
  expect(screen.queryByRole("radiogroup", { name: "Photo quality" })).toBeNull();
});

test("after a page with photos: each one's step in the list with its cost, then the page's words, a line for the photos and the whole; the total counts them", async () => {
  const photo = (prompt: string) => ({ kind: "image", source: "made", prompt, alt: `${prompt} at the gym`, shape: "square" });
  const plan = JSON.stringify({
    title: "Gym",
    description: "",
    sections: [{ label: "Cards", anchor: "", background: "none", picture: { source: "none" }, motion: "none", widths: "equal", columns: [
      { align: "left", blocks: [photo("Weights"), { kind: "heading", level: 1, text: "Strength", display: true }] },
      { align: "left", blocks: [photo("Rowers"), { kind: "heading", level: 2, text: "Cardio", display: false }] },
    ] }],
  });
  const made = { asked: [] as unknown[] };
  const kit = editorKit({
    document: KIT_DOC, media: library,
    session: { makePage: async () => ({ ok: true, id: 1 }), isOpen: (id) => id === 1 },
    providers: async () => picturing(plan, "gpt-image-2", made),
  });
  // The browser's decoding of a picture, as jsdom has none.
  vi.stubGlobal("createImageBitmap", async () => ({ width: 1024, height: 1024, close: () => undefined }));
  kit.render(<AssistantPanel />);
  await connect(kit);
  fireEvent.click(within(screen.getByRole("radiogroup", { name: "Photo quality" })).getByRole("radio", { name: "Low" }));
  fireEvent.change(screen.getByLabelText("What is the page for?"), { target: { value: "A gym." } });
  fireEvent.click(screen.getByRole("button", { name: "Write the page" }));
  await act(async () => {
    await new Promise((done) => setTimeout(done, 50));
  });
  vi.unstubAllGlobals();
  expect(made.asked).toMatchObject([{ quality: "low", size: "1024x1024" }, { quality: "low", size: "1024x1024" }]);
  expect(screen.getByRole("heading", { level: 3, name: "Written" })).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("1 section and 2 photos on “Gym”. Each is a step in History: undo takes them back one at a time.");
  expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Cards", "Photo in Cards, in, ≈ $0.041", "Photo in Cards, in, ≈ $0.041"]);
  expect(document.querySelector(".as-cost")?.textContent).toBe("≈ $0.018 at gpt-6.1-sol's list price ($2 in, $0.10 cached, $10 out per million tokens; prices of 20 Oct 2026).");
  expect(document.querySelector(".as-pictures-cost")?.textContent).toBe("2 photos, ≈ $0.083: 100 tokens in and 2,744 out, at gpt-image-2's list price ($5 in, $30 out per million tokens).");
  expect(document.querySelector(".as-all")?.textContent).toBe("In all, ≈ $0.10 for the page and its pictures.");
  expect(foot()?.querySelector(".as-total")?.textContent).toBe("Since you connected this key: 1 request and 2 photos, 3,244 tokens in, 1,024 of them cached, and 4,159 out, ≈ $0.10.");
  // Into the library, onto the page.
  expect([...kit.ui.getState().media.values()].map((item) => [item.filename, item.alt])).toEqual([["gym-rowers-at-the-gym.webp", "Rowers at the gym"], ["gym-weights-at-the-gym.webp", "Weights at the gym"]]);
  expect(kit.doc().sections[0]!.children.map((column) => column.children[0]!.props)).toEqual([{ mediaId: "made-1", alt: "Weights at the gym" }, { mediaId: "made-2", alt: "Rowers at the gym" }]);
  // Put in quietly: the selection is where the page's own steps left it, on its section.
  expect(kit.store.getState().selection).toBe(kit.doc().sections[0]!.id);
});

// ------------------------------------------------------------ a new site

const DIRECTION = JSON.stringify({
  name: "Iron Forge",
  tagline: "Strength under one roof",
  voice: "Direct.",
  palette: {
    text: { hex: "#16181d", role: "Words" }, background: { hex: "#f7f5f0", role: "Page" }, primary: { hex: "#b3361b", role: "Headings" },
    accent: { hex: "#f2b33d", role: "Buttons" }, soft: { hex: "#ece6da", role: "Bands" }, muted: { hex: "#5c5f66", role: "Captions" },
  },
  typeScale: "strong",
  letterWidth: "wide",
  imagery: "Warm photos.",
  motion: "little",
  action: "Book a session",
  pages: [{ title: "Home", address: "iron-forge", purpose: "The gym." }, { title: "Classes", address: "classes", purpose: "Classes." }, { title: "Join", address: "join", purpose: "Joining." }],
});

// A page's plan: its title as its heading, and the blocks after it.
const pagePlan = (title: string, after: unknown[] = []) => JSON.stringify({
  title, description: "", sections: [{ label: "Opening", anchor: "", background: "none", picture: { source: "none" }, motion: "none", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: title, display: true }, ...after] }] }],
});

// A provider that answers a direction, then each page's plan, its title
// read from the question; a plan that throws is a refusal.
function siteWriter(models: ModelChoice[] = [{ id: "claude-opus-5-5", name: "Claude Opus 5.5" }], asked: string[] = [], plan: (title: string) => string = (title) => pagePlan(title)): ProviderClient {
  return {
    models: async () => models,
    ask: async (_key, question, written) => {
      asked.push(question.name);
      const title = /This page: “([^”]+)”/.exec(question.system)?.[1] ?? "Page";
      const text = question.name === "site_direction" ? DIRECTION : plan(title);
      written(text);
      return { text, usage: USED };
    },
  };
}

// The editor's session for a new site: pages made one after the other,
// the style and the parts kept (a part's draft kept first unless it is the
// run's own), a page's change answered `changed`, what the person chooses
// after recorded. `parts` answers the parts' saves in turn: "lost", its
// answer lost and not to be told; "failed"; "saved", as every save is once
// it says no more.
function siteSession(kit: () => ReturnType<typeof editorKit>, calls: string[], changed: string | null = null, parts: Array<"lost" | "failed" | "saved"> = []) {
  let next = 10;
  let open = 1;
  return {
    pages: [{ id: 1, kind: "page" as const, title: "Slack Water", slug: "home", home: true, revision: 1, updatedAt: "2026-10-20T08:00:00.000Z", published: null, scheduled: null, links: { self: "", draft: "", versions: "", publish: "", schedules: "", preview: "", live: null } }],
    parts: [
      { id: 2, kind: "header" as const, title: "Header", slug: null, home: false, revision: 1, updatedAt: "2026-10-20T08:00:00.000Z", published: null, scheduled: null, links: { self: "", draft: "", versions: "", publish: "", schedules: "", preview: "", live: null } },
      { id: 3, kind: "footer" as const, title: "Footer", slug: null, home: false, revision: 1, updatedAt: "2026-10-20T08:00:00.000Z", published: null, scheduled: null, links: { self: "", draft: "", versions: "", publish: "", schedules: "", preview: "", live: null } },
    ],
    makePage: async (page: { title: string; slug: string }) => {
      calls.push(`make /${page.slug}`);
      open = next++;
      kit().store.getState().load({ schemaVersion: 1, title: page.title, sections: [] });
      return { ok: true as const, id: open };
    },
    isOpen: (id: number) => id === open,
    applySiteStyle: async (change: { kept?: string; palette: Record<string, string> }) => {
      calls.push(`style ${change.kept ?? ""} ${change.palette.primary}`);
      return null;
    },
    replacePart: async (kind: string, _document: unknown, keep: string, ours?: unknown, fence?: number | null) => {
      calls.push(`${kind}${ours ? "" : ` (${keep})`}${fence === null || fence === undefined ? "" : `, fenced at ${fence}`}`);
      const replaced = { schemaVersion: 1 as const, title: kind, sections: [] };
      const answer = parts.shift();
      if (answer === "lost") return { ok: false as const, unknown: true as const, why: `no answer came about the ${kind}'s save, and its draft could not be read back to tell whether it was kept.`, replaced, revision: 0 };
      if (answer === "failed") return { ok: false as const, why: "the storage did not answer." };
      return { ok: true as const, replaced };
    },
    changeDraft: async (id: number) => {
      calls.push(`change ${id}`);
      return changed;
    },
    setHome: async (id: number) => {
      calls.push(`home ${id}`);
      return null;
    },
    publishAll: async (ids: readonly number[]) => {
      calls.push(`publish ${ids.join(" ")}`);
      return ids.map((id) => ({ id, why: null }));
    },
  };
}

const STYLE_NOW: SiteStyle = { palette: { text: "site-deep-water", background: "site-paper", primary: "site-signal", accent: "site-buoy", soft: "site-shallows", muted: "site-slate" }, typeScale: "balanced", letterWidth: "normal", customCss: "", updatedAt: null, kept: null, choices: { palette: Object.fromEntries(["text", "background", "primary", "accent", "soft", "muted"].map((slot) => [slot, []])), typeScales: [{ name: "gentle", label: "Gentle" }, { name: "balanced", label: "Balanced" }, { name: "strong", label: "Strong" }], letterWidths: [{ name: "normal", label: "Normal" }, { name: "wide", label: "Wide" }] } };

test("two choices: a page for this site, as before, and a new site, said plainly before anything is asked", async () => {
  const kit = editorKit({ document: KIT_DOC, providers: async () => siteWriter() });
  kit.render(<AssistantPanel />);
  await act(async () => {
    await kit.assistant.getState().connect("anthropic", "sk-ant-not-a-real-key");
  });
  const what = screen.getByRole("radiogroup", { name: "What to write" });
  expect(within(what).getAllByRole("radio").map((radio) => [radio.textContent, radio.getAttribute("aria-checked")])).toEqual([["A page for this site", "true"], ["A new site", "false"]]);
  expect(screen.getByLabelText("What is the page for?")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Write the page" })).toBeTruthy();
  fireEvent.click(within(what).getByRole("radio", { name: "A new site" }));
  expect(describedText(what)).toBe("A new site:gives the site a new style, a new header and a new footer;adds 3 to 4 pages;keeps the pages already there.Its style takes the place of this one on every page at once, the published ones too, as a change in Site style does; Put the old style back returns it. The header, the footer and the new pages are drafts until you publish them, and your home page stays as it is until you choose.");
  expect(screen.getByLabelText("What is the site for?")).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Draw illustrations for the site" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Write the page" })).toBeNull();
  expect(screen.getByRole("button", { name: "Write the new site" })).toBeTruthy();
});

test("before a new site is written: what its pictures may cost at most, the site's budget at the quality chosen, and that its words cost a few cents, said exactly after", async () => {
  const kit = editorKit({ document: KIT_DOC, media: library, providers: async () => picturing(PLAN, "gpt-image-2") });
  kit.render(<AssistantPanel />);
  await connect(kit);
  fireEvent.click(screen.getByRole("radio", { name: "A new site" }));
  const quality = screen.getByRole("radiogroup", { name: "Photo quality" });
  const estimate = () => [...document.getElementById(quality.getAttribute("aria-describedby")!)!.querySelectorAll("p")].map((line) => line.textContent);
  // Medium: the square photo, $0.053, is the dearest; eight of them.
  expect(estimate()).toEqual([
    "Pictures: up to 8 photos for the whole site, $0.424 at most at medium quality (gpt-image-2's price per image of 20 Oct 2026, $0.053 at most a photo).",
    "The words, the direction and each page, cost a few cents with most models: their exact cost is said once the site is written, from the tokens the provider counts.",
  ]);
  fireEvent.click(within(quality).getByRole("radio", { name: "Low" }));
  expect(estimate()[0]).toBe("Pictures: up to 8 photos for the whole site, $0.048 at most at low quality (gpt-image-2's price per image of 20 Oct 2026, $0.006 at most a photo).");
  fireEvent.click(screen.getByRole("switch", { name: "Make photos for the site" }));
  expect(screen.getByText("Pictures: none is made; the library's are used where they fit.")).toBeTruthy();
});

test("Write the new site asks twice: Cancel asks nothing and gives the focus back; yes writes the site, its steps grouped by page, its cost, then what becomes of it, each asked", async () => {
  const calls: string[] = [];
  const asked: string[] = [];
  let kitRef: ReturnType<typeof editorKit> | null = null;
  const kit = editorKit({ document: KIT_DOC, session: siteSession(() => kitRef!, calls), providers: async () => siteWriter(undefined, asked) });
  kitRef = kit;
  kit.ui.getState().setSiteStyle(STYLE_NOW);
  kit.render(<AssistantPanel />);
  await act(async () => {
    await kit.assistant.getState().connect("anthropic", "sk-ant-not-a-real-key");
  });
  fireEvent.click(screen.getByRole("radio", { name: "A new site" }));
  fireEvent.click(screen.getByRole("switch", { name: "Draw illustrations for the site" }));
  // With no brief, it says so, and asks nothing.
  fireEvent.click(screen.getByRole("button", { name: "Write the new site" }));
  expect(screen.getByText("Say what the site is for first.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("What is the site for?"), { target: { value: "A modern fitness gym." } });
  fireEvent.click(screen.getByRole("button", { name: "Write the new site" }));
  const ask = screen.getByRole("group", { name: "Write the new site" });
  expect(ask.querySelector("p")?.textContent).toBe("Give the site a new style, header and footer, and add the new pages? The pages already there stay.");
  expect(document.activeElement?.textContent).toBe("Cancel");
  fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
  expect(asked).toEqual([]);
  expect(document.activeElement?.textContent).toBe("Write the new site");

  fireEvent.click(screen.getByRole("button", { name: "Write the new site" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Write the new site" })).getByRole("button", { name: "Write the new site" }));
  // Answered yes, the focus goes to the site's steps.
  expect(document.activeElement?.id).toBe("as_site_title");
  await act(async () => {
    await new Promise((done) => setTimeout(done, 50));
  });
  expect(asked).toEqual(["site_direction", "page_plan", "page_plan", "page_plan"]);
  expect(calls).toEqual(["style now #b3361b", "header (Before the new site)", "footer (Before the new site)", "make /iron-forge", "make /classes", "make /join"]);
  expect(screen.getByRole("heading", { level: 3, name: "Written · new site" })).toBeTruthy();
  expect(screen.getAllByRole("status")[0]!.textContent).toBe("“Iron Forge”: a new style, a new header and footer, and 3 pages. The header and footer it replaced are kept in their versions, as “Before the new site”.");
  // The steps, grouped: the site's own, then each page.
  expect([...document.querySelectorAll(".as-group-title")].map((title) => title.textContent)).toEqual(["The siteIron Forge", "Home/iron-forge, written", "Classes/classes, written", "Join/join, written"]);
  expect([...document.querySelectorAll(".as-group:first-child .as-sections > li")].map((li) => li.textContent)).toEqual(["Direction, 3 pages", "Style, applied", "Header, draft", "Footer, draft"]);
  expect(screen.getByRole("img", { name: /^The new palette: Text #16181d, Background #f7f5f0, Primary #b3361b/ })).toBeTruthy();
  // What it cost: four requests to one model, said once.
  expect(document.querySelector(".as-used")?.textContent).toBe("Used 12,576 tokens in, 4,096 of them cached, and 5,660 out, on your key.");
  expect(document.querySelector(".as-cost")?.textContent).toMatch(/^≈ \$0\.\d+ at Claude Opus 5\.5's list price/);

  // What becomes of it: the home page, asked.
  fireEvent.click(screen.getByRole("button", { name: "Make “Home” the home page" }));
  const home = screen.getByRole("group", { name: "Make “Home” the home page" });
  expect(home.querySelector("p")?.textContent).toBe("Make “Home” the home page? The site's address leads to it once it is published; “Slack Water” keeps its own address, /home.");
  fireEvent.click(within(home).getByRole("button", { name: "Make it the home page" }));
  await act(async () => {
    await new Promise((done) => setTimeout(done, 40));
  });
  expect(calls.at(-1)).toBe("home 10");
  expect(document.querySelector(".as-offer-said")?.textContent).toBe("“Home” is the home page: the site's address leads to it once it is published.");
  // The key is gone, and the focus is where what was done is said.
  expect(screen.queryByRole("button", { name: "Make “Home” the home page" })).toBeNull();
  expect(document.activeElement).toBe(document.querySelector(".as-offer-said"));
  // Publish all, asked: the three pages, the header and the footer.
  fireEvent.click(screen.getByRole("button", { name: "Publish all" }));
  const publish = screen.getByRole("group", { name: "Publish all" });
  expect(publish.querySelector("p")?.textContent).toBe("Publish the 3 new pages, the header and the footer? Visitors see them at once.");
  fireEvent.click(within(publish).getByRole("button", { name: "Publish all" }));
  await act(async () => {
    await new Promise((done) => setTimeout(done, 40));
  });
  expect(calls.at(-1)).toBe("publish 10 11 12 2 3");
  expect(document.querySelector(".as-offer-said")?.textContent).toBe("Published: the 3 new pages, the header and the footer. Visitors see them now.");
  // The old style back, in one click, from memory.
  fireEvent.click(screen.getByRole("button", { name: "Put the old style back" }));
  await act(async () => {
    await new Promise((done) => setTimeout(done, 40));
  });
  expect(calls.at(-1)).toBe("style none site-signal");
  expect(screen.queryByRole("button", { name: "Put the old style back" })).toBeNull();
  // Not the demo: no Start over.
  expect(screen.queryByRole("button", { name: "Start over with the example site" })).toBeNull();
});

// A new site written from the drawer, asked and answered yes, with no pictures.
async function writeNewSite(plan: (title: string) => string, changed: string | null = null, parts: Array<"lost" | "failed" | "saved"> = []) {
  const calls: string[] = [];
  let kitRef: ReturnType<typeof editorKit> | null = null;
  const kit = editorKit({ document: KIT_DOC, session: siteSession(() => kitRef!, calls, changed, parts), providers: async () => siteWriter(undefined, [], plan) });
  kitRef = kit;
  kit.ui.getState().setSiteStyle(STYLE_NOW);
  kit.render(<AssistantPanel />);
  await act(async () => {
    await kit.assistant.getState().connect("anthropic", "sk-ant-not-a-real-key");
  });
  fireEvent.click(screen.getByRole("radio", { name: "A new site" }));
  fireEvent.click(screen.getByRole("switch", { name: "Draw illustrations for the site" }));
  fireEvent.change(screen.getByLabelText("What is the site for?"), { target: { value: "A modern fitness gym." } });
  fireEvent.click(screen.getByRole("button", { name: "Write the new site" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Write the new site" })).getByRole("button", { name: "Write the new site" }));
  await act(async () => {
    await new Promise((done) => setTimeout(done, 50));
  });
  return calls;
}

const refused = (): never => {
  throw new AssistantError("Anthropic refused the request.", "other");
};

test("a new site none of whose pages is made: its header and footer are put back as they were, said in its steps; nothing is offered to publish, and the old style is still put back in one click", async () => {
  const calls = await writeNewSite(refused);
  // Each saved, the drafts they replaced kept; then each put back, the run's own not kept.
  expect(calls).toEqual(["style now #b3361b", "header (Before the new site)", "footer (Before the new site)", "header", "footer"]);
  expect([...document.querySelectorAll(".as-group:first-child .as-sections > li")].map((li) => li.textContent)).toEqual(["Direction, 3 pages", "Style, applied", "Header, put back", "Footer, put back"]);
  expect(screen.getAllByRole("status")[0]!.textContent).toBe("“Iron Forge”: a new style. The header and footer are back as they were: no page was made.");
  expect(screen.queryByRole("button", { name: "Publish all" })).toBeNull();
  expect(screen.queryByRole("button", { name: /the home page$/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Put the old style back" })).toBeTruthy();
});

test("a page made whose buttons to a page not made could not be changed: Publish all is not offered, and the drawer says why", async () => {
  // Classes is refused; Home and Join each lead to it, and their change is not saved.
  const calls = await writeNewSite((title) => (title === "Classes" ? refused() : pagePlan(title, [{ kind: "button", label: "Classes", target: "/classes" }])), "the storage did not answer.");
  expect(calls).toEqual(["style now #b3361b", "header (Before the new site)", "footer (Before the new site)", "make /iron-forge", "make /join", "header", "footer", "change 10", "change 11"]);
  expect(screen.queryByRole("button", { name: "Publish all" })).toBeNull();
  expect(document.querySelector(".as-offer-held")?.textContent).toBe("Publish all is not offered: “Home” and “Join” may still lead to a page that was not made, as the things to know say.");
  fireEvent.click(screen.getByText(/things to know$/));
  expect(document.querySelector(".as-notes")?.textContent).toContain("“Home”: Its buttons that lead to pages not made keep their links, as the change was not saved: the storage did not answer.");
  // What else becomes of it is offered as ever.
  expect(screen.getByRole("button", { name: "Make “Home” the home page" })).toBeTruthy();
});

test("a header whose save had its answer lost, and could not be put back either: its step says to check it, and the drawer says why Publish all is not offered", async () => {
  // Every page refused. The header's save: its answer lost; putting it back: failed. The footer: saved, then put back.
  const calls = await writeNewSite(refused, null, ["lost", "saved", "failed", "saved"]);
  // The header put back at the revision its doubtful save was sent at.
  expect(calls).toEqual(["style now #b3361b", "header (Before the new site)", "footer (Before the new site)", "header, fenced at 0", "footer"]);
  expect([...document.querySelectorAll(".as-group:first-child .as-sections > li")].map((li) => li.textContent)).toEqual(["Direction, 3 pages", "Style, applied", "Header, to check", "Footer, put back"]);
  expect(document.querySelector(".as-offer-held")?.textContent).toBe("Publish all is not offered: the header may still lead to a page that was not made, as the things to know say.");
  fireEvent.click(screen.getByText(/things to know$/));
  const notes = document.querySelector(".as-notes")?.textContent ?? "";
  expect(notes).toContain("The new header may have been saved: no answer came about the header's save, and its draft could not be read back to tell whether it was kept.");
  expect(notes).toContain("The new header was not put back as it was: the storage did not answer. It may lead to pages that were not made; its versions hold the one it replaced, as “Before the new site”.");
});

test("the sample written by hand says no model was asked, and adds nothing to any total", async () => {
  const kit = setUp();
  fireEvent.click(screen.getByRole("button", { name: "Build the sample page" }));
  await act(async () => {
    await kit.clock.advance(60_000);
  });
  expect(screen.getByText("A sample written by hand: no model was asked.")).toBeTruthy();
  expect(screen.queryByText(/tokens in/)).toBeNull();
  expect(foot()).toBeNull();
});
