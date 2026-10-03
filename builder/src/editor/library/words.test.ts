// The media library's words: the count, an image's size and day, and who
// still shows an image the CMS would not delete; and the images a page
// shows, by their ids.
import { expect, test } from "vitest";
import type { MediaItem, PageSummary } from "../../storage/adapter.ts";
import type { PageDocument } from "../../shared/document.ts";
import { mediaIdsOn } from "./on-page.ts";
import { addedOn, countLine, inUseSentence, listed, metaLine } from "./words.ts";

const NOW = Date.UTC(2026, 9, 3, 9, 30);

test("the count leaves out what is none", () => {
  expect(countLine(10, 2, 1)).toBe("10 images, 2 without alt text, 1 uploading");
  expect(countLine(1, 0, 0)).toBe("1 image");
  expect(countLine(0, 0, 2)).toBe("0 images, 2 uploading");
});

test("an image's size, weight and day, the day as a person reads it", () => {
  const item: MediaItem = { id: "a", alt: "", width: 1600, height: 1200, contentType: "image/png", byteSize: 86_016, filename: "buoys.png", url: "/a", createdAt: "2026-09-12T08:00:00.000Z" };
  expect(metaLine(item, NOW, "UTC")).toBe("1600 × 1200, 84 KB. Added Sep 12.");
  expect(addedOn("2026-10-03T00:10:00.000Z", NOW, "UTC")).toBe("Added today");
  expect(addedOn("2026-10-02T23:50:00.000Z", NOW, "UTC")).toBe("Added yesterday");
  expect(addedOn("2025-12-30T16:10:00.000Z", NOW, "UTC")).toBe("Added Dec 30, 2025");
  // The day is the browser's: late on the 2nd in UTC is the 3rd in Tokyo.
  expect(addedOn("2026-10-02T23:50:00.000Z", NOW, "Asia/Tokyo")).toBe("Added today");
});

test("lists read as a sentence", () => {
  expect([listed([]), listed(["A"]), listed(["A", "B"]), listed(["A", "B", "C"])]).toEqual(["", "A", "A and B", "A, B and C"]);
});

const summary = (id: number, title: string) => ({ id, title }) as PageSummary;

test("an image the CMS kept says which pages and which kept versions show it", () => {
  const pages = [summary(1, "Home"), summary(2, "Winter series")];
  expect(inUseSentence({ pages: [{ id: 1, title: "Home", slug: "home" }], versions: [] }, pages)).toBe("Not deleted: it is still shown by the page Home. Take it off that page first.");
  expect(inUseSentence({ pages: [{ id: 1, title: "Home", slug: "home" }, { id: 2, title: "Winter series", slug: "winter-series" }], versions: [{ pageId: 1, number: 3 }, { pageId: 1, number: 5 }, { pageId: 9, number: 2 }] }, pages)).toBe(
    "Not deleted: it is still shown by the pages Home and Winter series, and kept versions of Home (3 and 5) and page 9 (2). Take it off those pages first. A kept version holds its images for as long as it is kept.",
  );
  expect(inUseSentence({ pages: [], versions: [{ pageId: 2, number: 4 }] }, pages)).toBe(
    "Not deleted: it is still shown by a kept version of Winter series (4). A kept version holds its images for as long as it is kept.",
  );
});

test("a page's library images: its image blocks' and its gallery items', each once; an image from another site is none", () => {
  const block = (id: string, type: string, props: Record<string, unknown>) => ({ id, type, props, children: [], style: { base: {} } });
  const doc = {
    schemaVersion: 1,
    title: "T",
    sections: [{
      id: "s", type: "section", props: {}, style: { base: {} },
      children: [{
        id: "c", type: "column", props: {}, style: { base: {} },
        children: [
          block("i1", "image", { mediaId: "m1", alt: "One" }),
          block("i2", "image", { url: "https://images.example.org/x.png", alt: "Elsewhere" }),
          block("g", "gallery", { items: [{ mediaId: "m2", alt: "Two" }, { mediaId: "m1", decorative: true }, { url: "https://images.example.org/y.png", alt: "Y" }] }),
        ],
      }],
    }],
  } as unknown as PageDocument;
  expect([...mediaIdsOn(doc)].sort()).toEqual(["m1", "m2"]);
});
