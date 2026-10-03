// The rules the renderer applies to every address it writes into a page:
// links, image sources, and the players and maps a visitor can load. The
// twin of cms/app/models/render_policy.rb, rule for rule; the render
// contract and the random-page agreement check hold the two to the same
// output, and twins.rails.test.ts runs both on the same generated values.
//
// The schema already refuses a document with a bad address, so on a valid
// document these rules change nothing. They are the last check before the
// page or the canvas shows the value, for a document that reached the
// renderer some other way: an address they refuse is dropped, never
// repaired, and the text around it stays.

// The characters an address may hold after its scheme and host, as the
// schema's href lists them: no space, no control character, no quote or
// angle bracket, and no backslash, which browsers read as a slash.
const CHAR = "(?:[A-Za-z0-9._~!$&'()*+,;=:@/?#-]|%[0-9A-Fa-f]{2})";
const HOST = "[A-Za-z0-9.-]+(?::[0-9]{1,5})?";
// https, http and mailto in lowercase, tel, a site path (never //host), a
// query or a fragment. `$` without the m flag is the end of the string, as
// Ruby's \z is.
const LINK = new RegExp(`^(?:https?://${HOST}(?:[/?#]${CHAR}*)?|mailto:${CHAR}+|tel:\\+?[0-9][0-9().-]{0,31}|/(?!/)${CHAR}*|[?#]${CHAR}*)$`);
// An image from another site: https only (no mixed content), or a site path.
const IMAGE = new RegExp(`^(?:https://${HOST}(?:[/?#]${CHAR}*)?|/(?!/)${CHAR}+)$`);
export const MAX_URL_LENGTH = 2048;

interface VideoRule {
  origin: string;
  id: RegExp;
  path: (id: string) => string;
}

// The providers the schema allows, the id each takes, and the player
// address built from it. A Map, so a provider named "__proto__" or
// "constructor" finds nothing, as it finds nothing in Ruby's Hash.
const VIDEO: ReadonlyMap<string, VideoRule> = new Map([
  ["youtube", { origin: "https://www.youtube-nocookie.com", id: /^[A-Za-z0-9_-]{11}$/, path: (id: string) => `/embed/${id}` }],
  ["vimeo", { origin: "https://player.vimeo.com", id: /^[0-9]{1,12}$/, path: (id: string) => `/video/${id}?dnt=1` }],
]);

const MAP_ORIGIN = "https://www.openstreetmap.org";

// Every origin a page may frame.
export const FRAME_ORIGINS: readonly string[] = [...[...VIDEO.values()].map((rule) => rule.origin), MAP_ORIGIN];

// The href to write, or null to write the text without a link.
export function linkHref(value: unknown): string | null {
  return isUrl(value, LINK) ? value : null;
}

// The src of an image from another site, or null to leave the image out.
export function imageSrc(value: unknown): string | null {
  return isUrl(value, IMAGE) ? value : null;
}

// The player address for a provider and video id, or null.
export function videoSrc(provider: unknown, videoId: unknown): string | null {
  const rule = typeof provider === "string" ? VIDEO.get(provider) : undefined;
  if (!rule || typeof videoId !== "string" || !rule.id.test(videoId)) return null;
  return rule.origin + rule.path(videoId);
}

export function isVideoProvider(provider: unknown): provider is string {
  return typeof provider === "string" && VIDEO.has(provider);
}

// A section's anchor, the id #anchor links scroll to, or null.
export function anchor(value: unknown): string | null {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value) ? value : null;
}

// The map address for a point and a zoom level, or null: an area about 800
// by 450 pixels at that zoom, centred on the point, with a marker on it.
// Every operation is the server's, in its order, so the doubles are the
// same; the numbers are written with six decimals as Ruby's format writes
// them (decimal, below).
export function mapSrc(latitude: unknown, longitude: unknown, zoom: unknown): string | null {
  if (!isFinite(latitude) || !isFinite(longitude) || !Number.isInteger(zoom)) return null;
  const z = zoom as number;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || z < 1 || z > 19) return null;

  const halfWidth = ((360 / 2 ** z) * 400) / 256;
  const halfHeight = ((halfWidth * 450) / 800) * Math.cos((Math.min(Math.abs(latitude), 85) * Math.PI) / 180);
  // Zoomed far out, the area is cut at the meridian 180 and at 85 degrees,
  // where the map itself ends.
  const box = [
    Math.max(longitude - halfWidth, -180), Math.max(latitude - halfHeight, -85),
    Math.min(longitude + halfWidth, 180), Math.min(latitude + halfHeight, 85),
  ];
  return `${MAP_ORIGIN}/export/embed.html?bbox=${box.map(decimal).join("%2C")}&layer=mapnik&marker=${decimal(latitude)}%2C${decimal(longitude)}`;
}

// A number with 6 decimals, never "-0.000000", as Ruby's format("%.6f")
// writes it, which is not always the exact value of the double correctly
// rounded (what toFixed writes, but for its ties):
// - Ruby first tries to make the digits with double arithmetic, and takes a
//   value whose remainder after the sixth decimal is within its error
//   bound of one half as exactly half way, and rounds it to the even digit.
//   149.8070625000000007 (141.018 plus a zoom 6 half width) is a little
//   over half way, and Ruby writes 149.807062 where the nearest is
//   149.807063; 1/128 (0.0078125), exactly half way, is 0.007812 in Ruby
//   and 0.007813 by toFixed.
// - Everything else is the exact value, correctly rounded.
// rubyTakesAsHalf below makes the same double operations, in the same
// order, to find the values Ruby takes as half way;
// twins.rails.test.ts holds the result to Ruby's own on values on both
// sides of that bound.
export function decimal(number: number): string {
  const text = fixed6(number);
  return text === "-0.000000" ? "0.000000" : text;
}

const SCALE = 1_000_000n;
const DECIMALS = 6;
// 1e0 to 1e22, the powers of ten a double holds exactly.
const TENS = Array.from({ length: 23 }, (_, power) => Number(`1e${power}`));

interface DoubleParts {
  // The biased exponent field (0 for zero and subnormals).
  biased: number;
  // |value| = mantissa * 2^exponent, exactly.
  mantissa: bigint;
  exponent: number;
  // The value with its exponent set to 0: a number in [1, 2).
  scaled: number;
}

function partsOf(value: number): DoubleParts {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(value));
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  view.setBigUint64(0, (1023n << 52n) | fraction);
  return {
    biased,
    mantissa: biased === 0 ? fraction : fraction | (1n << 52n),
    exponent: (biased === 0 ? 1 : biased) - 1075,
    scaled: view.getFloat64(0),
  };
}

// Whether Ruby's formatting takes |value| as half way between two values of
// the last decimal. Its fast way applies when the number of digits it must
// make (those before the point and the 6 after) is 0 to 14, from an
// estimate of the decimal exponent; then it scales the value to one digit
// before the point, makes the digits one at a time, and compares the
// remainder with one half, allowing for the error its arithmetic can have
// made. The comparison is the one place its answer can differ from the
// exact value's.
function rubyTakesAsHalf(parts: DoubleParts, value: number): boolean {
  if (parts.biased === 0) return false;
  const estimate = (parts.scaled - 1.5) * 0.289529654602168 + 0.1760912590558 + (parts.biased - 1023) * 0.301029995663981;
  let k = Math.trunc(estimate);
  if (estimate < 0 && estimate !== k) k -= 1;
  let checked = false;
  if (k >= 0 && k <= 22) {
    if (value < TENS[k]!) k -= 1;
    checked = true;
  }
  let digits = DECIMALS + k + 1;
  if (digits < 0 || digits > 14) return false;
  // Within 0 to 14 digits, k is between -7 and 7: one power of ten scales it.
  let errors = 2;
  let d = value;
  if (k > 0) d /= TENS[k]!;
  else if (k < 0) d *= TENS[-k]!;
  if (!checked && d < 1 && digits > 0) {
    if (digits - 1 <= 0) return false;
    digits -= 1;
    d *= 10;
    errors += 1;
  }
  if (digits === 0) return false;
  let bound = (errors * d + 7) / 2 ** 52;
  bound *= TENS[digits - 1]!;
  for (let i = 1; ; i += 1, d *= 10) {
    d -= Math.trunc(d);
    if (d === 0) return false;
    if (i === digits) return !(d > 0.5 + bound) && !(d < 0.5 - bound);
  }
}

function fixed6(number: number): string {
  if (!Number.isFinite(number)) throw new RangeError(`decimal: ${number} is not a finite number`);
  const negative = number < 0 || Object.is(number, -0);
  const value = Math.abs(number);
  const parts = partsOf(value);

  let scaled: bigint;
  if (parts.exponent >= 0) {
    scaled = (parts.mantissa << BigInt(parts.exponent)) * SCALE;
  } else {
    const denominator = 1n << BigInt(-parts.exponent);
    const numerator = parts.mantissa * SCALE;
    const quotient = numerator / denominator;
    const twice = (numerator % denominator) * 2n;
    const odd = quotient % 2n === 1n;
    const up = rubyTakesAsHalf(parts, value) ? odd : twice > denominator || (twice === denominator && odd);
    scaled = up ? quotient + 1n : quotient;
  }
  const whole = scaled / SCALE;
  const decimals = (scaled % SCALE).toString().padStart(6, "0");
  return `${negative ? "-" : ""}${whole}.${decimals}`;
}

function isUrl(value: unknown, pattern: RegExp): value is string {
  // Ruby counts characters, JavaScript UTF-16 units; only an address over
  // the limit in units can differ, and only by its astral characters.
  return typeof value === "string" && (value.length <= MAX_URL_LENGTH || [...value].length <= MAX_URL_LENGTH) && pattern.test(value);
}

// Ruby's Numeric (an Integer or a Float of the JSON) that is finite.
function isFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
