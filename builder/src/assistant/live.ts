// The cost of a run as it goes (./README.md, "What a request costs"): while
// the model writes a page or a new site, the drawer shows what it has cost
// so far, growing as the answer streams in, and each request's exact count
// takes the place of its estimate the moment the request ends.
//
// A request of a run (one bound to the key it began with, ./context.tsx) is
// in flight from the moment it is sent until its answer ends. Meanwhile:
// - Its input is the provider's own count as soon as the provider says it
//   (Anthropic's stream does as it begins, ./anthropic.ts). Until then, and
//   for OpenAI's stream, whose count comes only with its last piece, it is
//   estimated from the question's characters: its system words, its text
//   and its schema, all sent as input.
// - Its output is estimated from the characters of its answer streamed so
//   far. The thinking is billed as output but never streamed, so the ratio
//   takes it in: CHARS_PER_TOKEN characters a token at first, then, once a
//   request of the run has ended, the characters the run's requests
//   streamed over the output tokens the provider counted for them. The
//   input is estimated at a ratio of its own, made the same way.
// - A photo counts at its price per image (./prices.ts), the dearest on file
//   for its size where its model has none. An illustration is a streamed
//   request, and counts as the words do.
// Each estimate is priced as an exact count is (./tally.ts, tallyOf): at the
// model's list price for its prompt's length.
//
// A request that ends with the provider's count (an answer, a refused or
// cut one, a photo with its usage) has that count in place of its estimate.
// One that ends with none (stopped, failed before the provider said) has
// nothing: its estimate goes, and it is one whose cost is not known. The
// drawer is told at most every LIVE_MS while answers stream in, so that a
// stream does not draw it again for each piece; a request that begins or
// ends is told at once.
import type { Clock, ClockTimer } from "../storage/clock.ts";
import type { ProviderId } from "./key.ts";
import { dearestPerImage, dollars, imagePrice, liveDollars, type ImageQuality, type ImageSize, type Nano } from "./prices.ts";
import { NO_USAGE, type Question, type Usage } from "./providers.ts";
import { addTallies, linePriceWords, tallyOf, usageIn, type Tally, type TallyKind } from "./tally.ts";

// Characters a token, before a request of the run has been counted.
export const CHARS_PER_TOKEN = 4;
// The least time between two tellings while answers stream in: about four
// a second.
export const LIVE_MS = 250;

// Characters, and the tokens the provider counted for them, added up over
// the run's requests that ended: the ratio an estimate is made at.
export interface Ratio {
  chars: number;
  tokens: number;
}

export const NO_RATIO: Ratio = { chars: 0, tokens: 0 };

// Whether a request of the run has been counted into the ratio yet.
const measured = (ratio: Ratio): boolean => ratio.chars > 0 && ratio.tokens > 0;

export const charsPerToken = (ratio: Ratio): number => (measured(ratio) ? ratio.chars / ratio.tokens : CHARS_PER_TOKEN);

// The tokens `chars` characters come to at `ratio`: whole, rounded up.
export function tokensFor(chars: number, ratio: Ratio): number {
  if (chars <= 0) return 0;
  return measured(ratio) ? Math.ceil((chars * ratio.tokens) / ratio.chars) : Math.ceil(chars / CHARS_PER_TOKEN);
}

// The ratio with one request's count in it: its characters, and the tokens
// the provider counted for them. A request that streamed nothing, or was
// counted none, leaves it as it was.
export function calibrated(ratio: Ratio, chars: number, tokens: number): Ratio {
  return chars > 0 && tokens > 0 ? { chars: ratio.chars + chars, tokens: ratio.tokens + tokens } : ratio;
}

// What a question says, in characters: its system words, its text and its
// schema, each sent and counted as input. A picture sent with it is not.
export function questionChars(question: Pick<Question, "system" | "text" | "schema">): number {
  return question.system.length + question.text.length + JSON.stringify(question.schema).length;
}

// What a photo counts at while it is being made: its model's price per
// image at its quality and size, or else the dearest on file for its size;
// null where none is on file.
export function photoPrice(model: string, quality: ImageQuality, size: ImageSize): Nano | null {
  return imagePrice(model, quality, size) ?? dearestPerImage(size);
}

// A request in flight, with its estimate as it stands: its tokens so far,
// priced as an exact count is; a photo's are not known until its count
// comes, and it counts at its price per image meanwhile.
export interface Flying {
  id: number;
  provider: ProviderId;
  model: string;
  kind: TallyKind;
  usage: Usage;
  // Whether its input is the provider's own count, said as it began.
  inputSaid: boolean;
  tally: Tally;
  // A photo's price per image (null: none on file); null for the others.
  each: Nano | null;
}

// The cost of a run (Bound.run), as the drawer is told it: what each of its
// requests that ended came to, as the provider counted it, and the
// estimates of those in flight, together. The shape the drawer's line reads,
// and a larger meter may.
export interface RunCost {
  run: number;
  // Its requests that ended, as the provider counted them, priced.
  counted: Tally;
  // Those in flight, each with its estimate.
  flying: readonly Flying[];
  // How many ended with no count of the provider's (stopped, failed): what
  // they cost, if anything, is not known.
  uncounted: number;
  // The two together, line by line: each model at its price, for each kind
  // of thing, as ./tally.ts adds them up.
  lines: Tally;
  // Tokens in, of them cached and written to the cache, and out, counted
  // and estimated. A photo in flight adds none.
  usage: Usage;
  // What it all comes to at list price, in nano-dollars: the lines with a
  // price on file, and each photo in flight at its price per image.
  nano: Nano;
  // Whether a line, or a photo in flight, has no list price on file: its
  // tokens are counted, not its cost.
  unpriced: boolean;
  // Whether any part is still an estimate: a request is in flight.
  estimate: boolean;
}

export function costOf(run: number, counted: Tally, flying: readonly Flying[], uncounted: number): RunCost {
  const lines = addTallies(counted, ...flying.map((one) => one.tally));
  const photos = flying.filter((one) => one.kind === "photo");
  const nano = lines.reduce((sum, line) => sum + (line.cost.price === null ? 0 : line.cost.nano), 0) + photos.reduce((sum, one) => sum + (one.each ?? 0), 0);
  const unpriced = lines.some((line) => line.cost.price === null) || photos.some((one) => one.each === null);
  return { run, counted, flying, uncounted, lines, usage: usageIn(lines), nano, unpriced, estimate: flying.length > 0 };
}

// --------------------------------------------------------------- telling

// Runs `tell` at most once every `ms` however often it is poked: at once
// when `ms` has gone by since it last ran, else once it has. `now` runs it
// at once, and whatever was waiting with it.
export interface Throttle {
  poke(): void;
  now(): void;
}

export function throttle(clock: Clock, ms: number, tell: () => void): Throttle {
  let last: number | null = null;
  let timer: ClockTimer | null = null;
  const now = (): void => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    last = clock.now();
    tell();
  };
  return {
    poke() {
      if (timer !== null) return;
      const wait = last === null ? 0 : last + ms - clock.now();
      if (wait <= 0) now();
      else timer = clock.setTimeout(now, wait);
    },
    now,
  };
}

// --------------------------------------------------------------- the book

// What a request is, as it goes out: words or an illustration, with its
// question's characters; or a photo, with its price per image.
export type Asked =
  | { provider: ProviderId; model: string; kind: "words" | "illustration"; chars: number }
  | { provider: ProviderId; model: string; kind: "photo"; each: Nano | null };

// A request in flight, as the provider's hooks tell it how far it has come.
export interface LiveRequest {
  // The question's own count, as the provider said it: its output is left
  // to the characters streamed.
  said(input: Usage): void;
  // A piece of the answer, streamed.
  wrote(piece: string): void;
  // Its end: what the provider counted, priced (an empty tally: nothing),
  // in place of the estimate; or null, where it counted nothing.
  end(tally: Tally | null): void;
}

export interface LiveBook {
  // A run begins: its cost at nothing, its ratios at CHARS_PER_TOKEN. The
  // requests of the run before are no longer told.
  begin(run: number): void;
  // A request of `run` goes out. One of a run other than the one begun last
  // changes nothing.
  start(run: number, asked: Asked): LiveRequest;
}

interface InFlight {
  id: number;
  asked: Asked;
  said: Usage | null;
  streamed: number;
}

export function createLiveBook(clock: Clock, tell: (cost: RunCost) => void): LiveBook {
  let run: number | null = null;
  let counted: Tally = [];
  let uncounted = 0;
  let input = NO_RATIO;
  let output = NO_RATIO;
  let ids = 0;
  const flying = new Map<number, InFlight>();

  const estimate = ({ id, asked, said, streamed }: InFlight): Flying => {
    const { provider, model, kind } = asked;
    if (asked.kind === "photo") return { id, provider, model, kind, usage: NO_USAGE, inputSaid: false, tally: [], each: asked.each };
    const out = tokensFor(streamed, output);
    const usage = said !== null ? { ...said, output: out } : { input: tokensFor(asked.chars, input), cacheRead: 0, cacheWrite: 0, output: out };
    return { id, provider, model, kind, usage, inputSaid: said !== null, tally: tallyOf(provider, model, usage, kind), each: null };
  };
  const telling = throttle(clock, LIVE_MS, () => {
    if (run !== null) tell(costOf(run, counted, [...flying.values()].map(estimate), uncounted));
  });

  return {
    begin(next) {
      run = next;
      counted = [];
      uncounted = 0;
      input = NO_RATIO;
      output = NO_RATIO;
      flying.clear();
      telling.now();
    },
    start(of, asked) {
      const request: InFlight = { id: ++ids, asked, said: null, streamed: 0 };
      if (of === run) {
        flying.set(request.id, request);
        telling.now();
      }
      const going = (): boolean => flying.get(request.id) === request;
      return {
        said(usage) {
          if (!going()) return;
          request.said = { ...usage, output: 0 };
          telling.poke();
        },
        wrote(piece) {
          if (!going()) return;
          request.streamed += piece.length;
          telling.poke();
        },
        end(tally) {
          if (!going()) return;
          flying.delete(request.id);
          if (tally === null) uncounted += 1;
          else {
            counted = addTallies(counted, tally);
            if (asked.kind !== "photo") {
              const used = usageIn(tally);
              input = calibrated(input, asked.chars, used.input + used.cacheRead + used.cacheWrite);
              output = calibrated(output, request.streamed, used.output);
            }
          }
          telling.now();
        },
      };
    },
  };
}

// --------------------------------------------------------------- words

const count = (n: number): string => n.toLocaleString("en-US");
const and = (words: readonly string[]): string => (words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);

// What the line says of every figure on it.
export const LIVE_NOTE = "live estimate, exact as each request ends";
// The sample's line, while it is built: no model is asked.
export const SAMPLE_SPENDS = "A sample written by hand: nothing is spent.";

// What of a run's cost has a list price on file, and the models whose
// tokens are counted with none: a line's, or a photo's in flight.
function pricing(cost: RunCost): { priced: boolean; none: string[] } {
  const photos = cost.flying.filter((one) => one.kind === "photo");
  return {
    priced: cost.lines.some((line) => line.cost.price !== null) || photos.some((one) => one.each !== null),
    none: [...new Set([...cost.lines.filter((line) => line.cost.price === null).map((line) => line.name), ...photos.filter((one) => one.each === null).map((one) => one.model)])],
  };
}

// A run's cost as the run window's meter says it (../editor/AssistantRun.tsx),
// each figure apart: the dollars, to four decimals, of what has a list price
// on file (nothing yet, $0.0000; null where what there is has none); the
// tokens in, of them cached and
// written to the cache, and out; each model at its list price; the photos
// being made, counted at their price per image; the models with no list
// price on file; and the requests that ended before the provider counted
// them, whose cost is not known.
export interface MeterWords {
  amount: string | null;
  tokensIn: string;
  cached: string | null;
  tokensOut: string;
  prices: readonly string[];
  unpriced: string | null;
  photos: string | null;
  uncounted: string | null;
}

export function meterWords(cost: RunCost): MeterWords {
  const { priced, none } = pricing(cost);
  const photos = cost.flying.filter((one) => one.kind === "photo");
  const each = photos.flatMap((one) => (one.each === null ? [] : [one.each]));
  const kinds: Array<[number, string]> = [[cost.usage.cacheRead, "cached"], [cost.usage.cacheWrite, "written to the cache"]];
  const cache = kinds.filter(([n]) => n > 0).map(([n, what], at) => `${count(n)}${at === 0 ? " of them" : ""} ${what}`);
  const one = photos.length === 1;
  const nothing = cost.lines.length === 0 && photos.length === 0;
  return {
    amount: priced || nothing ? liveDollars(cost.nano) : null,
    tokensIn: count(cost.usage.input + cost.usage.cacheRead + cost.usage.cacheWrite),
    cached: cache.length === 0 ? null : cache.join(" and "),
    tokensOut: count(cost.usage.output),
    prices: [...new Set(cost.lines.flatMap((line) => linePriceWords(line) ?? []))],
    unpriced: none.length === 0 ? null : `No list price on file for ${and(none)}: ${none.length === 1 ? "its tokens are counted, not its cost" : "their tokens are counted, not their cost"}.`,
    photos: photos.length === 0 ? null
      : each.length === 0 ? `${photos.length} ${one ? "photo" : "photos"} being made, with no price per image on file`
      : `${photos.length} ${one ? "photo" : "photos"} being made, counted at ${one ? "its" : "their"} price per image: ${dollars(each.reduce((sum, nano) => sum + nano, 0))}`,
    uncounted: cost.uncounted === 0 ? null
      : cost.uncounted === 1 ? "1 request ended before the provider counted it: what it cost, if anything, is not known."
      : `${count(cost.uncounted)} requests ended before the provider counted them: what they cost, if anything, is not known.`,
  };
}

// A run's cost as the drawer's line says it while the run goes: "≈ $0.0123
// so far · 3,144 tokens in, 1,215 out · live estimate, exact as each
// request ends". What has no list price on file is said; so are the photos
// in flight, counted at their price per image.
export function liveWords(cost: RunCost): string {
  const photos = cost.flying.filter((one) => one.kind === "photo");
  const { priced, none } = pricing(cost);
  const tokens = `${count(cost.usage.input + cost.usage.cacheRead + cost.usage.cacheWrite)} tokens in, ${count(cost.usage.output)} out`;
  const parts = !priced && none.length > 0
    ? [`No list price on file for ${and(none)}`, `${tokens} so far`]
    : [`≈ ${liveDollars(cost.nano)} so far${none.length > 0 ? " for what has a list price on file" : ""}`, tokens];
  if (photos.length > 0) parts.push(`${photos.length} ${photos.length === 1 ? "photo at its" : "photos at their"} price per image`);
  return [...parts, LIVE_NOTE].join(" · ");
}
