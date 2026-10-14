// The two providers (./anthropic.ts, ./openai.ts) on clients of the test's
// own: what a question sends, how its answer streams back, a refusal and a
// cut answer, which models are offered and in which order, and a
// provider's error said in a sentence with the key taken out.
import { expect, test } from "vitest";
import { anthropic, versionOf, type AnthropicLike } from "./anthropic.ts";
import { offered, openai, type OpenAILike } from "./openai.ts";
import { AssistantError, said, type Question } from "./providers.ts";

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
        const listeners: Array<(delta: string) => void> = [];
        return {
          on(_event, listener) {
            listeners.push(listener);
            return this;
          },
          async finalMessage() {
            if (answer.error) throw answer.error;
            const pieces = answer.pieces ?? ["{\"title\":", "\"Open day\"}"];
            for (const piece of pieces) listeners.forEach((listener) => listener(piece));
            return {
              id: "msg_1", type: "message", role: "assistant", model: "the-model", stop_sequence: null, stop_details: null, container: null,
              stop_reason: answer.stop_reason ?? "end_turn",
              content: [{ type: "thinking", thinking: "…", signature: "s" }, { type: "text", text: pieces.join(""), citations: null }],
              usage: { input_tokens: 120, output_tokens: 34 },
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
            { choices: [], usage: { prompt_tokens: 90, completion_tokens: 12 } },
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
  expect(answer).toEqual({ text: "{\"title\":\"Open day\"}", usage: { input: 120, output: 34 } });
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

test("Anthropic: a refusal and an answer cut short are said", async () => {
  await expect(anthropic(anthropicClient({ stop_reason: "refusal" }).make).ask(KEY, QUESTION, () => undefined)).rejects.toMatchObject({ kind: "refused" });
  await expect(anthropic(anthropicClient({ stop_reason: "max_tokens" }).make).ask(KEY, QUESTION, () => undefined)).rejects.toMatchObject({ kind: "cut" });
});

test("Anthropic: the models offered take adaptive thinking and a schema (4.6 and later), Opus 5.5 first, then the newest", async () => {
  expect(await anthropic(anthropicClient().make).models(KEY)).toEqual([
    { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
  ]);
  expect([versionOf("claude-opus-4-6"), versionOf("claude-sonnet-5"), versionOf("claude-haiku-4-5-20251001"), versionOf("claude-mythos-preview")]).toEqual([4.6, 5, 4.5, null]);
});

test("OpenAI: one streamed Chat Completions request with a strict schema; the usage comes in the last piece", async () => {
  const { asked, make } = openaiClient();
  const pieces: string[] = [];
  const answer = await openai(make).ask(KEY, QUESTION, (piece) => pieces.push(piece));
  expect(answer).toEqual({ text: "{\"title\":\"Open day\"}", usage: { input: 90, output: 12 } });
  expect(pieces).toEqual(["{\"title\":", "\"Open day\"}"]);
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

test("OpenAI: a refusal, a filtered answer and one cut short are said", async () => {
  const ask = (chunks: unknown[]) => openai(openaiClient({ chunks }).make).ask(KEY, QUESTION, () => undefined);
  await expect(ask([{ choices: [{ delta: { refusal: "I can't help with that." } }] }])).rejects.toMatchObject({ kind: "refused", message: "The model would not write this. It said: I can't help with that." });
  await expect(ask([{ choices: [{ delta: {}, finish_reason: "content_filter" }] }])).rejects.toMatchObject({ kind: "refused" });
  await expect(ask([{ choices: [{ delta: { content: "{" }, finish_reason: "length" }] }])).rejects.toMatchObject({ kind: "cut" });
});

test("OpenAI: the models offered take a strict schema; newest first, a full model before its mini", async () => {
  expect((await openai(openaiClient().make).models(KEY)).map((model) => model.id)).toEqual(["gpt-5", "gpt-5-mini", "o3", "gpt-4o"]);
  expect(["gpt-4.1", "o4-mini", "gpt-realtime", "gpt-3.5-turbo", "omni-moderation-latest"].map(offered)).toEqual([true, true, false, false, false]);
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
