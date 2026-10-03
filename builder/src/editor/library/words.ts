// The media library's words, in the editor's one locale, en-US: how many
// images there are, one image's size and day, and who still shows an image
// the CMS would not delete. Plain functions of their arguments, the
// clock's time among them, so the tests give the time they mean.
import type { MediaItem, MediaUse, PageSummary } from "../../storage/adapter.ts";
import { bytesText } from "./files.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "A", "A and B", "A, B and C".
export function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

// "10 images, 2 without alt text, 1 uploading", leaving out what is none.
export function countLine(images: number, withoutAlt: number, uploading: number): string {
  return [plural(images, "image"), withoutAlt > 0 ? `${withoutAlt} without alt text` : null, uploading > 0 ? `${uploading} uploading` : null]
    .filter((part) => part !== null)
    .join(", ");
}

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (at: number, timeZone: string | undefined) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

// "Added today", "Added yesterday", "Added Sep 12", "Added Dec 30, 2025".
export function addedOn(iso: string, now: number, timeZone?: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return `Added ${iso}`;
  if (day(at, timeZone) === day(now, timeZone)) return "Added today";
  if (day(at, timeZone) === day(now - DAY_MS, timeZone)) return "Added yesterday";
  const sameYear = day(at, timeZone).slice(0, 4) === day(now, timeZone).slice(0, 4);
  return `Added ${new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(at)}`;
}

// "1600 × 1200, 84 KB. Added Sep 12."
export function metaLine(item: MediaItem, now: number, timeZone?: string): string {
  return `${item.width} × ${item.height}, ${bytesText(item.byteSize)}. ${addedOn(item.createdAt, now, timeZone)}.`;
}

// Why the CMS kept an image it was asked to delete: the pages whose draft
// shows it, by title, and the kept versions that do, by page and number.
// A page the editor does not list (made since) is named by its number.
export function inUseSentence(usedBy: MediaUse, pages: readonly PageSummary[]): string {
  const title = (id: number) => pages.find((p) => p.id === id)?.title ?? `page ${id}`;
  const drafts = usedBy.pages.map((page) => page.title || title(page.id));
  const byPage = new Map<number, number[]>();
  for (const version of usedBy.versions) byPage.set(version.pageId, [...(byPage.get(version.pageId) ?? []), version.number]);
  const versions = [...byPage].map(([id, numbers]) => `${title(id)} (${listed(numbers.map(String))})`);
  const parts: string[] = [];
  if (drafts.length > 0) parts.push(`${drafts.length === 1 ? "the page" : "the pages"} ${listed(drafts)}`);
  if (versions.length > 0) parts.push(`${usedBy.versions.length === 1 ? "a kept version" : "kept versions"} of ${listed(versions)}`);
  const where = parts.length > 0 ? parts.join(", and ") : "a page";
  const advice = drafts.length === 0 ? null : drafts.length === 1 ? "Take it off that page first." : "Take it off those pages first.";
  const kept = versions.length > 0 ? "A kept version holds its images for as long as it is kept." : null;
  return ["Not deleted: it is still shown by", `${where}.`, advice, kept].filter((part) => part !== null).join(" ");
}
