// The Assistant's state (./context.tsx) on providers of the test's own: a
// key is kept only once its provider lists models for it, the first model
// is chosen, a call borrows the key, and a key forgotten (asked, idle, the
// page left) takes its models with it.
import { expect, test } from "vitest";
import { FakeClock } from "../../test/fake-clock.ts";
import { createAssistant } from "./context.tsx";
import { IDLE_MS, type ProviderId } from "./key.ts";
import { AssistantError, type ProviderClient, type Question } from "./providers.ts";

const KEY = "sk-not-a-real-key-wxyz";

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
      return { text: "{}", usage: { input: 1, output: 1 } };
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
      return { text: "{}", usage: { input: 1, output: 1 } };
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
