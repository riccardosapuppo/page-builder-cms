// The media library's words, in the editor's one locale, en-US: how many
// images there are, one image's size and day, and who still shows an image
// the CMS would not delete. Plain functions of their arguments, the
// clock's time among them, so the tests give the time they mean.
import type { MediaItem, MediaUse, PageSummary } from "../../storage/adapter.ts";
import { dayWords, listed } from "../plain-words.ts";
import { bytesText } from "./files.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "10 images, 2 without alt text, 1 uploading", leaving out what is none.
export function countLine(images: number, withoutAlt: number, uploading: number): string {
  return [plural(images, "image"), withoutAlt > 0 ? `${withoutAlt} without alt text` : null, uploading > 0 ? `${uploading} uploading` : null]
    .filter((part) => part !== null)
    .join(", ");
}

// "Added today", "Added yesterday", "Added Sep 12", "Added Dec 30, 2025".
export function addedOn(iso: string, now: number, timeZone?: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return `Added ${iso}`;
  const day = dayWords(at, now, timeZone);
  return `Added ${day === "Today" || day === "Yesterday" ? day.toLowerCase() : day}`;
}

// "1600 × 1200, 84 KB. Added Sep 12."
export function metaLine(item: MediaItem, now: number, timeZone?: string): string {
  return `${item.width} × ${item.height}, ${bytesText(item.byteSize)}. ${addedOn(item.createdAt, now, timeZone)}.`;
}

// Why the CMS kept an image it was asked to delete: the pages whose draft
// shows it, by title, the kept versions that do, by page and number, and
// the entries of a collection that do, in their draft or in what is live,
// by title. A page the editor does not list (made since) is named by its
// number.
export function inUseSentence(usedBy: MediaUse, pages: readonly PageSummary[]): string {
  const title = (id: number) => pages.find((p) => p.id === id)?.title ?? `page ${id}`;
  const drafts = usedBy.pages.map((page) => page.title || title(page.id));
  const byPage = new Map<number, number[]>();
  for (const version of usedBy.versions) byPage.set(version.pageId, [...(byPage.get(version.pageId) ?? []), version.number]);
  const versions = [...byPage].map(([id, numbers]) => `${title(id)} (${listed(numbers.map(String))})`);
  const entries = usedBy.entries.map((entry) => entry.title);
  const parts: string[] = [];
  if (drafts.length > 0) parts.push(`${drafts.length === 1 ? "the page" : "the pages"} ${listed(drafts)}`);
  if (versions.length > 0) parts.push(`${usedBy.versions.length === 1 ? "a kept version" : "kept versions"} of ${listed(versions)}`);
  if (entries.length > 0) parts.push(`${entries.length === 1 ? "the entry" : "the entries"} ${listed(entries)}`);
  const where = parts.length > 0 ? parts.join(", and ") : "a page";
  const takeOff = [
    drafts.length === 0 ? null : drafts.length === 1 ? "that page" : "those pages",
    entries.length === 0 ? null : entries.length === 1 ? "that entry" : "those entries",
  ].filter((part) => part !== null);
  const advice = takeOff.length === 0 ? null : `Take it off ${takeOff.join(" and ")} first.`;
  const kept = versions.length > 0 ? "A kept version holds its images for as long as it is kept." : null;
  const live = entries.length > 0 ? "An entry keeps the images of what is live until it is published again or taken off." : null;
  return ["Not deleted: it is still shown by", `${where}.`, advice, kept, live].filter((part) => part !== null).join(" ");
}
