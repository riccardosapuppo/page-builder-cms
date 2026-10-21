// The Assistant's state (./context.tsx) on providers of the test's own: a
// key is kept only once its provider lists models for it, the first model
// is chosen, a call borrows the key, and a key forgotten (asked, idle, the
// page left) takes its models with it. What every call since the key was
// kept used is added up, priced, a refused answer's too, and forgotten with
// the key; a call answered after its key went counts toward no other. An
// OpenAI key keeps the image model its photos are made with; a photo
// borrows the key and is counted; an illustration counts as one. A run
// bound to its key asks with it alone, and with no other once it goes.
// A run's cost as it goes: each request in flight with its estimate, its
// input from the question until the provider says it, the provider's count
// in its place as it ends, one stopped with none dropped; a photo at its
// price per image meanwhile; told at most every LIVE_MS; and the cost of
// the run shown, none for the sample. The run window, open or closed, and
// the pages a run has written, as the window's preview draws them.
import { expect, test } from "vitest";
import { FakeClock, settle } from "../../test/fake-clock.ts";
import { createAssistant, KEY_GONE, runCost, type ShownWriting } from "./context.tsx";
import { IDLE_MS, type ProviderId } from "./key.ts";
import { LIVE_MS, questionChars } from "./live.ts";
import { AssistantError, type Answer, type PhotoAnswer, type ProviderClient, type Question, type Usage } from "./providers.ts";
import type { SiteWriting } from "./site.ts";
import { photoTallyOf, tallyOf } from "./tally.ts";
import type { PageDocument } from "../shared/document.ts";

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

// ------------------------------------------------------------ the run's cost, live

// A provider of the test's own whose answers the test writes piece by
// piece and ends when it says. Where it says so (Anthropic's way), what the
// question used is told as the answer begins; else only with the end
// (OpenAI's). Its photos come when the test lets each go.
function streaming(model = "gpt-6.1-sol") {
  const asked: Question[] = [];
  const now = {
    write: (_piece: string): void => undefined,
    say: (_input: Usage): void => undefined,
    answer: (_value: Answer): void => undefined,
    fail: (_error: unknown): void => undefined,
    photo: (_value: PhotoAnswer): void => undefined,
  };
  const client: ProviderClient = {
    models: async () => [{ id: model, name: model }],
    ask: (_key, question, written, _signal, early) => new Promise<Answer>((done, failed) => {
      asked.push(question);
      Object.assign(now, { write: written, say: (input: Usage) => early?.(input), answer: done, fail: failed });
    }),
    photos: {
      model: async () => "gpt-image-2",
      make: () => new Promise<PhotoAnswer>((done) => (now.photo = done)),
    },
  };
  return { client, asked, now };
}

// A question of 8,000 characters: 2,000 tokens at four a token.
const LONG = (model: string): Question => ({ ...QUESTION(model), system: "x".repeat(7998) });

test("a run's request is in flight with its estimate as its answer streams in, its input from the question's characters; as it ends, the provider's count takes the estimate's place, and the key's total holds that count only", async () => {
  const clock = new FakeClock();
  const provider = streaming();
  const store = createAssistant(clock, async () => provider.client);
  await store.getState().connect("openai", KEY);
  const bound = store.getState().bind()!;
  expect(store.getState().live).toMatchObject({ run: bound.run, counted: [], flying: [], nano: 0, estimate: false });
  const asked = store.getState().ask(LONG, () => undefined, undefined, "words", bound);
  await settle();
  expect(questionChars(provider.asked[0]!)).toBe(8000);
  expect(store.getState().live).toMatchObject({ flying: [{ provider: "openai", model: "gpt-6.1-sol", kind: "words", usage: { input: 2000, output: 0 }, inputSaid: false }], estimate: true });
  provider.now.write("x".repeat(400));
  await clock.advance(LIVE_MS);
  // 2,000 × $2 + 100 × $10 a million tokens: $0.005.
  expect(store.getState().live).toMatchObject({ flying: [{ usage: { input: 2000, output: 100 } }], nano: 5_000_000 });
  expect(store.getState().spent).toEqual([]);
  provider.now.answer({ text: "{}", usage: USED });
  await asked;
  const exact = tallyOf("openai", "gpt-6.1-sol", USED);
  expect(store.getState().live).toMatchObject({ counted: exact, flying: [], lines: exact, nano: 3_000_000, estimate: false });
  expect(store.getState().spent).toEqual(exact);
});

test("a run's request whose provider says what the question used as its answer begins, Anthropic's, has its input exact from then on", async () => {
  const clock = new FakeClock();
  const provider = streaming("claude-opus-5-5");
  const store = createAssistant(clock, async () => provider.client);
  await store.getState().connect("anthropic", KEY);
  const bound = store.getState().bind()!;
  const asked = store.getState().ask(LONG, () => undefined, undefined, "words", bound);
  await settle();
  provider.now.say({ input: 3000, cacheRead: 1000, cacheWrite: 0, output: 1 });
  await clock.advance(LIVE_MS);
  expect(store.getState().live?.flying).toMatchObject([{ usage: { input: 3000, cacheRead: 1000, cacheWrite: 0, output: 0 }, inputSaid: true }]);
  provider.now.answer({ text: "{}", usage: USED });
  await asked;
  expect(store.getState().live).toMatchObject({ counted: tallyOf("anthropic", "claude-opus-5-5", USED), flying: [] });
});

test("a run's request stopped with no count of the provider's drops its estimate, and is one whose cost is not known; one refused keeps what the provider counted", async () => {
  const provider = streaming();
  const store = createAssistant(new FakeClock(), async () => provider.client);
  await store.getState().connect("openai", KEY);
  const bound = store.getState().bind()!;
  const stopped = store.getState().ask(LONG, () => undefined, undefined, "words", bound);
  await settle();
  provider.now.write("x".repeat(400));
  provider.now.fail(new AssistantError("Stopped.", "stopped"));
  await expect(stopped).rejects.toMatchObject({ kind: "stopped" });
  expect(store.getState().live).toMatchObject({ counted: [], flying: [], nano: 0, uncounted: 1, estimate: false });
  const refused = store.getState().ask(LONG, () => undefined, undefined, "words", bound);
  await settle();
  provider.now.fail(new AssistantError("The model would not write this.", "refused", USED));
  await expect(refused).rejects.toMatchObject({ kind: "refused" });
  expect(store.getState().live).toMatchObject({ counted: tallyOf("openai", "gpt-6.1-sol", USED), flying: [], uncounted: 1 });
});

test("a run's photo is in flight at its price per image until its count comes, then priced from its tokens; its illustration counts as words do", async () => {
  const provider = streaming();
  const store = createAssistant(new FakeClock(), async () => provider.client);
  await store.getState().connect("openai", KEY);
  const bound = store.getState().bind()!;
  const photo = store.getState().photo({ prompt: "Rowers", size: "1024x1024", quality: "medium" }, undefined, bound);
  await settle();
  // GPT Image 2's price per image, square, at medium: $0.053.
  expect(store.getState().live).toMatchObject({ flying: [{ kind: "photo", model: "gpt-image-2", each: 53_000_000 }], nano: 53_000_000, estimate: true });
  provider.now.photo({ base64: "UklGRg==", usage: { textInput: 50, imageInput: 0, output: 1372 } });
  await photo;
  // 50 × $5 + 1,372 × $30 a million tokens.
  expect(store.getState().live).toMatchObject({ counted: photoTallyOf("gpt-image-2", { textInput: 50, imageInput: 0, output: 1372 }), flying: [], nano: 41_410_000 });
  const drawn = store.getState().ask(LONG, () => undefined, undefined, "illustration", bound);
  await settle();
  expect(store.getState().live?.flying).toMatchObject([{ kind: "illustration", usage: { input: 2000 } }]);
  provider.now.answer({ text: "{}", usage: USED });
  await drawn;
  expect(store.getState().live?.counted.map((line) => line.kind)).toEqual(["photo", "illustration"]);
});

test("the run's cost is told at most every LIVE_MS while its answer streams in, and at once as a request begins or ends", async () => {
  const clock = new FakeClock();
  const provider = streaming();
  const store = createAssistant(clock, async () => provider.client);
  await store.getState().connect("openai", KEY);
  const bound = store.getState().bind()!;
  const told: number[] = [];
  store.subscribe((state, before) => {
    if (state.live !== before.live) told.push(clock.now());
  });
  const asked = store.getState().ask(LONG, () => undefined, undefined, "words", bound);
  await settle();
  // A hundred pieces over half a second, five every 25 ms.
  for (let step = 0; step < 20; step++) {
    for (let piece = 0; piece < 5; piece++) provider.now.write("abcd");
    await clock.advance(25);
  }
  expect(told).toEqual([0, 250, 500]);
  expect(store.getState().live?.flying[0]?.usage.output).toBe(100);
  provider.now.answer({ text: "{}", usage: USED });
  await asked;
  expect(told).toEqual([0, 250, 500, 500]);
});

test("the run window, closed until a run opens it and open until it is closed; the pages a run has written, each as it was last shown, in the order they came, emptied as the next run begins", () => {
  const store = createAssistant(new FakeClock(), async () => {
    throw new TypeError("No provider in this test.");
  });
  expect([store.getState().runWindow, store.getState().written]).toEqual([false, []]);
  store.getState().setRunWindow(true);
  expect(store.getState().runWindow).toBe(true);
  const page = (title: string, sections: number): PageDocument => ({ schemaVersion: 1, title, sections: Array.from({ length: sections }, (_, at) => ({ id: `s${at}`, type: "section", props: {}, style: { base: {} }, children: [] })) as PageDocument["sections"] });
  store.getState().showPage({ id: 7, title: "Home", document: page("Home", 1) });
  store.getState().showPage({ id: 8, title: "Classes", document: page("Classes", 1) });
  const grown = page("Home", 2);
  store.getState().showPage({ id: 7, title: "Home", document: grown });
  expect(store.getState().written.map((one) => [one.id, one.title, one.document.sections.length])).toEqual([[7, "Home", 2], [8, "Classes", 1]]);
  expect(store.getState().written[0]!.document).toBe(grown);
  // The next run starts with none; the window stays as it was until closed.
  store.getState().begin();
  expect([store.getState().written, store.getState().runWindow]).toEqual([[], true]);
  store.getState().setRunWindow(false);
  expect(store.getState().runWindow).toBe(false);
});

test("the cost of the run being shown, a page's or a new site's: its own, live, the same while nothing changes; none for the sample, for a run no longer kept, or with nothing shown", async () => {
  const provider = streaming();
  const store = createAssistant(new FakeClock(), async () => provider.client);
  await store.getState().connect("openai", KEY);
  const page = store.getState().bind()!;
  expect(runCost(store.getState())).toBeNull();
  const writing: ShownWriting = { phase: "writing", title: null, sections: [], pictures: [], notes: [], tally: null, error: null };
  store.getState().setWriting({ ...writing, run: page.run });
  expect(runCost(store.getState())).toMatchObject({ run: page.run, counted: [], flying: [] });
  expect(runCost(store.getState())).toBe(runCost(store.getState()));
  // The sample: no run of a key's.
  store.getState().setWriting({ ...writing, sample: true });
  expect(runCost(store.getState())).toBeNull();
  // A new site's run, shown in place of the page's.
  const site = store.getState().bind()!;
  const shown: SiteWriting = { phase: "asking", direction: null, steps: { direction: "doing", style: "waiting", header: "waiting", footer: "waiting" }, frame: { header: null, footer: null }, pages: [], notes: [], tally: null, error: null, before: null };
  store.getState().setWriting(null);
  store.getState().setSite({ ...shown, run: site.run });
  expect(runCost(store.getState())?.run).toBe(site.run);
  // The page's run shown again: its cost is no longer kept.
  store.getState().setSite(null);
  store.getState().setWriting({ ...writing, run: page.run });
  expect(runCost(store.getState())).toBeNull();
});
