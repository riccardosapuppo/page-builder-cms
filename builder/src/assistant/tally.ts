// What the Assistant's requests used, and what that comes to at the
// providers' list prices (./README.md, "What a request costs"). Each call's
// tokens, as its provider counted them (./providers.ts, Usage), are priced
// on their own at the model's list price (./prices.ts), since a call's
// prompt sets the price that call pays. A request that makes several calls
// adds them up, and so does the total since the key was kept, the calls of
// one model at one price, for one kind of thing, kept as one line: the
// words (a page, a text, an alt text), or the pictures made for a page,
// photos and illustrations, each call one picture. A photo is priced at
// its image model's prices per token. The words the interface says it in
// are here too, for the drawer and for a block's panel.
import type { ProviderId } from "./key.ts";
import type { PictureKind } from "./pictures.ts";
import { about, costAt, IMAGE_PRICES, listPrice, perMillion, PRICES_DAY, type Band, type Nano, type Price } from "./prices.ts";
import { NO_USAGE, type ImageUsage, type Usage } from "./providers.ts";

// What a line's tokens come to at its list price, or why none is on file.
export type Cost =
  | { price: Price; band: Band | null; nano: Nano }
  | { price: null; why: "model" }
  | { price: null; why: "prompt"; tokens: number };

// What a line's calls made: words, or pictures for a page.
export type TallyKind = "words" | PictureKind;

export interface TallyLine {
  provider: ProviderId;
  model: string;
  // As the words say it: the page's name of a model on file, else its id.
  name: string;
  kind: TallyKind;
  calls: number;
  usage: Usage;
  cost: Cost;
}

export type Tally = readonly TallyLine[];

type PricedLine = TallyLine & { cost: { price: Price; band: Band | null; nano: Nano } };

const isPriced = (line: TallyLine): line is PricedLine => line.cost.price !== null;

const promptOf = (usage: Usage): number => usage.input + usage.cacheRead + usage.cacheWrite;

const add = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
  output: a.output + b.output,
});

// One call to `model`: its tokens, at the list price its prompt pays; an
// illustration's call says so. A call that used no token adds nothing.
export function tallyOf(provider: ProviderId, model: string, usage: Usage, kind: TallyKind = "words"): Tally {
  if (promptOf(usage) + usage.output === 0) return [];
  const found = listPrice(provider, model, promptOf(usage));
  const cost: Cost = found.price !== null
    ? { price: found.price, band: found.band, nano: costAt(found.price, usage) }
    : found.why === "prompt" ? { price: null, why: "prompt", tokens: found.tokens } : { price: null, why: "model" };
  return [{ provider, model, name: found.name, kind, calls: 1, usage, cost }];
}

// One photo, made by OpenAI's image `model`: the words asked, any picture
// sent with them, and the picture made, as the Images API counts them, at
// the model's prices per token (its text in, its image in, its image out).
// No picture goes with a page's photo, so its input is words. Its tokens
// are said as input and output; a model with no price on file says so. A
// photo whose answer counted no token adds nothing.
export function photoTallyOf(model: string, usage: ImageUsage): Tally {
  const counted: Usage = { input: usage.textInput + usage.imageInput, cacheRead: 0, cacheWrite: 0, output: usage.output };
  if (counted.input + counted.output === 0) return [];
  const price = IMAGE_PRICES.get(model);
  const cost: Cost = price === undefined ? { price: null, why: "model" } : {
    price: { input: price.textInput, cacheRead: price.textInput, cacheWrite: price.textInput, output: price.imageOutput },
    band: null,
    nano: usage.textInput * price.textInput + usage.imageInput * (price.imageInput ?? price.textInput) + usage.output * price.imageOutput,
  };
  return [{ provider: "openai", model, name: model, kind: "photo", calls: 1, usage: counted, cost }];
}

// The calls of one model at one price, for one kind of thing, or with none
// for one reason, are one line.
const lineKey = (line: TallyLine): string =>
  [line.provider, line.model, line.kind, line.cost.price === null ? line.cost.why : line.cost.band?.over ? "over" : "within"].join(" ");

// Tallies added up, line by line: exact, as their costs are whole numbers.
export function addTallies(...tallies: Tally[]): Tally {
  const lines = new Map<string, TallyLine>();
  for (const line of tallies.flat()) {
    const key = lineKey(line);
    const had = lines.get(key);
    if (had === undefined) {
      lines.set(key, line);
      continue;
    }
    const cost: Cost = had.cost.price !== null && line.cost.price !== null ? { ...had.cost, nano: had.cost.nano + line.cost.nano } : had.cost;
    lines.set(key, { ...had, calls: had.calls + line.calls, usage: add(had.usage, line.usage), cost });
  }
  return [...lines.values()];
}

export const usageIn = (tally: Tally): Usage => tally.reduce((all, line) => add(all, line.usage), NO_USAGE);

// ------------------------------------------------------------------ words

const count = (n: number): string => n.toLocaleString("en-US");
const sentence = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1);
const and = (words: readonly string[]): string => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);
const plural = (n: number, one: string, many: string): string => `${count(n)} ${n === 1 ? one : many}`;

// "3,144 tokens in, 1,024 of them cached, and 1,415 out".
function tokenWords(usage: Usage): string {
  const kinds: Array<[number, string]> = [[usage.cacheRead, "cached"], [usage.cacheWrite, "written to the cache"]];
  const parts = kinds.filter(([n]) => n > 0).map(([n, what], index) => `${count(n)}${index === 0 ? " of them" : ""} ${what}`);
  const tokensIn = plural(promptOf(usage), "token", "tokens");
  return parts.length === 0 ? `${tokensIn} in and ${count(usage.output)} out` : `${tokensIn} in, ${parts.join(" and ")}, and ${count(usage.output)} out`;
}

// "$2 in, $0.10 cached, $10 out": a price for each kind of token the calls used.
function priceWords(price: Price, usage: Usage): string {
  return [
    `${perMillion(price.input)} in`,
    ...(usage.cacheRead > 0 ? [`${perMillion(price.cacheRead)} cached`] : []),
    ...(usage.cacheWrite > 0 ? [`${perMillion(price.cacheWrite)} written to the cache`] : []),
    `${perMillion(price.output)} out`,
  ].join(", ");
}

// A price that is one of two by the prompt's length says which.
const bandWords = (band: Band | null): string => (band === null ? "" : ` for prompts ${band.over ? "over" : "up to"} ${count(band.tokens)} tokens`);

// A line's model and the list price its calls are counted at, a price for
// each kind of token they used: "Claude Opus 5.5: $4 in, $20 out per
// million tokens". Null where no price is on file.
export function linePriceWords(line: TallyLine): string | null {
  return isPriced(line) ? `${line.name}${bandWords(line.cost.band)}: ${priceWords(line.cost.price, line.usage)} per million tokens` : null;
}

// The model a line has no list price on file for, and when.
const noPriceWords = (line: TallyLine): string =>
  line.cost.price === null && line.cost.why === "prompt" ? `${line.name} with ${line.calls === 1 ? "a prompt" : "prompts"} over ${count(line.cost.tokens)} tokens` : line.name;

const nanoOf = (lines: readonly PricedLine[]): Nano => lines.reduce((nano, line) => nano + line.cost.nano, 0);

// What the tokens were, on the person's key: "Used 3,144 tokens in and
// 1,415 out, on your key."
export function usedWords(tally: Tally): string {
  return `Used ${tokenWords(usageIn(tally))}, on your key.`;
}

// What they come to, the model and the price used named, and the day the
// prices were read: "≈ $0.021 at gpt-6.1-sol's list price ($2 in, $10 out
// per million tokens; prices of 20 Oct 2026)."
export function estimateWords(tally: Tally): string {
  const priced = tally.filter(isPriced);
  const unpriced = tally.filter((line) => !isPriced(line));
  const said: string[] = [];
  if (priced.length === 1) {
    const [line] = priced as [PricedLine];
    said.push(`${sentence(about(line.cost.nano))} at ${line.name}'s list price${bandWords(line.cost.band)} (${priceWords(line.cost.price, line.usage)} per million tokens; prices of ${PRICES_DAY}).`);
  } else if (priced.length > 1) {
    const each = priced.map((line) => `${line.name}${bandWords(line.cost.band)} (${priceWords(line.cost.price, line.usage)} per million tokens)`);
    said.push(`${sentence(about(nanoOf(priced)))} at the list prices of ${and(each)}; prices of ${PRICES_DAY}.`);
  }
  if (unpriced.length > 0) {
    const whose = unpriced.length === 1 ? "its" : "their";
    said.push(`No list price on file for ${and(unpriced.map(noPriceWords))}: ${priced.length > 0 ? `${whose} tokens are not in the estimate` : `only ${whose} tokens are shown`}.`);
  }
  return said.join(" ");
}

// The two in one line, the price named but not written out, for a block's
// panel: "Used 812 tokens in and 46 out, on your key: under $0.01
// ($0.0042) at Claude Opus 5.5's list price."
export function briefWords(tally: Tally): string {
  const priced = tally.filter(isPriced);
  const unpriced = tally.filter((line) => !isPriced(line));
  const parts: string[] = [];
  if (priced.length === 1) parts.push(`${about(nanoOf(priced))} at ${priced[0]!.name}'s list price${bandWords(priced[0]!.cost.band)}`);
  else if (priced.length > 1) parts.push(`${about(nanoOf(priced))} at the list prices of ${and(priced.map((line) => line.name))}`);
  if (unpriced.length > 0) parts.push(`no list price on file for ${and(unpriced.map(noPriceWords))}`);
  return `Used ${tokenWords(usageIn(tally))}, on your key: ${parts.join("; ")}.`;
}

// The pictures made for a page, of one kind: how many, what they come to,
// their tokens and the price used. "3 photos, ≈ $0.12: 150 tokens in and
// 4,116 out, at gpt-image-2's list price ($5 in, $30 out per million
// tokens)." Null when none was made.
export function pictureWords(tally: Tally, kind: PictureKind): string | null {
  const lines = tally.filter((line) => line.kind === kind);
  if (lines.length === 0) return null;
  const what = sentence(plural(lines.reduce((n, line) => n + line.calls, 0), kind, `${kind}s`));
  const priced = lines.filter(isPriced);
  const unpriced = lines.filter((line) => !isPriced(line));
  const tokens = tokenWords(usageIn(lines));
  const at = priced.length === 1
    ? `${priced[0]!.name}'s list price${bandWords(priced[0]!.cost.band)} (${priceWords(priced[0]!.cost.price, priced[0]!.usage)} per million tokens)`
    : `the list prices of ${and(priced.map((line) => line.name))}`;
  const none = `no list price on file for ${and(unpriced.map(noPriceWords))}`;
  if (unpriced.length === 0) return `${what}, ${about(nanoOf(priced))}: ${tokens}, at ${at}.`;
  if (priced.length === 0) return `${what}: ${tokens}; ${none}.`;
  return `${what}, ${about(nanoOf(priced))} for those with a list price on file: ${tokens}, at ${at}; ${none}.`;
}

// A page and its pictures together, once pictures were made: "In all,
// ≈ $0.14 for the page and its pictures"; a new site's, "for the site and
// its pictures".
export function allWords(tally: Tally, holder = "the page"): string | null {
  if (!tally.some((line) => line.kind !== "words")) return null;
  const priced = tally.filter(isPriced);
  if (priced.length === 0) return null;
  return `In all, ${about(nanoOf(priced))} for ${priced.length === tally.length ? `${holder} and its pictures` : "what has a list price on file"}.`;
}

// Every request since the key was connected, and the pictures made:
// "Since you connected this key: 2 requests and 3 photos, 6,288 tokens in
// and 2,830 out, ≈ $0.037."
export function totalWords(tally: Tally): string {
  const calls = tally.reduce((n, line) => n + line.calls, 0);
  const of = (kind: TallyKind): number => tally.filter((line) => line.kind === kind).reduce((n, line) => n + line.calls, 0);
  const kinds: Array<[TallyKind, string, string]> = [["words", "request", "requests"], ["photo", "photo", "photos"], ["illustration", "illustration", "illustrations"]];
  const made = kinds.filter(([kind]) => of(kind) > 0).map(([kind, one, many]) => plural(of(kind), one, many));
  const counts = and(made.length > 0 ? made : [plural(0, "request", "requests")]);
  const priced = tally.filter(isPriced);
  const pricedCalls = priced.reduce((n, line) => n + line.calls, 0);
  const cost = priced.length === 0 ? "with no list price on file"
    : pricedCalls === calls ? about(nanoOf(priced))
    : `${about(nanoOf(priced))} for the ${count(pricedCalls)} with a list price on file`;
  return `Since you connected this key: ${counts}, ${tokenWords(usageIn(tally))}, ${cost}.`;
}

// What every estimate leaves out, said under the total.
export const ESTIMATE_NOTE = "An estimate from the providers' list prices. The provider's bill is what counts: taxes, discounts and regional uplift are not included.";
