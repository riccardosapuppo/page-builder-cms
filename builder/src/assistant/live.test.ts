// The cost of a run as it goes (./live.ts): the ratio of characters to a
// token, 4 at first, then calibrated by each request's exact count; a
// request in flight with its estimate, Anthropic's input exact as soon as
// its stream says it, OpenAI's estimated from the question until its count
// comes, then replaced by it; a request stopped with no count dropped; a
// photo in flight at its price per image, the dearest for its size where
// its model has none, an illustration counted as words; what the drawer is
// told, at most every LIVE_MS while answers stream in; and the drawer's line.
import { expect, test } from "vitest";
import { FakeClock } from "../../test/fake-clock.ts";
import { calibrated, CHARS_PER_TOKEN, charsPerToken, createLiveBook, LIVE_MS, liveWords, NO_RATIO, photoPrice, questionChars, tokensFor, type RunCost } from "./live.ts";
import { NO_USAGE, type Usage } from "./providers.ts";
import { photoTallyOf, tallyOf } from "./tally.ts";

const usage = (input: number, output: number, cacheRead = 0, cacheWrite = 0): Usage => ({ input, cacheRead, cacheWrite, output });
const chars = (n: number): string => "x".repeat(n);

// A book on a clock of the test's own, and every cost it told, with when.
function booked() {
  const clock = new FakeClock();
  const told: Array<{ at: number; cost: RunCost }> = [];
  const book = createLiveBook(clock, (cost) => told.push({ at: clock.now(), cost }));
  const last = (): RunCost => told.at(-1)!.cost;
  return { clock, told, book, last };
}

const OPUS = { provider: "anthropic", model: "claude-opus-5-5" } as const;
const SOL = { provider: "openai", model: "gpt-6.1-sol" } as const;

test("the ratio starts at 4 characters a token, and is calibrated by each request's exact count: the characters it streamed over the output tokens counted", () => {
  expect([CHARS_PER_TOKEN, charsPerToken(NO_RATIO)]).toEqual([4, 4]);
  expect([tokensFor(1000, NO_RATIO), tokensFor(1001, NO_RATIO), tokensFor(0, NO_RATIO)]).toEqual([250, 251, 0]);
  // 3,000 characters for 1,500 tokens: thinking, counted as output but never streamed, makes it 2.
  const once = calibrated(NO_RATIO, 3000, 1500);
  expect([charsPerToken(once), tokensFor(1000, once)]).toEqual([2, 500]);
  // Each request's count adds to the run's: 4,000 characters over 2,500 tokens, 1.6.
  const twice = calibrated(once, 1000, 1000);
  expect([charsPerToken(twice), tokensFor(800, twice)]).toEqual([1.6, 500]);
  // A request that streamed nothing, or was counted none, leaves it as it was.
  expect(calibrated(once, 0, 900)).toBe(once);
  expect(calibrated(once, 900, 0)).toBe(once);
});

test("within a run, a request's estimate is made at the ratios its requests that ended have shown; a new run starts again at 4", async () => {
  const { clock, book, last } = booked();
  book.begin(1);
  const first = book.start(1, { ...OPUS, kind: "words", chars: 4000 });
  first.wrote(chars(3000));
  first.end(tallyOf("anthropic", "claude-opus-5-5", usage(1000, 1500)));
  const second = book.start(1, { ...OPUS, kind: "words", chars: 4000 });
  second.wrote(chars(1000));
  await clock.advance(LIVE_MS);
  // Its question at 4,000 characters for 1,000 tokens; its answer at 3,000 for 1,500.
  expect(last().flying.map((one) => one.usage)).toEqual([usage(1000, 500)]);
  book.begin(2);
  const third = book.start(2, { ...OPUS, kind: "words", chars: 4000 });
  third.wrote(chars(1000));
  await clock.advance(LIVE_MS);
  expect(last()).toMatchObject({ run: 2, counted: [], flying: [{ usage: usage(1000, 250) }] });
});

test("Anthropic's input, said as its stream begins, is exact at once, the cache's too; its output is still estimated from what has streamed, and priced as an exact count is", async () => {
  const { clock, book, last } = booked();
  book.begin(1);
  const asking = book.start(1, { ...OPUS, kind: "words", chars: 10_000 });
  // Before the provider says it: from the question's characters.
  expect(last().flying).toMatchObject([{ usage: usage(2500, 0), inputSaid: false }]);
  // message_start's usage, its one token of output not counted: the output is the streamed characters'.
  asking.said(usage(3000, 1, 1000));
  await clock.advance(LIVE_MS);
  expect(last().flying).toMatchObject([{ usage: usage(3000, 0, 1000), inputSaid: true }]);
  asking.wrote(chars(400));
  await clock.advance(LIVE_MS);
  expect(last().flying.map((one) => one.usage)).toEqual([usage(3000, 100, 1000)]);
  // 3,000 × $4 + 1,000 × $0.20 + 100 × $20 a million tokens: $0.0142, at Claude Opus 5.5's list price.
  expect(last()).toMatchObject({ nano: 14_200_000, lines: [{ name: "Claude Opus 5.5", calls: 1, cost: { nano: 14_200_000 } }], estimate: true, unpriced: false });
});

test("OpenAI's input is estimated from the question's characters until its count comes with the last piece; then the exact count takes the estimate's place, at once", async () => {
  const { clock, book, last } = booked();
  book.begin(1);
  const asking = book.start(1, { ...SOL, kind: "words", chars: 12_000 });
  asking.wrote(chars(2000));
  await clock.advance(LIVE_MS);
  // 3,000 × $2 + 500 × $10 a million tokens: $0.011.
  expect(last()).toMatchObject({ flying: [{ usage: usage(3000, 500), inputSaid: false }], nano: 11_000_000, estimate: true });
  // 2,120 × $2 + 1,024 × $0.10 + 1,415 × $10 a million tokens: $0.0184924.
  const exact = tallyOf("openai", "gpt-6.1-sol", usage(2120, 1415, 1024));
  asking.end(exact);
  expect(last()).toMatchObject({ counted: exact, flying: [], lines: exact, usage: usage(2120, 1415, 1024), nano: 18_492_400, estimate: false, uncounted: 0 });
});

test("the question's characters are its system words, its text and its schema, all sent as input", () => {
  expect(questionChars({ system: "Plan pages.", text: "A gym.", schema: { type: "object" } })).toBe(11 + 6 + 17);
});

test("a request stopped, or failed, with no count of the provider's drops its estimate, and is counted as one whose cost is not known; one refused with a count keeps it", async () => {
  const { book, last } = booked();
  book.begin(1);
  const stopped = book.start(1, { ...SOL, kind: "words", chars: 8000 });
  stopped.wrote(chars(4000));
  expect(last().estimate).toBe(true);
  stopped.end(null);
  expect(last()).toMatchObject({ counted: [], flying: [], lines: [], nano: 0, uncounted: 1, estimate: false });
  const refused = book.start(1, { ...SOL, kind: "words", chars: 8000 });
  const billed = tallyOf("openai", "gpt-6.1-sol", usage(900, 8000));
  refused.end(billed);
  expect(last()).toMatchObject({ counted: billed, flying: [], uncounted: 1 });
  // Told anything after its end, a request changes nothing.
  stopped.wrote(chars(100));
  stopped.end(billed);
  expect(last()).toMatchObject({ counted: billed, uncounted: 1 });
});

test("pictures in flight: a photo at its price per image, the dearest for its size where its model has none, until its count takes its place; an illustration streams, and counts as words do", async () => {
  const { clock, book, last } = booked();
  book.begin(1);
  const square = book.start(1, { provider: "openai", model: "gpt-image-2", kind: "photo", each: photoPrice("gpt-image-2", "medium", "1024x1024") });
  // GPT Image 2.5 Flare has no price per image on file: the dearest landscape one, GPT Image 2's at high quality.
  const wide = book.start(1, { provider: "openai", model: "gpt-image-2.5-flare", kind: "photo", each: photoPrice("gpt-image-2.5-flare", "low", "1536x1024") });
  expect(last()).toMatchObject({ nano: 53_000_000 + 165_000_000, flying: [{ kind: "photo", each: 53_000_000, usage: NO_USAGE, tally: [] }, { kind: "photo", each: 165_000_000 }], usage: NO_USAGE, estimate: true });
  // Its count come: 50 × $5 + 1,372 × $30 a million tokens, $0.04141, as a photo is priced.
  const made = photoTallyOf("gpt-image-2", { textInput: 50, imageInput: 0, output: 1372 });
  square.end(made);
  expect(last()).toMatchObject({ counted: made, nano: 41_410_000 + 165_000_000, usage: usage(50, 1372) });
  wide.end(null);
  expect(last()).toMatchObject({ nano: 41_410_000, flying: [], uncounted: 1 });
  // An illustration: by the characters it streamed, counted as an illustration.
  const drawn = book.start(1, { ...OPUS, kind: "illustration", chars: 2000 });
  drawn.wrote(chars(800));
  await clock.advance(LIVE_MS);
  expect(last().flying).toMatchObject([{ kind: "illustration", usage: usage(500, 200), tally: [{ kind: "illustration", calls: 1 }] }]);
  // Whatever its quality, a model with no price per image counts at the dearest on file for its size: a square one, $0.211.
  expect(photoPrice("gpt-image-1.5", "low", "1024x1024")).toBe(211_000_000);
});

test("the drawer is told at most every LIVE_MS while answers stream in, the last piece too; a request that begins or ends is told at once", async () => {
  const { clock, told, book, last } = booked();
  book.begin(1);
  const asking = book.start(1, { ...SOL, kind: "words", chars: 400 });
  // Forty pieces of four characters over 400 ms, four every 40 ms.
  for (let step = 0; step < 10; step++) {
    for (let piece = 0; piece < 4; piece++) asking.wrote("abcd");
    await clock.advance(40);
  }
  expect(told.map(({ at }) => at)).toEqual([0, 0, 250]);
  await clock.advance(100);
  expect(told.map(({ at }) => at)).toEqual([0, 0, 250, 500]);
  expect(last().flying.map((one) => one.usage.output)).toEqual([40]);
  // Nothing more to tell: no timer is left.
  await clock.advance(1000);
  expect([told.length, clock.pending]).toEqual([4, 0]);
  // A piece after a quiet spell is told at once; its end straight after, at once too.
  asking.wrote("abcd");
  asking.end(tallyOf("openai", "gpt-6.1-sol", usage(100, 41)));
  expect(told.map(({ at }) => at)).toEqual([0, 0, 250, 500, 1500, 1500]);
  expect([last().flying, clock.pending]).toEqual([[], 0]);
});

test("the drawer's line: the dollars to four decimals, the tokens in and out, and that it is a live estimate; what has no list price said; photos in flight said", () => {
  const { book, last } = booked();
  book.begin(1);
  book.start(1, { ...SOL, kind: "words", chars: 8 }).end(tallyOf("openai", "gpt-6.1-sol", usage(2120, 1415, 1024)));
  expect(liveWords(last())).toBe("≈ $0.0185 so far · 3,144 tokens in, 1,415 out · live estimate, exact as each request ends");
  // A model with no price on file beside it: its tokens counted, not its cost.
  book.start(1, { provider: "openai", model: "gpt-5-2025-08-07", kind: "words", chars: 8 }).end(tallyOf("openai", "gpt-5-2025-08-07", usage(1000, 100)));
  expect(liveWords(last())).toBe("≈ $0.0185 so far for what has a list price on file · 4,144 tokens in, 1,515 out · live estimate, exact as each request ends");
  // Two photos in flight, each at its price per image.
  book.start(1, { provider: "openai", model: "gpt-image-2", kind: "photo", each: 41_000_000 });
  book.start(1, { provider: "openai", model: "gpt-image-2", kind: "photo", each: 53_000_000 });
  expect(liveWords(last())).toBe("≈ $0.1125 so far for what has a list price on file · 4,144 tokens in, 1,515 out · 2 photos at their price per image · live estimate, exact as each request ends");
  // Nothing with a price on file.
  book.begin(2);
  book.start(2, { provider: "openai", model: "gpt-5-2025-08-07", kind: "words", chars: 8 }).end(tallyOf("openai", "gpt-5-2025-08-07", usage(1000, 100)));
  expect(liveWords(last())).toBe("No list price on file for gpt-5-2025-08-07 · 1,000 tokens in, 100 out so far · live estimate, exact as each request ends");
});
