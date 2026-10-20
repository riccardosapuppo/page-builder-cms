// The Assistant's state (./context.tsx) on providers of the test's own: a
// key is kept only once its provider lists models for it, the first model
// is chosen, a call borrows the key, and a key forgotten (asked, idle, the
// page left) takes its models with it. What every call since the key was
// kept used is added up, priced, a refused answer's too, and forgotten with
// the key; a call answered after its key went counts toward no other. An
// OpenAI key keeps the image model its photos are made with; a photo
// borrows the key and is counted; an illustration counts as one. A run
// bound to its key asks with it alone, and with no other once it goes.
import { expect, test } from "vitest";
import { FakeClock } from "../../test/fake-clock.ts";
import { createAssistant, KEY_GONE } from "./context.tsx";
import { IDLE_MS, type ProviderId } from "./key.ts";
import { AssistantError, type Answer, type ProviderClient, type Question, type Usage } from "./providers.ts";
import { tallyOf } from "./tally.ts";

const KEY = "sk-not-a-real-key-wxyz";
// 1,000 tokens in and 100 out: on Claude Opus 5.5, 1,000 × $4 + 100 × $20 a million, $0.006.
const USED: Usage = { input: 1000, cacheRead: 0, cacheWrite: 0, output: 100 };
const QUESTION = (model: string): Question => ({ model, system: "", text: "", schema: {}, name: "x", maxTokens: 1, effort: "low" });

function setUp(models = [{ id: "claude-opus-5-5", name: "Claude Opus 5.5" }, { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" }]) {
  const clock = new FakeClock();
  const page = new EventTarget();
  const calls: Array<[string, string, string]> = [];
  const client: ProviderClient = {
    async models(key) {
      calls.push(["models", key, ""]);
      if (key !== KEY) throw new AssistantError("Anthropic did not accept this key.", "key");
      return models;
    },
    async ask(key, question, written) {
      calls.push(["ask", key, question.model]);
      written("{}");
      if (question.text === "refuse") throw new AssistantError("Claude would not write this. Try other words.", "refused", USED);
      return { text: "{}", usage: USED };
    },
  };
  const loaded: ProviderId[] = [];
  const store = createAssistant(clock, async (id) => {
    loaded.push(id);
    return client;
  });
  const unwatch = store.watch(page);
  return { clock, page, store, calls, loaded, unwatch };
}

test("a key is kept once its provider lists models for it; the first is chosen; the state shows four characters, never the key", async () => {
  const { store, loaded } = setUp();
  expect(await store.getState().connect("anthropic", `  ${KEY}  `)).toBe(true);
  const state = store.getState();
  expect([state.held, state.model, state.models.length, state.problem, loaded]).toEqual([{ provider: "anthropic", hint: "…wxyz" }, "claude-opus-5-5", 2, null, ["anthropic"]]);
  expect(JSON.stringify({ ...state })).not.toContain(KEY);
});

test("a key its provider refuses is not kept, and why is said", async () => {
  const { store } = setUp();
  expect(await store.getState().connect("anthropic", "sk-wrong")).toBe(false);
  expect([store.getState().held, store.getState().problem]).toEqual([null, "Anthropic did not accept this key."]);
  expect(await store.getState().connect("openai", "  ")).toBe(false);
  expect(store.getState().problem).toBe("Paste a key first.");
});

test("a key that may use no model the Assistant works with is not kept", async () => {
  const { store } = setUp([]);
  expect(await store.getState().connect("openai", KEY)).toBe(false);
  expect([store.getState().held, store.getState().problem]).toEqual([null, "This key may use no model the Assistant can work with."]);
});

test("a question goes to the model chosen, with the key lent for that call", async () => {
  const { store, calls } = setUp();
  await expect(store.getState().ask((model) => ({ model, system: "", text: "", schema: {}, name: "x", maxTokens: 1, effort: "low" }), () => undefined)).rejects.toMatchObject({ message: "Connect a model first." });
  await store.getState().connect("anthropic", KEY);
  store.getState().choose("claude-sonnet-5-5");
  await store.getState().ask((model) => ({ model, system: "", text: "", schema: {}, name: "x", maxTokens: 1, effort: "low" }), () => undefined);
  expect(calls.at(-1)).toEqual(["ask", KEY, "claude-sonnet-5-5"]);
});

test("a key forgotten takes its models with it, and says why: asked, idle, the page left", async () => {
  const { clock, page, store } = setUp();
  await store.getState().connect("anthropic", KEY);
  store.getState().forget();
  expect([store.getState().held, store.getState().forgotten, store.getState().models, store.getState().model]).toEqual([null, "asked", [], null]);
  await store.getState().connect("anthropic", KEY);
  expect(store.getState().forgotten).toBeNull();
  await clock.advance(IDLE_MS);
  expect([store.getState().held, store.getState().forgotten]).toEqual([null, "idle"]);
  await store.getState().connect("anthropic", KEY);
  page.dispatchEvent(new Event("pagehide"));
  expect([store.getState().held, store.getState().forgotten]).toEqual([null, "left"]);
});

test("an editor that goes takes its key with it", async () => {
  const { clock, store, unwatch } = setUp();
  await store.getState().connect("anthropic", KEY);
  unwatch();
  expect([store.getState().held, store.getState().forgotten]).toEqual([null, "left"]);
  expect(clock.pending).toBe(0);
});

test("a key changed while a question is being made is not lent to the provider the question was made for", async () => {
  const clock = new FakeClock();
  const sent: Array<[string, string]> = [];
  const clientOf = (provider: ProviderId): ProviderClient => ({
    async models() {
      return [{ id: `${provider}-model`, name: provider }];
    },
    async ask(key) {
      sent.push([provider, key]);
      return { text: "{}", usage: USED };
    },
  });
  const store = createAssistant(clock, async (id) => clientOf(id));
  await store.getState().connect("anthropic", KEY);
  let made: (value: Question) => void = () => undefined;
  const asked = store.getState().ask(() => new Promise<Question>((done) => (made = done)), () => undefined);
  // While the question is made (an image made smaller), another key comes in.
  await Promise.resolve();
  store.getState().forget();
  await store.getState().connect("openai", "sk-other-not-a-real-key");
  made({ model: "anthropic-model", system: "", text: "", schema: {}, name: "x", maxTokens: 1, effort: "low" });
  await expect(asked).rejects.toMatchObject({ kind: "key" });
  expect(sent).toEqual([]);
});

test("each call comes back priced, and every call since the key was kept is added up, a refused answer's too", async () => {
  const { store } = setUp();
  await store.getState().connect("anthropic", KEY);
  expect(store.getState().spent).toEqual([]);
  const answer = await store.getState().ask(QUESTION, () => undefined);
  expect(answer.tally).toEqual(tallyOf("anthropic", "claude-opus-5-5", USED));
  expect(answer.tally).toMatchObject([{ name: "Claude Opus 5.5", calls: 1, cost: { nano: 6_000_000 } }]);
  // Refused, and billed all the same: the error says what it used.
  const refused = await store.getState().ask((model) => ({ ...QUESTION(model), text: "refuse" }), () => undefined).catch((error: unknown) => error);
  expect(refused).toMatchObject({ kind: "refused", message: "Claude would not write this. Try other words.", tally: [{ calls: 1, cost: { nano: 6_000_000 } }] });
  store.getState().choose("claude-sonnet-5-5");
  await store.getState().ask(QUESTION, () => undefined);
  expect(store.getState().spent).toMatchObject([
    { model: "claude-opus-5-5", calls: 2, usage: { input: 2000, output: 200 }, cost: { nano: 12_000_000 } },
    { model: "claude-sonnet-5-5", calls: 1, usage: { input: 1000, output: 100 }, cost: { nano: 3_000_000 } },
  ]);
});

test("the total is forgotten with the key, however it goes, and starts again with the next key", async () => {
  const { clock, page, store } = setUp();
  const spend = async () => {
    await store.getState().connect("anthropic", KEY);
    await store.getState().ask(QUESTION, () => undefined);
    expect(store.getState().spent).toHaveLength(1);
  };
  await spend();
  store.getState().forget();
  expect(store.getState().spent).toEqual([]);
  await spend();
  await clock.advance(IDLE_MS);
  expect([store.getState().held, store.getState().spent]).toEqual([null, []]);
  await spend();
  page.dispatchEvent(new Event("pagehide"));
  expect([store.getState().held, store.getState().spent]).toEqual([null, []]);
  // A key kept anew, over one still kept, starts its own total.
  await spend();
  await store.getState().connect("anthropic", KEY);
  expect(store.getState().spent).toEqual([]);
});

// OpenAI's client of the test's own, with photos: the image model its key
// may use, and one photo, with the key it was lent.
function photographer(imageModel: string | null = "gpt-image-2") {
  const lent: Array<[string, unknown]> = [];
  const client: ProviderClient = {
    models: async () => [{ id: "gpt-6.1-sol", name: "gpt-6.1-sol" }],
    ask: async () => ({ text: "{}", usage: USED }),
    photos: {
      model: async () => imageModel,
      async make(key, ask) {
        lent.push([key, ask]);
        return { base64: "UklGRg==", usage: { textInput: 50, imageInput: 0, output: 1372 } };
      },
    },
  };
  return { client, lent };
}

test("an OpenAI key keeps the image model its photos are made with; a photo borrows the key, comes back priced, and is added to the total; the model goes with the key", async () => {
  const { client, lent } = photographer();
  const store = createAssistant(new FakeClock(), async () => client);
  await expect(store.getState().photo({ prompt: "Rowers", size: "1536x1024", quality: "low" })).rejects.toMatchObject({ kind: "model", message: "This key makes no photos." });
  await store.getState().connect("openai", KEY);
  expect(store.getState().imageModel).toBe("gpt-image-2");
  const photo = await store.getState().photo({ prompt: "Rowers", size: "1536x1024", quality: "low" });
  expect(lent).toEqual([[KEY, { model: "gpt-image-2", prompt: "Rowers", size: "1536x1024", quality: "low" }]]);
  // 50 × $5 + 1,372 × $30 a million tokens.
  expect(photo).toMatchObject({ base64: "UklGRg==", tally: [{ kind: "photo", model: "gpt-image-2", calls: 1, cost: { nano: 41_410_000 } }] });
  expect(store.getState().spent).toEqual(photo.tally);
  store.getState().forget();
  expect([store.getState().imageModel, store.getState().spent]).toEqual([null, []]);
});

test("a key whose provider makes no photos, or may use no image model, has none; a listing that fails leaves none, and the key is kept", async () => {
  const { store } = setUp();
  await store.getState().connect("anthropic", KEY);
  expect(store.getState().imageModel).toBeNull();
  const none = createAssistant(new FakeClock(), async () => photographer(null).client);
  await none.getState().connect("openai", KEY);
  expect([none.getState().held?.provider, none.getState().imageModel]).toEqual(["openai", null]);
  const failing = photographer();
  failing.client.photos!.model = async () => {
    throw new AssistantError("OpenAI could not be reached from this browser.", "network");
  };
  const kept = createAssistant(new FakeClock(), async () => failing.client);
  expect(await kept.getState().connect("openai", KEY)).toBe(true);
  expect(kept.getState().imageModel).toBeNull();
});

test("an illustration drawn for a page is counted as one, apart from the page's words", async () => {
  const { store } = setUp();
  await store.getState().connect("anthropic", KEY);
  await store.getState().ask(QUESTION, () => undefined);
  const drawn = await store.getState().ask(QUESTION, () => undefined, undefined, "illustration");
  expect(drawn.tally).toMatchObject([{ kind: "illustration", calls: 1 }]);
  expect(store.getState().spent.map((line) => [line.kind, line.calls])).toEqual([["words", 1], ["illustration", 1]]);
});

test("a run bound to its key asks with it alone: once it is forgotten or replaced, the run is told, a call made with it is refused before it is sent, and one answered late counts toward no other key", async () => {
  const sent: Array<[ProviderId, string, string]> = [];
  let answer: (value: Answer) => void = () => undefined;
  const clientOf = (provider: ProviderId): ProviderClient => ({
    models: async () => [{ id: `${provider}-model`, name: provider }],
    ask(key, question) {
      sent.push([provider, key, question.model]);
      return question.text === "late" ? new Promise<Answer>((done) => (answer = done)) : Promise.resolve({ text: "{}", usage: USED });
    },
  });
  const store = createAssistant(new FakeClock(), async (id) => clientOf(id));
  expect(store.getState().bind()).toBeNull();
  await store.getState().connect("anthropic", KEY);
  const bound = store.getState().bind()!;
  expect(bound).toMatchObject({ provider: "anthropic", model: "anthropic-model", imageModel: null });
  // Another model chosen after the run began: the run keeps its own.
  store.getState().choose("another-model");
  await store.getState().ask(QUESTION, () => undefined, undefined, "words", bound);
  expect(sent).toEqual([["anthropic", KEY, "anthropic-model"]]);
  // A call in flight when the key is replaced: answered late, it says what it used, counted toward no key.
  const late = store.getState().ask((model) => ({ ...QUESTION(model), text: "late" }), () => undefined, undefined, "illustration", bound);
  await new Promise((done) => setTimeout(done, 0));
  await store.getState().connect("openai", "sk-other-not-a-real-key");
  expect(bound.gone.aborted).toBe(true);
  answer({ text: "{}", usage: USED });
  expect((await late).tally).toMatchObject([{ kind: "illustration", calls: 1 }]);
  expect(store.getState().spent).toEqual([]);
  // Asked again with the key gone: refused, sent to neither provider.
  await expect(store.getState().ask(QUESTION, () => undefined, undefined, "words", bound)).rejects.toMatchObject({ kind: "key", message: KEY_GONE });
  await expect(store.getState().photo({ prompt: "x", size: "1024x1024", quality: "low" }, undefined, { ...bound, imageModel: "gpt-image-2" })).rejects.toMatchObject({ kind: "key", message: KEY_GONE });
  expect(sent.map(([provider]) => provider)).toEqual(["anthropic", "anthropic"]);
  expect(store.getState().spent).toEqual([]);
});

test("a call answered after its key was forgotten says what it used, but counts toward no other key's total", async () => {
  const clock = new FakeClock();
  let answer: (value: Answer) => void = () => undefined;
  const client: ProviderClient = {
    models: async () => [{ id: "claude-opus-5-5", name: "Claude Opus 5.5" }],
    ask: () => new Promise<Answer>((done) => (answer = done)),
  };
  const store = createAssistant(clock, async () => client);
  await store.getState().connect("anthropic", KEY);
  const asked = store.getState().ask(QUESTION, () => undefined);
  await new Promise((done) => setTimeout(done, 0));
  store.getState().forget();
  await store.getState().connect("anthropic", "sk-another-not-a-real-key");
  answer({ text: "{}", usage: USED });
  expect((await asked).tally).toMatchObject([{ calls: 1, cost: { nano: 6_000_000 } }]);
  expect(store.getState().spent).toEqual([]);
});
