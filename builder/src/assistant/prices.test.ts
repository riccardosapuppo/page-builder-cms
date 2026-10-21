// The providers' list prices (./prices.ts): the tables as the two pages
// write them, each call's tokens priced kind by kind in whole nano-dollars,
// Claude Haiku 5.5's dearer price past 100,000 tokens and no price past
// OpenAI's 272,000, no price for a model the tables do not hold, amounts
// written for a person to read, an amount still growing to four decimals,
// every model the drawer offers priced or said to have no price, GPT Image
// 2's price per image as the guide gives it and the dearest for each size,
// and the tables read again before they are 120 days old.
import { expect, test } from "vitest";
import { anthropic, type AnthropicLike } from "./anthropic.ts";
import { PROVIDERS, type ProviderId } from "./key.ts";
import { openai, type OpenAILike } from "./openai.ts";
import { about, costAt, dayWords, dearestPerImage, dollars, IMAGE_PRICES, IMAGE_QUALITIES, imagePrice, listPrice, liveDollars, PER_IMAGE_MODELS, perImage, perMillion, perToken, PRICE_PAGES, PRICES_DAY, PRICES_READ, pricedModels } from "./prices.ts";
import type { Usage } from "./providers.ts";
import { addTallies, estimateWords, tallyOf, type Tally } from "./tally.ts";

const usage = (input: number, output: number, cacheRead = 0, cacheWrite = 0): Usage => ({ input, cacheRead, cacheWrite, output });

// The tables as the pages write them, typed again from the pages to be
// held to prices.ts's: Anthropic's base input, five-minute cache write,
// cache read and output; OpenAI's input, cached input, cache writes and
// output, "none" where the page gives a dash.
const ANTHROPIC_PAGE = `
claude-fable-5-1    Claude Fable 5.1    $10    $12.50   $0.25   $50
claude-mythos-5-1   Claude Mythos 5.1   $10    $12.50   $0.25   $50
claude-fable-5      Claude Fable 5      $10    $12.50   $1      $50
claude-mythos-5     Claude Mythos 5     $10    $12.50   $1      $50
claude-opus-5-5     Claude Opus 5.5     $4     $5       $0.20   $20
claude-opus-5       Claude Opus 5       $5     $6.25    $0.50   $25
claude-opus-4-8     Claude Opus 4.8     $5     $6.25    $0.50   $25
claude-opus-4-7     Claude Opus 4.7     $5     $6.25    $0.50   $25
claude-opus-4-6     Claude Opus 4.6     $5     $6.25    $0.50   $25
claude-sonnet-5-5   Claude Sonnet 5.5   $2     $2.50    $0.10   $10
claude-sonnet-5     Claude Sonnet 5     $2     $2.50    $0.20   $10
claude-sonnet-4-6   Claude Sonnet 4.6   $3     $3.75    $0.30   $15
claude-haiku-5-5    Claude Haiku 5.5    $0.10  $0.125   $0.01   $0.50
`;
const OPENAI_PAGE = `
gpt-6-astra    $10    $1      $12.50   $50
gpt-6.1-sol    $2     $0.10   $2.50    $10
gpt-6-luna     $0.10  $0.01   $0.125   $0.50
gpt-6-sol      $2     $0.20   $2.50    $10
gpt-5.6-sol    $4     $0.40   $5       $20
gpt-5.6-terra  $2     $0.20   $2.50    $12
gpt-5.6-luna   $0.20  $0.02   $0.25    $1.20
gpt-5.5        $5     $0.50   none     $30
gpt-5.5-pro    $30    none    none     $180
gpt-5.4        $2.50  $0.25   none     $15
gpt-5.4-mini   $0.75  $0.075  none     $4.50
gpt-5.4-nano   $0.20  $0.02   none     $1.25
gpt-5.4-pro    $30    none    none     $180
gpt-5.2        $1.75  $0.175  none     $14
gpt-5.2-pro    $21    none    none     $168
gpt-5.1        $1.25  $0.125  none     $10
gpt-5          $1.25  $0.125  none     $10
gpt-5-mini     $0.25  $0.025  none     $2
gpt-5-nano     $0.05  $0.005  none     $0.40
gpt-5-pro      $15    none    none     $120
gpt-4.1        $2     $0.50   none     $8
gpt-4.1-mini   $0.40  $0.10   none     $1.60
gpt-4.1-nano   $0.10  $0.025  none     $0.40
gpt-4o         $2.50  $1.25   none     $10
gpt-4o-2024-05-13  $5  none   none     $15
gpt-4o-mini    $0.15  $0.075  none     $0.60
o3-pro         $20    none    none     $80
o3             $2     $0.50   none     $8
o4-mini        $1.10  $0.275  none     $4.40
o3-mini        $1.10  $0.55   none     $4.40
`;
const rows = (page: string): string[] => page.trim().split("\n").map((line) => line.trim().split(/\s{2,}/).join(" | "));

test("the tables are the pages', model by model and price by price", () => {
  expect(pricedModels("anthropic").map((id) => {
    const { name, price } = listPrice("anthropic", id, 0) as Extract<ReturnType<typeof listPrice>, { band: unknown }>;
    return [id, name, perMillion(price.input), perMillion(price.cacheWrite), perMillion(price.cacheRead), perMillion(price.output)].join(" | ");
  })).toEqual(rows(ANTHROPIC_PAGE));
  expect(pricedModels("openai").map((id) => {
    const { price } = listPrice("openai", id, 0) as Extract<ReturnType<typeof listPrice>, { band: unknown }>;
    // No price the page gives for cached input or a cache write is the
    // input price: one at the input price is where the page gives a dash.
    const orNone = (nano: number) => (nano === price.input ? "none" : perMillion(nano));
    return [id, perMillion(price.input), orNone(price.cacheRead), orNone(price.cacheWrite), perMillion(price.output)].join(" | ");
  })).toEqual(rows(OPENAI_PAGE));
  // Claude Haiku 5.5 past 100,000 tokens: $0.50 in, $0.625 to write the cache, $0.05 to read it, $2.50 out.
  expect(listPrice("anthropic", "claude-haiku-5-5", 100_001)).toEqual({ name: "Claude Haiku 5.5", price: { input: 500, cacheWrite: 625, cacheRead: 50, output: 2500 }, band: { over: true, tokens: 100_000 } });
  // The image models, which price a photo from its tokens: text in, image in where the page gives it, image out.
  expect(Object.fromEntries(IMAGE_PRICES)).toEqual({
    "gpt-image-2": { textInput: 5000, imageInput: 8000, imageOutput: 30_000 },
    "gpt-image-2.5-sunburst": { textInput: 5000, imageInput: 8000, imageOutput: 30_000 },
    "gpt-image-2.5-flare": { textInput: 5000, imageInput: 8000, imageOutput: 30_000 },
    "gpt-image-1.5": { textInput: 5000, imageInput: null, imageOutput: 32_000 },
    "gpt-image-1-mini": { textInput: 2000, imageInput: null, imageOutput: 8000 },
  });
});

// GPT Image 2's price per image as the image generation guide writes it,
// typed again from the guide: quality, then 1024x1024, 1024x1536, 1536x1024.
const PER_IMAGE_GUIDE = `
gpt-image-2  low     $0.006  $0.005  $0.005
gpt-image-2  medium  $0.053  $0.041  $0.041
gpt-image-2  high    $0.211  $0.165  $0.165
`;

test("a photo's price per image is the guide's, GPT Image 2's alone; another model has none, and its cost is known from its tokens", () => {
  const sizes = ["1024x1024", "1024x1536", "1536x1024"] as const;
  expect(PER_IMAGE_MODELS.flatMap((model) => IMAGE_QUALITIES.map((quality) => [model, quality, ...sizes.map((size) => dollars(imagePrice(model, quality, size)!))].join(" | ")))).toEqual(rows(PER_IMAGE_GUIDE));
  expect(PER_IMAGE_MODELS).toEqual(["gpt-image-2"]);
  expect(IMAGE_QUALITIES).toEqual(["low", "medium", "high"]);
  for (const model of ["gpt-image-2.5-flare", "gpt-image-1.5", "gpt-image-1-mini", "gpt-image-2-2026-04-21", "toString"]) expect(imagePrice(model, "medium", "1024x1024"), model).toBeNull();
  // Whole billionths of a dollar, written exactly.
  expect(["0.006", "0.053", "0.211", "1", "0.000000001"].map(perImage)).toEqual([6_000_000, 53_000_000, 211_000_000, 1_000_000_000, 1]);
  for (const wrong of ["$0.04", "0.0000000001", "-1", ""]) expect(() => perImage(wrong)).toThrow();
  expect([5_000_000, 41_000_000, 265_000_000, 1_050_000_000, 30_000_000].map(dollars)).toEqual(["$0.005", "$0.041", "$0.265", "$1.05", "$0.03"]);
});

test("a price is a whole number of nano-dollars per token, the page's dollars per million times a thousand", () => {
  expect(["10", "12.50", "0.125", "0.005", "0.01", "6.25", "0"].map(perToken)).toEqual([10_000, 12_500, 125, 5, 10, 6250, 0]);
  for (const wrong of ["1.2345", "$4", "-1", "1e3", ""]) expect(() => perToken(wrong)).toThrow();
  expect([2000, 100, 12_500, 125, 5, 10, 1250, 6250, 275, 50_000].map(perMillion)).toEqual(["$2", "$0.10", "$12.50", "$0.125", "$0.005", "$0.01", "$1.25", "$6.25", "$0.275", "$50"]);
});

test("a call costs each kind of its tokens at its own price: input, read from the cache, written to it, output", () => {
  // Claude Opus 5.5: $4 in, $5 to write the cache, $0.20 to read it, $20 out.
  const opus = listPrice("anthropic", "claude-opus-5-5", 4234);
  expect(opus).toEqual({ name: "Claude Opus 5.5", price: { input: 4000, cacheWrite: 5000, cacheRead: 200, output: 20_000 }, band: null });
  // 1,234 × 4,000 + 1,000 × 200 + 2,000 × 5,000 + 567 × 20,000 nano-dollars: $0.026476.
  expect(costAt(opus.price!, usage(1234, 567, 1000, 2000))).toBe(26_476_000);
  // gpt-6.1-sol: $2 in, $0.10 cached, $10 out. 900 × 2,000 + 100 × 100 + 400 × 10,000.
  expect(costAt(listPrice("openai", "gpt-6.1-sol", 1000).price!, usage(900, 400, 100))).toBe(5_810_000);
});

test("a cache write on OpenAI costs the page's price where it gives one, and the input price where it gives a dash", () => {
  // gpt-6.1-sol: $2 in, $0.10 cached, $2.50 to write the cache, $10 out.
  // 1,000 × 2,000 + 200 × 100 + 500 × 2,500 + 100 × 10,000 nano-dollars.
  expect(listPrice("openai", "gpt-6.1-sol", 1700).price).toEqual({ input: 2000, cacheRead: 100, cacheWrite: 2500, output: 10_000 });
  expect(costAt(listPrice("openai", "gpt-6.1-sol", 1700).price!, usage(1000, 100, 200, 500))).toBe(4_270_000);
  // gpt-5: $1.25 in, $0.125 cached, a dash for cache writes, so $1.25; $10 out.
  // 1,000 × 1,250 + 200 × 125 + 500 × 1,250 + 100 × 10,000.
  expect(listPrice("openai", "gpt-5", 1700).price).toEqual({ input: 1250, cacheRead: 125, cacheWrite: 1250, output: 10_000 });
  expect(costAt(listPrice("openai", "gpt-5", 1700).price!, usage(1000, 100, 200, 500))).toBe(2_900_000);
});

test("where the page gives no cached price, cached tokens are counted at the input price; a model with one keeps it", () => {
  // gpt-5-pro: $15 in, no cached price, $120 out.
  const pro = listPrice("openai", "gpt-5-pro", 1500);
  expect(pro).toEqual({ name: "gpt-5-pro", price: { input: 15_000, cacheRead: 15_000, cacheWrite: 15_000, output: 120_000 }, band: null });
  // 1,000 × 15,000 + 500 cached × 15,000 + 100 × 120,000 nano-dollars.
  expect(costAt(pro.price!, usage(1000, 100, 500))).toBe(34_500_000);
  // o3-mini: $1.10 in, $0.55 cached, $4.40 out.
  expect(listPrice("openai", "o3-mini", 1500).price).toEqual({ input: 1100, cacheRead: 550, cacheWrite: 1100, output: 4400 });
});

test("sums stay exact where dollars kept as decimals drift", () => {
  // gpt-5-nano reads its cache at $0.005 a million tokens: 5 nano-dollars a token.
  const one = tallyOf("openai", "gpt-5-nano", usage(0, 0, 1));
  let total: Tally = [];
  for (let n = 0; n < 1000; n++) total = addTallies(total, one);
  expect(total).toMatchObject([{ calls: 1000, usage: usage(0, 0, 1000), cost: { nano: 5000 } }]);
  expect(about(5000)).toBe("under $0.01 (less than $0.0001)");
  // The same thousand calls in dollars, one after the other, as decimals.
  let dollars = 0;
  for (let n = 0; n < 1000; n++) dollars += 0.005 / 1e6;
  expect(dollars).not.toBe(0.000005);
});

test("Claude Haiku 5.5's dearer price holds for a call whose prompt is over 100,000 tokens, its cache reads and writes counted, and for all of that call's tokens", () => {
  // A prompt of exactly 100,000: 60,000 in, 30,000 read from the cache, 10,000 written to it.
  const within = tallyOf("anthropic", "claude-haiku-5-5", usage(60_000, 1000, 30_000, 10_000));
  // 60,000 × 100 + 30,000 × 10 + 10,000 × 125 + 1,000 × 500.
  expect(within[0]!.cost).toEqual({ price: { input: 100, cacheWrite: 125, cacheRead: 10, output: 500 }, band: { over: false, tokens: 100_000 }, nano: 8_050_000 });
  // One more token in: the whole call at the dearer price, its output too.
  const over = tallyOf("anthropic", "claude-haiku-5-5", usage(60_001, 1000, 30_000, 10_000));
  // 60,001 × 500 + 30,000 × 50 + 10,000 × 625 + 1,000 × 2,500.
  expect(over[0]!.cost).toEqual({ price: { input: 500, cacheWrite: 625, cacheRead: 50, output: 2500 }, band: { over: true, tokens: 100_000 }, nano: 40_250_500 });
  // Each call is priced on its own, and keeps its price when added up.
  expect(addTallies(within, over, within).map((line) => [line.calls, line.cost.price === null ? null : line.cost.nano])).toEqual([[2, 16_100_000], [1, 40_250_500]]);
});

test("past OpenAI's prompt of 272,000 tokens no list price is on file: only the tokens are said", () => {
  expect(listPrice("openai", "gpt-6.1-sol", 272_000)).toMatchObject({ price: { input: 2000 }, band: null });
  expect(listPrice("openai", "gpt-6.1-sol", 272_001)).toEqual({ name: "gpt-6.1-sol", price: null, why: "prompt", tokens: 272_000 });
  const long = tallyOf("openai", "gpt-6.1-sol", usage(200_000, 900, 72_001));
  expect(long[0]!.cost).toEqual({ price: null, why: "prompt", tokens: 272_000 });
  expect(estimateWords(long)).toBe("No list price on file for gpt-6.1-sol with a prompt over 272,000 tokens: only its tokens are shown.");
});

test("a model the tables do not hold has no list price on file, a dated snapshot of one they hold included", () => {
  const unknown: Array<[ProviderId, string]> = [["openai", "gpt-5-2025-08-07"], ["openai", "gpt-4o-2024-08-06"], ["openai", "gpt-5-chat-latest"], ["anthropic", "claude-opus-4-6-20260205"], ["anthropic", "claude-mythos-preview"], ["openai", "constructor"], ["anthropic", "toString"], ["openai", "claude-opus-5-5"]];
  for (const [provider, model] of unknown) expect(listPrice(provider, model, 10)).toEqual({ name: model, price: null, why: "model" });
});

test("an amount is written to the cent from a dollar, to two figures under one, and said to be under a cent below one", () => {
  const amounts: Array<[number, string]> = [
    [16_276_000, "≈ $0.016"],
    [18_492_400, "≈ $0.018"],
    [100_000_000, "≈ $0.10"],
    [125_000_000, "≈ $0.13"],
    [9_960_000, "≈ $0.01"],
    [995_000_000, "≈ $1.00"],
    [1_234_567_890, "≈ $1.23"],
    [1_234_567_000_000_000, "≈ $1,234,567.00"],
    [5_125_000, "under $0.01 ($0.0051)"],
    [4_168_000, "under $0.01 ($0.0042)"],
    [100_000, "under $0.01 ($0.0001)"],
    [49_000, "under $0.01 (less than $0.0001)"],
    [0, "$0.00"],
  ];
  expect(amounts.map(([nano]) => about(nano))).toEqual(amounts.map(([, words]) => words));
  expect([dayWords(PRICES_READ), dayWords("2027-02-03"), PRICES_DAY]).toEqual(["20 Oct 2026", "3 Feb 2027", "20 Oct 2026"]);
});

test("an amount still growing is written to a hundredth of a cent, its four decimals kept, a half going up", () => {
  const amounts: Array<[number, string]> = [
    [0, "$0.0000"],
    [49_999, "$0.0000"],
    [50_000, "$0.0001"],
    [12_345_678, "$0.0123"],
    [18_492_400, "$0.0185"],
    [1_250_000_000, "$1.2500"],
    [12_345_678_901, "$12.3457"],
  ];
  expect(amounts.map(([nano]) => liveDollars(nano))).toEqual(amounts.map(([, words]) => words));
});

test("the dearest price per image on file for each size, whatever its quality: what a photo of a model with none counts at while it is made", () => {
  expect((["1024x1024", "1024x1536", "1536x1024"] as const).map(dearestPerImage)).toEqual([211_000_000, 165_000_000, 165_000_000]);
});

// What each provider lists for a key that may use everything, as the pages
// name the models on the day the prices were read: the drawer offers some
// (./anthropic.ts, versionOf; ./openai.ts, offered).
const LISTED: Readonly<Record<ProviderId, readonly string[]>> = {
  anthropic: [
    "claude-fable-5-1", "claude-mythos-5-1", "claude-fable-5", "claude-mythos-5", "claude-opus-5-5", "claude-opus-5", "claude-opus-4-8", "claude-opus-4-7",
    "claude-opus-4-6", "claude-opus-4-5-20251101", "claude-opus-4-1-20250805", "claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929", "claude-haiku-5-5", "claude-haiku-4-5-20251001", "claude-mythos-preview",
  ],
  openai: [
    "gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna", "gpt-6-sol", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.5-pro", "gpt-5.4",
    "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.4-pro", "gpt-5.2", "gpt-5.2-pro", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-pro",
    "gpt-5-2025-08-07", "gpt-5-chat-latest", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4.1-2025-04-14", "gpt-4o", "gpt-4o-2024-05-13",
    "gpt-4o-2024-08-06", "gpt-4o-mini", "o1", "o1-pro", "o3", "o3-mini", "o3-pro", "o4-mini", "gpt-3.5-turbo", "gpt-image-2",
    "gpt-4o-audio-preview", "gpt-realtime", "gpt-4o-search-preview", "text-embedding-3-large", "omni-moderation-latest", "whisper-1",
    "dall-e-3", "gpt-oss-120b", "codex-mini-latest",
  ],
};

// The models the drawer offers with no row in the tables, because neither
// page prices them by their id: each said to have no list price on file.
// One priced later leaves this list.
const OFFERED_WITHOUT_PRICE: Readonly<Record<ProviderId, readonly string[]>> = {
  anthropic: [],
  openai: ["gpt-4.1-2025-04-14", "gpt-4o-2024-08-06", "gpt-5-2025-08-07", "gpt-5-chat-latest"],
};

const listing = {
  anthropic: (ids: readonly string[]) => (): AnthropicLike => ({
    models: {
      async *list() {
        for (const [index, id] of ids.entries()) yield { id, display_name: id, created_at: new Date(Date.UTC(2026, 0, 1) - index * 86_400_000).toISOString() };
      },
    },
    messages: {
      stream() {
        throw new Error("No question in this test.");
      },
    },
  }),
  openai: (ids: readonly string[]) => (): OpenAILike => ({
    models: {
      async *list() {
        for (const [index, id] of ids.entries()) yield { id, created: 2_000_000_000 - index };
      },
    },
    chat: {
      completions: {
        create() {
          throw new Error("No question in this test.");
        },
      },
    },
  }),
};

test("every model the drawer offers is priced by the tables or said to have no list price on file, and the tables hold only models it offers", async () => {
  const offered: Record<ProviderId, string[]> = {
    anthropic: (await anthropic(listing.anthropic(LISTED.anthropic)).models("sk-not-a-real-key")).map((model) => model.id),
    openai: (await openai(listing.openai(LISTED.openai)).models("sk-not-a-real-key")).map((model) => model.id),
  };
  for (const provider of PROVIDERS) {
    expect(pricedModels(provider).filter((id) => !offered[provider].includes(id)), `${provider}: rows of the table the drawer does not offer`).toEqual([]);
    const unpriced = offered[provider].filter((id) => listPrice(provider, id, 1000).price === null);
    expect(unpriced.toSorted(), `${provider}: models offered with no list price on file`).toEqual(OFFERED_WITHOUT_PRICE[provider]);
    for (const id of unpriced) expect(estimateWords(tallyOf(provider, id, usage(900, 400)))).toBe(`No list price on file for ${id}: only its tokens are shown.`);
  }
  // The model a key starts with is priced.
  expect(listPrice("anthropic", offered.anthropic[0]!, 1000).price).not.toBeNull();
});

test("the prices were read from the two official pages less than 120 days ago", () => {
  const days = Math.floor((Date.now() - Date.parse(`${PRICES_READ}T00:00:00Z`)) / 86_400_000);
  expect(days, `The list prices in src/assistant/prices.ts were read on ${PRICES_DAY}, ${days} days ago. Read the two official pages again, ${PRICE_PAGES.anthropic} and ${PRICE_PAGES.openai}, and bring the tables and PRICES_READ up to date.`).toBeLessThanOrEqual(120);
});
