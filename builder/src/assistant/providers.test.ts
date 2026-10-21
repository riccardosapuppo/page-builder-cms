// The two providers (./anthropic.ts, ./openai.ts) on clients of the test's
// own: what a question sends, how its answer streams back and the tokens it
// used, read from each SDK's usage object, a refusal and a cut answer, which
// still say what they used, which models are offered and in which order,
// and a provider's error said in a sentence with the key taken out.
// Anthropic's question's own count told as its stream begins, on
// Anthropic's SDK itself too, fed the events as the API sends them;
// OpenAI's, only with its end.
// OpenAI's photos: one Images API request with the newest GPT Image model,
// at the size and quality asked, as a WebP, and the tokens it used.
import Anthropic from "@anthropic-ai/sdk";
import { expect, test } from "vitest";
import { anthropic, usageOf as usageOfAnthropic, versionOf, type AnthropicLike } from "./anthropic.ts";
import { imageUsageOf, offered, openai, PHOTO_COMPRESSION, photoModelOf, usageOf as usageOfOpenAI, type OpenAILike } from "./openai.ts";
import { AssistantError, said, type Question, type Usage } from "./providers.ts";

const KEY = "sk-test-not-a-real-key-9z8y";
const QUESTION: Question = {
  model: "the-model",
  system: "You plan pages.",
  text: "A page for an open day.",
  image: { mediaType: "image/png", base64: "iVBORw0KGgo=" },
  schema: { type: "object", additionalProperties: false, required: ["title"], properties: { title: { type: "string" } } },
  name: "page_plan",
  maxTokens: 8000,
  effort: "medium",
};

function anthropicClient(answer: { stop_reason?: string; pieces?: string[]; error?: unknown } = {}) {
  const asked: Array<{ key: string; body: unknown; signal: unknown }> = [];
  const make = (key: string): AnthropicLike => ({
    models: {
      async *list() {
        if (answer.error) throw answer.error;
        yield { id: "claude-sonnet-4-5-20250929", display_name: "Claude Sonnet 4.5", created_at: "2025-09-29T00:00:00Z" };
        yield { id: "claude-opus-4-6", display_name: "Claude Opus 4.6", created_at: "2026-02-05T00:00:00Z" };
        yield { id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5", created_at: "2026-09-10T00:00:00Z" };
        yield { id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2026-08-01T00:00:00Z" };
        yield { id: "claude-mythos-preview", display_name: "Claude Mythos Preview", created_at: "2026-04-01T00:00:00Z" };
      },
    },
    messages: {
      stream(body, options) {
        asked.push({ key, body, signal: options?.signal });
        const listeners: Array<[string, (value: never) => void]> = [];
        const emit = (event: string, value: unknown) => {
          for (const [name, listener] of listeners) if (name === event) (listener as (value: unknown) => void)(value);
        };
        return {
          on(event: string, listener: (value: never) => void) {
            listeners.push([event, listener]);
            return this;
          },
          async finalMessage() {
            if (answer.error) throw answer.error;
            // As the stream begins, the question's own count: its output, one token so far.
            emit("streamEvent", { type: "message_start", message: { usage: { input_tokens: 120, cache_read_input_tokens: 50, cache_creation_input_tokens: null, output_tokens: 1 } } });
            const pieces = answer.pieces ?? ["{\"title\":", "\"Open day\"}"];
            for (const piece of pieces) emit("text", piece);
            return {
              id: "msg_1", type: "message", role: "assistant", model: "the-model", stop_sequence: null, stop_details: null, container: null,
              stop_reason: answer.stop_reason ?? "end_turn",
              content: [{ type: "thinking", thinking: "…", signature: "s" }, { type: "text", text: pieces.join(""), citations: null }],
              usage: { input_tokens: 120, cache_read_input_tokens: 50, cache_creation_input_tokens: null, output_tokens: 34, output_tokens_details: { thinking_tokens: 20 } },
            } as never;
          },
        };
      },
    },
  });
  return { asked, make };
}

function openaiClient(answer: { chunks?: unknown[]; error?: unknown } = {}) {
  const asked: Array<{ key: string; body: unknown }> = [];
  const make = (key: string): OpenAILike => ({
    models: {
      async *list() {
        if (answer.error) throw answer.error;
        for (const [id, created] of [["gpt-4o", 100], ["gpt-5", 300], ["gpt-5-mini", 300], ["gpt-4o-audio-preview", 400], ["text-embedding-3-large", 500], ["o3", 200], ["dall-e-3", 50]] as const) yield { id, created };
      },
    },
    chat: {
      completions: {
        async create(body) {
          asked.push({ key, body });
          if (answer.error) throw answer.error;
          const chunks = answer.chunks ?? [
            { choices: [{ delta: { content: "{\"title\":" } }] },
            { choices: [{ delta: { content: "\"Open day\"}" }, finish_reason: "stop" }] },
            { choices: [], usage: { prompt_tokens: 90, completion_tokens: 12, total_tokens: 102, prompt_tokens_details: { cached_tokens: 40, cache_write_tokens: 30 }, completion_tokens_details: { reasoning_tokens: 8 } } },
          ];
          return (async function* () {
            yield* chunks as never[];
          })();
        },
      },
    },
  });
  return { asked, make };
}

test("Anthropic: one streamed Messages request, adaptive thinking, the answer held to the schema; the text comes in pieces", async () => {
  const { asked, make } = anthropicClient();
  const pieces: string[] = [];
  const signal = new AbortController().signal;
  const answer = await anthropic(make).ask(KEY, QUESTION, (piece) => pieces.push(piece), signal);
  // input_tokens, cache_read_input_tokens, cache_creation_input_tokens (none) and output_tokens, the thinking in them.
  expect(answer).toEqual({ text: "{\"title\":\"Open day\"}", usage: { input: 120, cacheRead: 50, cacheWrite: 0, output: 34 } });
  expect(pieces).toEqual(["{\"title\":", "\"Open day\"}"]);
  expect(asked).toEqual([{
    key: KEY,
    signal,
    body: {
      model: "the-model",
      max_tokens: 8000,
      system: "You plan pages.",
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: QUESTION.schema }, effort: "medium" },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
        { type: "text", text: "A page for an open day." },
      ] }],
    },
  }]);
});

test("Anthropic: the question's own count is told as the stream begins, before a word of the answer, its output counted at the end", async () => {
  const told: string[] = [];
  const answer = await anthropic(anthropicClient().make).ask(KEY, QUESTION, (piece) => told.push(`piece ${piece}`), undefined, (input) => told.push(`input ${JSON.stringify(input)}`));
  expect(told).toEqual([
    "input {\"input\":120,\"cacheRead\":50,\"cacheWrite\":0,\"output\":0}",
    "piece {\"title\":",
    "piece \"Open day\"}",
  ]);
  expect(answer.usage).toEqual({ input: 120, cacheRead: 50, cacheWrite: 0, output: 34 });
});

// A response streamed as the API streams it, each event sent when the test
// says: the server-sent events the SDK itself reads.
function streamed() {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({ start: (given) => void (controller = given) });
  const encoder = new TextEncoder();
  return {
    answering: async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
    send: (event: string, data: unknown) => controller!.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
    close: () => controller!.close(),
  };
}

test("Anthropic, on its SDK itself: message_start's usage is told the moment it comes, the answer not begun; the whole count once the stream ends", async () => {
  const stream = streamed();
  const make = (key: string): AnthropicLike => new Anthropic({ apiKey: key, fetch: stream.answering, maxRetries: 0 });
  const pieces: string[] = [];
  let early: (input: Usage) => void = () => undefined;
  const said = new Promise<Usage>((done) => (early = done));
  const asked = anthropic(make).ask(KEY, QUESTION, (piece) => pieces.push(piece), undefined, (input) => early(input));
  stream.send("message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "the-model", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3000, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0, output_tokens: 1 } } });
  expect(await said).toEqual({ input: 3000, cacheRead: 1000, cacheWrite: 0, output: 0 });
  expect(pieces).toEqual([]);
  stream.send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  stream.send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "{\"title\":\"Open day\"}" } });
  stream.send("content_block_stop", { type: "content_block_stop", index: 0 });
  stream.send("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 567 } });
  stream.send("message_stop", { type: "message_stop" });
  stream.close();
  expect(await asked).toEqual({ text: "{\"title\":\"Open day\"}", usage: { input: 3000, cacheRead: 1000, cacheWrite: 0, output: 567 } });
  expect(pieces).toEqual(["{\"title\":\"Open day\"}"]);
});

test("Anthropic: a refusal and an answer cut short are said, with the tokens they used", async () => {
  const used = { input: 120, cacheRead: 50, cacheWrite: 0, output: 34 };
  await expect(anthropic(anthropicClient({ stop_reason: "refusal" }).make).ask(KEY, QUESTION, () => undefined)).rejects.toMatchObject({ kind: "refused", usage: used });
  await expect(anthropic(anthropicClient({ stop_reason: "max_tokens" }).make).ask(KEY, QUESTION, () => undefined)).rejects.toMatchObject({ kind: "cut", usage: used });
});

test("Anthropic: the tokens are the usage object's, a count the stream never gave being none", () => {
  expect(usageOfAnthropic({ input_tokens: 1234, cache_read_input_tokens: 1000, cache_creation_input_tokens: 2000, output_tokens: 567 })).toEqual({ input: 1234, cacheRead: 1000, cacheWrite: 2000, output: 567 });
  expect(usageOfAnthropic({ input_tokens: 1234, output_tokens: 567 } as never)).toEqual({ input: 1234, cacheRead: 0, cacheWrite: 0, output: 567 });
});

test("Anthropic: the models offered take adaptive thinking and a schema (4.6 and later), Opus 5.5 first, then the newest", async () => {
  expect(await anthropic(anthropicClient().make).models(KEY)).toEqual([
    { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  ]);
  expect([versionOf("claude-opus-4-6"), versionOf("claude-sonnet-5"), versionOf("claude-haiku-4-5-20251001"), versionOf("claude-mythos-preview")]).toEqual([4.6, 5, 4.5, null]);
});

test("OpenAI: one streamed Chat Completions request with a strict schema; the usage comes in the last piece, and nothing of it before", async () => {
  const { asked, make } = openaiClient();
  const pieces: string[] = [];
  const early: Usage[] = [];
  const answer = await openai(make).ask(KEY, QUESTION, (piece) => pieces.push(piece), undefined, (input) => early.push(input));
  // prompt_tokens, 40 of them cached_tokens and 30 cache_write_tokens, and completion_tokens, the reasoning in them.
  expect(answer).toEqual({ text: "{\"title\":\"Open day\"}", usage: { input: 20, cacheRead: 40, cacheWrite: 30, output: 12 } });
  expect(pieces).toEqual(["{\"title\":", "\"Open day\"}"]);
  expect(early).toEqual([]);
  expect(asked[0]).toEqual({
    key: KEY,
    body: {
      model: "the-model",
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: 8000,
      messages: [
        { role: "system", content: "You plan pages." },
        { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } }, { type: "text", text: "A page for an open day." }] },
      ],
      response_format: { type: "json_schema", json_schema: { name: "page_plan", schema: QUESTION.schema, strict: true } },
    },
  });
});

test("OpenAI: a refusal, a filtered answer and one cut short are said, with the tokens they used", async () => {
  const ask = (chunks: unknown[]) => openai(openaiClient({ chunks }).make).ask(KEY, QUESTION, () => undefined);
  const counted = { choices: [], usage: { prompt_tokens: 90, completion_tokens: 8000, total_tokens: 8090 } };
  const used = { input: 90, cacheRead: 0, cacheWrite: 0, output: 8000 };
  await expect(ask([{ choices: [{ delta: { refusal: "I can't help with that." } }] }, counted])).rejects.toMatchObject({ kind: "refused", message: "The model would not write this. It said: I can't help with that.", usage: used });
  await expect(ask([{ choices: [{ delta: {}, finish_reason: "content_filter" }] }, counted])).rejects.toMatchObject({ kind: "refused", usage: used });
  await expect(ask([{ choices: [{ delta: { content: "{" }, finish_reason: "length" }] }, counted])).rejects.toMatchObject({ kind: "cut", usage: used });
  // With no piece that counts, nothing is said to be used.
  await expect(ask([{ choices: [{ delta: { content: "{" }, finish_reason: "length" }] }])).rejects.toMatchObject({ kind: "cut", usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } });
});

test("OpenAI: the tokens are the usage object's: of prompt_tokens, cached_tokens read from the cache and cache_write_tokens written to it, the rest input", () => {
  // With the field.
  expect(usageOfOpenAI({ prompt_tokens: 3144, completion_tokens: 1415, prompt_tokens_details: { cached_tokens: 1024, cache_write_tokens: 2000 } })).toEqual({ input: 120, cacheRead: 1024, cacheWrite: 2000, output: 1415 });
  // Without it, and without the prompt's details at all.
  expect(usageOfOpenAI({ prompt_tokens: 900, completion_tokens: 400, prompt_tokens_details: { cached_tokens: 300 } })).toEqual({ input: 600, cacheRead: 300, cacheWrite: 0, output: 400 });
  expect(usageOfOpenAI({ prompt_tokens: 900, completion_tokens: 400 })).toEqual({ input: 900, cacheRead: 0, cacheWrite: 0, output: 400 });
});

test("OpenAI: parts that add up to more than the prompt are cut to it, the cached tokens first, and none goes below nothing", () => {
  expect(usageOfOpenAI({ prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 80, cache_write_tokens: 50 } })).toEqual({ input: 0, cacheRead: 80, cacheWrite: 20, output: 10 });
  expect(usageOfOpenAI({ prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 150, cache_write_tokens: 30 } })).toEqual({ input: 0, cacheRead: 100, cacheWrite: 0, output: 10 });
  expect(usageOfOpenAI({ prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cache_write_tokens: 130 } })).toEqual({ input: 0, cacheRead: 0, cacheWrite: 100, output: 10 });
});

test("OpenAI: the models offered take a strict schema; newest first, a full model before its mini", async () => {
  expect((await openai(openaiClient().make).models(KEY)).map((model) => model.id)).toEqual(["gpt-5", "gpt-5-mini", "o3", "gpt-4o"]);
  expect(["gpt-4.1", "o4-mini", "gpt-realtime", "gpt-3.5-turbo", "omni-moderation-latest"].map(offered)).toEqual([true, true, false, false, false]);
});

// OpenAI's photos on a client of the test's own: the models it lists, and
// the Images API's answer.
function photosClient(answer: { response?: unknown; error?: unknown; listed?: Array<[string, number]> } = {}) {
  const asked: Array<{ key: string; body: unknown; signal: unknown }> = [];
  const make = (key: string): OpenAILike => ({
    ...openaiClient().make(key),
    models: {
      async *list() {
        for (const [id, created] of answer.listed ?? [["gpt-5", 300], ["gpt-image-1", 100], ["gpt-image-2", 400], ["gpt-image-2-2026-04-21", 500], ["gpt-image-1.5", 200], ["dall-e-3", 600]]) yield { id, created };
      },
    },
    images: {
      async generate(body, options) {
        asked.push({ key, body, signal: options?.signal });
        if (answer.error) throw answer.error;
        return (answer.response ?? {
          created: 1, output_format: "webp", size: "1536x1024", quality: "medium",
          data: [{ b64_json: "UklGRg==" }],
          usage: { input_tokens: 50, input_tokens_details: { text_tokens: 50, image_tokens: 0 }, output_tokens: 1372, total_tokens: 1422 },
        }) as never;
      },
    },
  });
  return { asked, make };
}

test("OpenAI: a photo is one Images API request, with the newest GPT Image model the key may use, the size of its shape, the quality chosen, as a WebP; what it used is the usage's", async () => {
  const { asked, make } = photosClient();
  const client = openai(make);
  expect(await client.photos!.model(KEY)).toBe("gpt-image-2");
  const signal = new AbortController().signal;
  const photo = await client.photos!.make(KEY, { model: "gpt-image-2", prompt: "Rowers at dawn.", size: "1536x1024", quality: "low" }, signal);
  expect(photo).toEqual({ base64: "UklGRg==", usage: { textInput: 50, imageInput: 0, output: 1372 } });
  expect(asked).toEqual([{
    key: KEY,
    signal,
    body: { model: "gpt-image-2", prompt: "Rowers at dawn.", n: 1, size: "1536x1024", quality: "low", output_format: "webp", output_compression: PHOTO_COMPRESSION },
  }]);
  expect(PHOTO_COMPRESSION).toBe(80);
});

test("OpenAI: the newest GPT Image model, a dated snapshot left to its model and a mini after its full model of the same day; none, none", () => {
  expect(photoModelOf([{ id: "gpt-image-1", created: 1 }, { id: "gpt-image-1-mini", created: 9 }, { id: "gpt-image-1.5", created: 5 }])).toBe("gpt-image-1-mini");
  expect(photoModelOf([{ id: "gpt-image-2.5-flare-mini", created: 9 }, { id: "gpt-image-2.5-sunburst", created: 9 }, { id: "gpt-image-2.5-flare", created: 9 }])).toBe("gpt-image-2.5-flare");
  expect(photoModelOf([{ id: "gpt-image-2-2026-04-21", created: 9 }, { id: "gpt-5", created: 10 }, { id: "dall-e-3", created: 11 }, { id: "chatgpt-image-latest", created: 12 }])).toBeNull();
});

test("OpenAI: an answer with no picture is said, and a refused one in a sentence; a photo's tokens read from the usage, with or without its details", async () => {
  await expect(openai(photosClient({ response: { created: 1, data: [] } }).make).photos!.make(KEY, { model: "gpt-image-2", prompt: "x", size: "1024x1024", quality: "medium" })).rejects.toMatchObject({ kind: "answer", message: "OpenAI sent no picture back." });
  const moderated = Object.assign(new Error(`400 Your request was rejected by the safety system. ${KEY}`), { status: 400 });
  await expect(openai(photosClient({ error: moderated }).make).photos!.make(KEY, { model: "gpt-image-2", prompt: "x", size: "1024x1024", quality: "medium" })).rejects.toMatchObject({ kind: "other", message: "OpenAI refused the request. It said: 400 Your request was rejected by the safety system. …" });
  expect(imageUsageOf({ input_tokens: 150, input_tokens_details: { text_tokens: 50, image_tokens: 100 }, output_tokens: 1000 })).toEqual({ textInput: 50, imageInput: 100, output: 1000 });
  expect(imageUsageOf({ input_tokens: 40, output_tokens: 1000 })).toEqual({ textInput: 40, imageInput: 0, output: 1000 });
  expect(imageUsageOf({ input_tokens: 40, input_tokens_details: { image_tokens: 90 }, output_tokens: -1 })).toEqual({ textInput: 0, imageInput: 40, output: 0 });
  // A client with no images makes no photo, and says so.
  await expect(openai(openaiClient().make).photos!.make(KEY, { model: "gpt-image-2", prompt: "x", size: "1024x1024", quality: "medium" })).rejects.toMatchObject({ message: "This connection to OpenAI makes no pictures." });
});

test("a call its caller stopped is said to be stopped, whatever the SDK's error is called: neither SDK names its abort error", async () => {
  // As both SDKs throw it: a class of their own whose name is Error's.
  class APIUserAbortError extends Error {}
  const aborted = new APIUserAbortError("Request was aborted.");
  expect(aborted.name).toBe("Error");
  const stop = new AbortController();
  stop.abort();
  const stopped = { kind: "stopped", message: "Stopped." };
  await expect(anthropic(anthropicClient({ error: aborted }).make).ask(KEY, QUESTION, () => undefined, stop.signal)).rejects.toMatchObject(stopped);
  await expect(openai(openaiClient({ error: aborted }).make).ask(KEY, QUESTION, () => undefined, stop.signal)).rejects.toMatchObject(stopped);
  await expect(openai(photosClient({ error: aborted }).make).photos!.make(KEY, { model: "gpt-image-2", prompt: "x", size: "1024x1024", quality: "low" }, stop.signal)).rejects.toMatchObject(stopped);
  // Not stopped, the same error is said as what it is.
  await expect(openai(photosClient({ error: aborted }).make).photos!.make(KEY, { model: "gpt-image-2", prompt: "x", size: "1024x1024", quality: "low" })).rejects.toMatchObject({ kind: "other" });
});

test("a provider's error is said in a sentence by its status, and never repeats the key", async () => {
  const error = Object.assign(new Error(`401 invalid x-api-key ${KEY}`), { status: 401 });
  const refused = await anthropic(anthropicClient({ error }).make).models(KEY).catch((caught: unknown) => caught);
  expect(refused).toBeInstanceOf(AssistantError);
  expect(refused).toMatchObject({ kind: "key", message: "Anthropic did not accept this key. Check it was copied whole, or make a new one." });
  const bad = said(Object.assign(new Error(`400 the key ${KEY} was sent with a bad field`), { status: 400 }), "OpenAI", KEY);
  expect(bad.message).toBe("OpenAI refused the request. It said: 400 the key … was sent with a bad field");
  expect(bad.message).not.toContain(KEY);
  expect([403, 404, 429, 529].map((status) => said({ status }, "OpenAI", KEY).kind)).toEqual(["key", "model", "limit", "busy"]);
  expect(said({ name: "APIUserAbortError" }, "OpenAI", KEY).kind).toBe("stopped");
  expect(said({ name: "APIConnectionError" }, "OpenAI", KEY).kind).toBe("network");
  expect(said(new TypeError("Failed to fetch"), "OpenAI", KEY).kind).toBe("network");
});
