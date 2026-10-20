// The providers' list prices, from which the Assistant estimates what each
// request cost (./README.md, "What a request costs"): the tables of the two
// official pages (PRICE_PAGES) as they stood on PRICES_READ, in US dollars
// per million tokens, at the standard tier.
// - Anthropic's: base input, five-minute cache write, cache read, output.
//   Claude Haiku 5.5 has a dearer price for a prompt over 100,000 tokens,
//   its cache reads and writes counted in the prompt.
// - OpenAI's: input, cached input, cache writes, output, for a prompt of
//   up to 272,000 tokens. Past that no price is on file here, and only the
//   tokens are said. Where the page gives a dash for cached input or for
//   cache writes, those tokens are counted at the input price.
// - The image models' (text in, image in, image out), for the pictures a
//   later step makes; nothing asks for them yet.
// A model the tables do not hold has no list price on file, whatever its
// name is like: a dated snapshot has a price only where a page gives that
// snapshot one, and neither page prices a snapshot as its model.
//
// A price is kept as a whole number of nano-dollars (billionths of a dollar)
// per token, which is the page's dollars per million tokens times a thousand:
// "$0.005" is 5, "$12.50" is 12,500. Every price on both pages is a whole
// number of them, so what a call comes to is whole numbers multiplied and
// added, exact, and is rounded only when it is written. A number holds whole
// numbers exactly up to 2^53: nine million dollars.
import type { ProviderId } from "./key.ts";
import type { Usage } from "./providers.ts";

// The day the two pages were read. ./prices.test.ts fails once it is more
// than 120 days old: read the pages again then, and bring the tables and
// this date up to date.
export const PRICES_READ = "2026-10-20";

export const PRICE_PAGES: Readonly<Record<ProviderId, string>> = {
  anthropic: "https://platform.claude.com/docs/en/about-claude/pricing",
  openai: "https://developers.openai.com/api/docs/pricing",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

// "2026-10-20" as the interface says it: "20 Oct 2026".
export function dayWords(iso: string): string {
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = found ? MONTHS[Number(found[2]) - 1] : undefined;
  if (!found || month === undefined) throw new Error(`"${iso}" is not a day written as YYYY-MM-DD`);
  return `${Number(found[3])} ${month} ${found[1]}`;
}

export const PRICES_DAY = dayWords(PRICES_READ);

// Nano-dollars: billionths of a dollar, always whole.
export type Nano = number;

// A model's price for each kind of token, in nano-dollars per token.
export interface Price {
  input: Nano;
  // Input read from the provider's prompt cache.
  cacheRead: Nano;
  // Input written to it: Anthropic's five-minute cache; OpenAI's at the
  // page's price, or the input price where the page gives a dash.
  cacheWrite: Nano;
  // Output, the model's thinking or reasoning included, as both providers bill it.
  output: Nano;
}

// "$12.50" per million tokens as nano-dollars per token: 12,500. Only whole
// thousandths of a dollar, which every price on the two pages is.
export function perToken(dollars: string): Nano {
  const found = /^(\d+)(?:\.(\d{1,3}))?$/.exec(dollars);
  if (!found) throw new Error(`"${dollars}" is not a price in dollars per million tokens, to a thousandth of a dollar`);
  return Number(found[1]) * 1000 + Number((found[2] ?? "").padEnd(3, "0"));
}

// A model of the tables: its name as the words say it, its price, and,
// where the page sets one, the longest prompt that price holds for and the
// price past it (null: none on file).
interface Row {
  name: string;
  price: Price;
  limit?: { tokens: number; past: Price | null };
}

// Anthropic's columns, in the page's order: base input, five-minute cache
// write, cache read, output. A model is named as the page names it.
type AnthropicColumns = readonly [id: string, name: string, input: string, cacheWrite: string, cacheRead: string, output: string];
const ANTHROPIC_TABLE: readonly AnthropicColumns[] = [
  ["claude-fable-5-1", "Claude Fable 5.1", "10", "12.50", "0.25", "50"],
  // Of limited availability, as Claude Mythos 5 is: offered when a key may use it.
  ["claude-mythos-5-1", "Claude Mythos 5.1", "10", "12.50", "0.25", "50"],
  ["claude-fable-5", "Claude Fable 5", "10", "12.50", "1", "50"],
  ["claude-mythos-5", "Claude Mythos 5", "10", "12.50", "1", "50"],
  ["claude-opus-5-5", "Claude Opus 5.5", "4", "5", "0.20", "20"],
  ["claude-opus-5", "Claude Opus 5", "5", "6.25", "0.50", "25"],
  ["claude-opus-4-8", "Claude Opus 4.8", "5", "6.25", "0.50", "25"],
  ["claude-opus-4-7", "Claude Opus 4.7", "5", "6.25", "0.50", "25"],
  ["claude-opus-4-6", "Claude Opus 4.6", "5", "6.25", "0.50", "25"],
  ["claude-sonnet-5-5", "Claude Sonnet 5.5", "2", "2.50", "0.10", "10"],
  ["claude-sonnet-5", "Claude Sonnet 5", "2", "2.50", "0.20", "10"],
  ["claude-sonnet-4-6", "Claude Sonnet 4.6", "3", "3.75", "0.30", "15"],
  // For a prompt of up to 100,000 tokens; HAIKU_LONG past that.
  ["claude-haiku-5-5", "Claude Haiku 5.5", "0.10", "0.125", "0.01", "0.50"],
];
const HAIKU_LONG = { model: "claude-haiku-5-5", tokens: 100_000, columns: ["0.50", "0.625", "0.05", "2.50"] } as const;

const claude = (input: string, cacheWrite: string, cacheRead: string, output: string): Price => ({
  input: perToken(input),
  cacheRead: perToken(cacheRead),
  cacheWrite: perToken(cacheWrite),
  output: perToken(output),
});

const ANTHROPIC = new Map<string, Row>(ANTHROPIC_TABLE.map(([id, name, input, cacheWrite, cacheRead, output]) => {
  const row: Row = { name, price: claude(input, cacheWrite, cacheRead, output) };
  if (id === HAIKU_LONG.model) row.limit = { tokens: HAIKU_LONG.tokens, past: claude(...HAIKU_LONG.columns) };
  return [id, row];
}));

// OpenAI's columns, in the page's order: input, cached input, cache
// writes, output, standard tier, for a prompt of up to OPENAI_LIMIT
// tokens. A model is named by its id. Where the page gives a dash (null),
// the estimate counts those tokens at the input price: the page gives no
// other.
export const OPENAI_LIMIT = 272_000;
type OpenAIColumns = readonly [id: string, input: string, cachedInput: string | null, cacheWrites: string | null, output: string];
const OPENAI_TABLE: readonly OpenAIColumns[] = [
  ["gpt-6-astra", "10", "1", "12.50", "50"],
  ["gpt-6.1-sol", "2", "0.10", "2.50", "10"],
  ["gpt-6-luna", "0.10", "0.01", "0.125", "0.50"],
  ["gpt-6-sol", "2", "0.20", "2.50", "10"],
  // Promotional, "at least through November 21, 2026", the page says.
  ["gpt-5.6-sol", "4", "0.40", "5", "20"],
  ["gpt-5.6-terra", "2", "0.20", "2.50", "12"],
  ["gpt-5.6-luna", "0.20", "0.02", "0.25", "1.20"],
  ["gpt-5.5", "5", "0.50", null, "30"],
  ["gpt-5.5-pro", "30", null, null, "180"],
  ["gpt-5.4", "2.50", "0.25", null, "15"],
  ["gpt-5.4-mini", "0.75", "0.075", null, "4.50"],
  ["gpt-5.4-nano", "0.20", "0.02", null, "1.25"],
  ["gpt-5.4-pro", "30", null, null, "180"],
  ["gpt-5.2", "1.75", "0.175", null, "14"],
  ["gpt-5.2-pro", "21", null, null, "168"],
  ["gpt-5.1", "1.25", "0.125", null, "10"],
  ["gpt-5", "1.25", "0.125", null, "10"],
  ["gpt-5-mini", "0.25", "0.025", null, "2"],
  ["gpt-5-nano", "0.05", "0.005", null, "0.40"],
  ["gpt-5-pro", "15", null, null, "120"],
  ["gpt-4.1", "2", "0.50", null, "8"],
  ["gpt-4.1-mini", "0.40", "0.10", null, "1.60"],
  ["gpt-4.1-nano", "0.10", "0.025", null, "0.40"],
  ["gpt-4o", "2.50", "1.25", null, "10"],
  // A dated snapshot the page prices by its own id.
  ["gpt-4o-2024-05-13", "5", null, null, "15"],
  ["gpt-4o-mini", "0.15", "0.075", null, "0.60"],
  ["o3-pro", "20", null, null, "80"],
  ["o3", "2", "0.50", null, "8"],
  ["o4-mini", "1.10", "0.275", null, "4.40"],
  ["o3-mini", "1.10", "0.55", null, "4.40"],
];

const OPENAI = new Map<string, Row>(OPENAI_TABLE.map(([id, input, cachedInput, cacheWrites, output]) => [id, {
  name: id,
  price: { input: perToken(input), cacheRead: perToken(cachedInput ?? input), cacheWrite: perToken(cacheWrites ?? input), output: perToken(output) },
  limit: { tokens: OPENAI_LIMIT, past: null },
}]));

const TABLES: Readonly<Record<ProviderId, ReadonlyMap<string, Row>>> = { anthropic: ANTHROPIC, openai: OPENAI };

// The models each provider's table prices, in the table's order.
export function pricedModels(provider: ProviderId): string[] {
  return [...TABLES[provider].keys()];
}

// Which side of a model's limit a call's prompt was, for a model priced on both.
export interface Band {
  over: boolean;
  tokens: number;
}

export type ListPrice =
  | { name: string; price: Price; band: Band | null }
  // No price on file: for the model, or for a prompt past its table's limit.
  | { name: string; price: null; why: "model" }
  | { name: string; price: null; why: "prompt"; tokens: number };

// The list price of a call to `model` whose prompt was `prompt` tokens long,
// what was read from the cache and written to it included, as both pages
// count a prompt. Each call is priced on its own: one prompt past a limit
// changes that call's price only.
export function listPrice(provider: ProviderId, model: string, prompt: number): ListPrice {
  const row = TABLES[provider].get(model);
  if (row === undefined) return { name: model, price: null, why: "model" };
  const { limit } = row;
  if (limit === undefined) return { name: row.name, price: row.price, band: null };
  if (prompt <= limit.tokens) return { name: row.name, price: row.price, band: limit.past === null ? null : { over: false, tokens: limit.tokens } };
  if (limit.past === null) return { name: row.name, price: null, why: "prompt", tokens: limit.tokens };
  return { name: row.name, price: limit.past, band: { over: true, tokens: limit.tokens } };
}

// What a call's tokens come to at `price`: exact.
export function costAt(price: Price, usage: Usage): Nano {
  return usage.input * price.input + usage.cacheRead * price.cacheRead + usage.cacheWrite * price.cacheWrite + usage.output * price.output;
}

// The image models', per million tokens: text in, image in where the page
// gives it, image out. For the pictures a later step makes.
export interface ImagePrice {
  textInput: Nano;
  imageInput: Nano | null;
  imageOutput: Nano;
}

type ImageColumns = readonly [id: string, textInput: string, imageInput: string | null, imageOutput: string];
const IMAGE_TABLE: readonly ImageColumns[] = [
  ["gpt-image-2", "5", "8", "30"],
  ["gpt-image-2.5-sunburst", "5", "8", "30"],
  ["gpt-image-2.5-flare", "5", "8", "30"],
  ["gpt-image-1.5", "5", null, "32"],
  ["gpt-image-1-mini", "2", null, "8"],
];

export const IMAGE_PRICES: ReadonlyMap<string, ImagePrice> = new Map(IMAGE_TABLE.map(([id, textInput, imageInput, imageOutput]) => [id, {
  textInput: perToken(textInput),
  imageInput: imageInput === null ? null : perToken(imageInput),
  imageOutput: perToken(imageOutput),
}]));

// ------------------------------------------------------------ written out

const HUNDREDTH_OF_A_CENT = 100_000;
const CENT = 10_000_000;
const DOLLAR = 1_000_000_000;

// `n` to the nearest multiple of `unit`, a half going up: whole numbers, exact.
function nearest(n: number, unit: number): number {
  const rest = n % unit;
  return n - rest + (rest * 2 >= unit ? unit : 0);
}

// Nano-dollars as dollars, digit for digit, the zeros at the end taken off
// down to `keep` decimals.
function decimals(nano: Nano, keep: number): string {
  const digits = String(nano).padStart(10, "0");
  const whole = Number(digits.slice(0, -9)).toLocaleString("en-US");
  let fraction = digits.slice(-9);
  while (fraction.length > keep && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

// An amount as the interface writes it: from a dollar, to the cent
// ("≈ $1.25"); under a dollar, to two significant figures ("≈ $0.021",
// "≈ $0.13"); under a cent, said so, with its figures ("under $0.01
// ($0.0042)"), down to a hundredth of a cent.
export function about(nano: Nano): string {
  if (nano <= 0) return "$0.00";
  const shown = nearest(nano, 10 ** Math.max(0, String(nano).length - 2));
  if (shown >= DOLLAR) return `≈ $${decimals(nearest(nano, CENT), 2)}`;
  if (shown >= CENT) return `≈ $${decimals(shown, 2)}`;
  if (shown >= HUNDREDTH_OF_A_CENT) return `under $0.01 ($${decimals(shown, 0)})`;
  return "under $0.01 (less than $0.0001)";
}

// A price as the pages write it, per million tokens: "$2", "$0.10",
// "$12.50", "$0.125", "$0.005".
export function perMillion(price: Nano): string {
  const rest = price % 1000;
  const whole = (price - rest) / 1000;
  if (rest === 0) return `$${whole}`;
  const fraction = String(rest).padStart(3, "0");
  return `$${whole}.${fraction.endsWith("0") ? fraction.slice(0, -1) : fraction}`;
}
