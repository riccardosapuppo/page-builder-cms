// What a request used and what it comes to (./tally.ts), in the words the
// drawer and a block's panel say it: the tokens in, cached and out; the
// estimate at the model's list price, with the price used and the day the
// prices were read; an amount under a cent; Claude Haiku 5.5's two prices;
// a model with no price on file; several calls added up; and the total
// since the key was connected. A photo priced from its tokens at its image
// model's prices, the pictures said a line for each kind, the page and its
// pictures together, and the total counting them by kind.
import { expect, test } from "vitest";
import type { Usage } from "./providers.ts";
import { addTallies, allWords, briefWords, ESTIMATE_NOTE, estimateWords, photoTallyOf, pictureWords, tallyOf, totalWords, usedWords } from "./tally.ts";

const usage = (input: number, output: number, cacheRead = 0, cacheWrite = 0): Usage => ({ input, cacheRead, cacheWrite, output });

// 1,234 × $4 + 567 × $20 a million tokens: $0.016276.
const OPUS = tallyOf("anthropic", "claude-opus-5-5", usage(1234, 567));
// 2,120 × $2 + 1,024 × $0.10 + 1,415 × $10 a million tokens: $0.0184924.
const SOL = tallyOf("openai", "gpt-6.1-sol", usage(2120, 1415, 1024));

test("after a request: the tokens in and out, then what they come to at the model's list price, the price used named, and the day it was read", () => {
  expect(usedWords(OPUS)).toBe("Used 1,234 tokens in and 567 out, on your key.");
  expect(estimateWords(OPUS)).toBe("≈ $0.016 at Claude Opus 5.5's list price ($4 in, $20 out per million tokens; prices of 20 Oct 2026).");
});

test("tokens read from the cache are said, with their own price", () => {
  expect(usedWords(SOL)).toBe("Used 3,144 tokens in, 1,024 of them cached, and 1,415 out, on your key.");
  expect(estimateWords(SOL)).toBe("≈ $0.018 at gpt-6.1-sol's list price ($2 in, $0.10 cached, $10 out per million tokens; prices of 20 Oct 2026).");
  // Written to the cache too: Anthropic's five-minute cache write.
  const sonnet = tallyOf("anthropic", "claude-sonnet-4-6", usage(1000, 100, 500, 2000));
  expect(usedWords(sonnet)).toBe("Used 3,500 tokens in, 500 of them cached and 2,000 written to the cache, and 100 out, on your key.");
  expect(estimateWords(sonnet)).toBe("≈ $0.012 at Claude Sonnet 4.6's list price ($3 in, $0.30 cached, $3.75 written to the cache, $15 out per million tokens; prices of 20 Oct 2026).");
  expect(usedWords(tallyOf("anthropic", "claude-sonnet-4-6", usage(1000, 100, 0, 2000)))).toBe("Used 3,000 tokens in, 2,000 of them written to the cache, and 100 out, on your key.");
  // OpenAI's too, at the page's price for a cache write: 1,000 × $2 + 200 × $0.10 + 500 × $2.50 + 100 × $10 a million tokens.
  const writes = tallyOf("openai", "gpt-6.1-sol", usage(1000, 100, 200, 500));
  expect(usedWords(writes)).toBe("Used 1,700 tokens in, 200 of them cached and 500 written to the cache, and 100 out, on your key.");
  expect(estimateWords(writes)).toBe("Under $0.01 ($0.0043) at gpt-6.1-sol's list price ($2 in, $0.10 cached, $2.50 written to the cache, $10 out per million tokens; prices of 20 Oct 2026).");
});

test("an amount under a cent is said so, with its figures", () => {
  // 600 × $1.25 + 300 × $0.125 + 400 × $10 a million tokens: $0.0047875.
  const gpt5 = tallyOf("openai", "gpt-5", usage(600, 400, 300));
  expect(estimateWords(gpt5)).toBe("Under $0.01 ($0.0048) at gpt-5's list price ($1.25 in, $0.125 cached, $10 out per million tokens; prices of 20 Oct 2026).");
  expect(usedWords(tallyOf("openai", "gpt-5-nano", usage(1, 1)))).toBe("Used 1 token in and 1 out, on your key.");
});

test("Claude Haiku 5.5's price says which of its two it is, by the prompt's length", () => {
  expect(estimateWords(tallyOf("anthropic", "claude-haiku-5-5", usage(20_000, 1000)))).toBe("Under $0.01 ($0.0025) at Claude Haiku 5.5's list price for prompts up to 100,000 tokens ($0.10 in, $0.50 out per million tokens; prices of 20 Oct 2026).");
  expect(estimateWords(tallyOf("anthropic", "claude-haiku-5-5", usage(150_000, 2000)))).toBe("≈ $0.08 at Claude Haiku 5.5's list price for prompts over 100,000 tokens ($0.50 in, $2.50 out per million tokens; prices of 20 Oct 2026).");
});

test("a model with no list price on file is said to have none, and only its tokens are shown", () => {
  // A dated snapshot neither page prices by its id.
  const dated = tallyOf("openai", "gpt-5-2025-08-07", usage(900, 400));
  expect(usedWords(dated)).toBe("Used 900 tokens in and 400 out, on your key.");
  expect(estimateWords(dated)).toBe("No list price on file for gpt-5-2025-08-07: only its tokens are shown.");
  expect(briefWords(dated)).toBe("Used 900 tokens in and 400 out, on your key: no list price on file for gpt-5-2025-08-07.");
});

test("a request that makes several calls adds them up: one line a model and price, the tokens and the amount summed exactly", () => {
  const twice = addTallies(SOL, SOL);
  expect(twice).toHaveLength(1);
  expect(usedWords(twice)).toBe("Used 6,288 tokens in, 2,048 of them cached, and 2,830 out, on your key.");
  expect(estimateWords(twice)).toBe("≈ $0.037 at gpt-6.1-sol's list price ($2 in, $0.10 cached, $10 out per million tokens; prices of 20 Oct 2026).");
  // Two models, each at its own price.
  const two = addTallies(OPUS, tallyOf("anthropic", "claude-sonnet-5-5", usage(1000, 500)));
  expect(estimateWords(two)).toBe("≈ $0.023 at the list prices of Claude Opus 5.5 ($4 in, $20 out per million tokens) and Claude Sonnet 5.5 ($2 in, $10 out per million tokens); prices of 20 Oct 2026.");
  // One with no price on file is left out of the amount, and said to be.
  const some = addTallies(OPUS, tallyOf("anthropic", "claude-mythos-preview", usage(1000, 100)));
  expect(estimateWords(some)).toBe("≈ $0.016 at Claude Opus 5.5's list price ($4 in, $20 out per million tokens; prices of 20 Oct 2026). No list price on file for claude-mythos-preview: its tokens are not in the estimate.");
  expect(usedWords(some)).toBe("Used 2,234 tokens in and 667 out, on your key.");
});

test("in a block's panel, the two in one line, the price named but not written out", () => {
  // 812 × $4 + 46 × $20 a million tokens: $0.004168.
  expect(briefWords(tallyOf("anthropic", "claude-opus-5-5", usage(812, 46)))).toBe("Used 812 tokens in and 46 out, on your key: under $0.01 ($0.0042) at Claude Opus 5.5's list price.");
  expect(briefWords(OPUS)).toBe("Used 1,234 tokens in and 567 out, on your key: ≈ $0.016 at Claude Opus 5.5's list price.");
});

test("the total since the key was connected: the requests, their tokens and what they come to, those with no price on file said apart", () => {
  expect(totalWords(OPUS)).toBe("Since you connected this key: 1 request, 1,234 tokens in and 567 out, ≈ $0.016.");
  expect(totalWords(addTallies(SOL, SOL))).toBe("Since you connected this key: 2 requests, 6,288 tokens in, 2,048 of them cached, and 2,830 out, ≈ $0.037.");
  const unpriced = tallyOf("anthropic", "claude-mythos-preview", usage(1000, 100));
  expect(totalWords(addTallies(OPUS, OPUS, unpriced))).toBe("Since you connected this key: 3 requests, 3,468 tokens in and 1,234 out, ≈ $0.033 for the 2 with a list price on file.");
  expect(totalWords(unpriced)).toBe("Since you connected this key: 1 request, 1,000 tokens in and 100 out, with no list price on file.");
  expect(ESTIMATE_NOTE).toBe("An estimate from the providers' list prices. The provider's bill is what counts: taxes, discounts and regional uplift are not included.");
});

test("a call that used no token adds nothing", () => {
  expect(tallyOf("anthropic", "claude-opus-5-5", usage(0, 0))).toEqual([]);
  expect(addTallies([], OPUS, [])).toEqual(OPUS);
  expect(photoTallyOf("gpt-image-2", { textInput: 0, imageInput: 0, output: 0 })).toEqual([]);
});

// A photo of gpt-image-2: 50 words in and 1,372 tokens out, at $5 in and $30 out a million: $0.04141.
const PHOTO = photoTallyOf("gpt-image-2", { textInput: 50, imageInput: 0, output: 1372 });

test("a photo is priced from its tokens at its image model's prices: the words in, any picture in at its own price, the picture out", () => {
  expect(PHOTO).toEqual([{
    provider: "openai", model: "gpt-image-2", name: "gpt-image-2", kind: "photo", calls: 1,
    usage: usage(50, 1372),
    cost: { price: { input: 5000, cacheRead: 5000, cacheWrite: 5000, output: 30_000 }, band: null, nano: 41_410_000 },
  }]);
  // A picture sent with the words is priced at the image input's price: 50 × 5,000 + 100 × 8,000 + 1,372 × 30,000.
  expect(photoTallyOf("gpt-image-2", { textInput: 50, imageInput: 100, output: 1372 })[0]!.cost).toMatchObject({ nano: 42_210_000 });
  // gpt-image-1.5 has no price for an image in: the words' price is used. 50 × 5,000 + 100 × 5,000 + 1,000 × 32,000.
  expect(photoTallyOf("gpt-image-1.5", { textInput: 50, imageInput: 100, output: 1000 })[0]!.cost).toMatchObject({ nano: 32_750_000 });
  // A model the table does not hold: its tokens only.
  expect(photoTallyOf("gpt-image-1", { textInput: 50, imageInput: 0, output: 1000 })[0]!.cost).toEqual({ price: null, why: "model" });
});

test("pictures are said a line for each kind: how many, what they come to, their tokens and the price used", () => {
  const photos = addTallies(PHOTO, PHOTO, PHOTO);
  expect(photos).toHaveLength(1);
  expect(pictureWords(photos, "photo")).toBe("3 photos, ≈ $0.12: 150 tokens in and 4,116 out, at gpt-image-2's list price ($5 in, $30 out per million tokens).");
  expect(pictureWords(photos, "illustration")).toBeNull();
  // An illustration is a call to the model that writes, counted as one.
  const drawn = addTallies(tallyOf("anthropic", "claude-opus-5-5", usage(900, 2100), "illustration"), tallyOf("anthropic", "claude-opus-5-5", usage(900, 2100), "illustration"));
  expect(pictureWords(drawn, "illustration")).toBe("2 illustrations, ≈ $0.091: 1,800 tokens in and 4,200 out, at Claude Opus 5.5's list price ($4 in, $20 out per million tokens).");
  expect(pictureWords(photoTallyOf("gpt-image-1", { textInput: 50, imageInput: 0, output: 1000 }), "photo")).toBe("1 photo: 50 tokens in and 1,000 out; no list price on file for gpt-image-1.");
  // An illustration's tokens are not the page's: they are kept apart, line by line.
  expect(addTallies(OPUS, drawn)).toHaveLength(2);
});

test("a page and its pictures together, once pictures were made; and the total counts the pictures by their kind", () => {
  expect(allWords(OPUS)).toBeNull();
  expect(allWords(addTallies(OPUS, PHOTO, PHOTO))).toBe("In all, ≈ $0.099 for the page and its pictures.");
  expect(allWords(addTallies(OPUS, PHOTO, photoTallyOf("gpt-image-1", { textInput: 1, imageInput: 0, output: 1 })))).toBe("In all, ≈ $0.058 for what has a list price on file.");
  expect(totalWords(addTallies(OPUS, PHOTO, PHOTO))).toBe("Since you connected this key: 1 request and 2 photos, 1,334 tokens in and 3,311 out, ≈ $0.099.");
  const drawn = tallyOf("anthropic", "claude-opus-5-5", usage(900, 2100), "illustration");
  expect(totalWords(addTallies(OPUS, OPUS, drawn))).toBe("Since you connected this key: 2 requests and 1 illustration, 3,368 tokens in and 3,234 out, ≈ $0.078.");
  expect(totalWords(PHOTO)).toBe("Since you connected this key: 1 photo, 50 tokens in and 1,372 out, ≈ $0.041.");
});
