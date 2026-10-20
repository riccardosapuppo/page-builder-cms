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
// whole, and the total counting them.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { describedText, editorKit } from "../../test/editor-kit.tsx";
import type { ModelChoice, ProviderClient, Usage } from "../assistant/providers.ts";
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
