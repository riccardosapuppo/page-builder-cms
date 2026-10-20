// Pictures made for a page (./README.md, "Pictures made for a page"): what
// each provider's key makes, the size each shape is made at, the name a
// picture is uploaded under, and what its bytes are.
//
// - OpenAI's key makes photos, with its newest GPT Image model the key may
//   use (./openai.ts, photos), at a cost of their own, shown before.
// - Anthropic's models make no images: with Anthropic's key, the model the
//   person chose draws illustrations, an SVG each, in the site's colours,
//   cleaned (./svg.ts) and drawn to a picture in the browser (./draw.ts).
import type { ImageType } from "../storage/adapter.ts";
import type { ProviderId } from "./key.ts";
import type { PlanShape } from "./plan.ts";
import type { ImageSize } from "./prices.ts";

export type PictureKind = "photo" | "illustration";

export const PICTURE_KINDS: Readonly<Record<ProviderId, PictureKind>> = { anthropic: "illustration", openai: "photo" };

// The size each shape is made at, in pixels: the GPT Image models' three
// standard sizes, at which illustrations are drawn too.
export const PICTURE_SIZES: Readonly<Record<PlanShape, { width: number; height: number }>> = {
  landscape: { width: 1536, height: 1024 },
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1536 },
};

// "1536x1024", as the Images API names a size.
export const sizeName = (shape: PlanShape): ImageSize => `${PICTURE_SIZES[shape].width}x${PICTURE_SIZES[shape].height}` as ImageSize;

// The viewBox an illustration of each shape is drawn in: small numbers,
// few tokens.
export const VIEW_BOXES: Readonly<Record<PlanShape, string>> = { landscape: "0 0 600 400", square: "0 0 400 400", portrait: "0 0 400 600" };

const EXTENSIONS: Readonly<Record<MadeType, string>> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

// The kinds a picture made for a page may come as.
export type MadeType = Extract<ImageType, "image/webp" | "image/png" | "image/jpeg">;

// What an image's bytes are, from their first ones: a WebP, a PNG or a
// JPEG, or null for anything else.
export function sniffImage(bytes: Uint8Array): MadeType | null {
  const starts = (at: number, ...values: number[]): boolean => values.every((value, index) => bytes[at + index] === value);
  const ascii = (at: number, text: string): boolean => starts(at, ...[...text].map((c) => c.charCodeAt(0)));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";
  if (starts(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  return null;
}

// Words as a file's name: lower case, letters and digits joined by hyphens.
const slug = (words: string): string => words.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The name a picture is uploaded under: the page's, then what it shows,
// "open-day-a-coach-beside-a-swimmer.webp", at most 80 characters.
export function pictureName(page: string, shows: string, type: MadeType): string {
  const words = slug(shows).split("-").filter(Boolean).slice(0, 8).join("-");
  const stem = [slug(page), words].filter(Boolean).join("-").slice(0, 75).replace(/-+$/, "") || "picture";
  return `${stem}.${EXTENSIONS[type]}`;
}
