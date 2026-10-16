// The demo's own pages, by the address: the preview and the published page
// of a page id, a template's preview with the entry it is drawn with, an
// entry as published here, and the editor for anything else.
import { describe, expect, test } from "vitest";
import { cartAddress, entryAddress, orderAddress, previewAddress, publishedAddress, readView } from "./views.ts";

describe("the demo's addresses", () => {
  test("a page's preview and published page are read back from their addresses", () => {
    expect(readView(previewAddress(12))).toEqual({ kind: "preview", pageId: 12 });
    expect(readView(publishedAddress(3))).toEqual({ kind: "published", pageId: 3 });
    expect(readView("?page=2&published=7")).toEqual({ kind: "published", pageId: 7 });
  });

  test("an entry's page is read back from its address; a template's preview names the entry it is drawn with, or the made-up values", () => {
    expect(readView(entryAddress(5))).toEqual({ kind: "entry", entryId: 5 });
    expect(readView("?preview=90&entry=4")).toEqual({ kind: "preview", pageId: 90, entry: 4 });
    expect(readView("?preview=90&entry=sample")).toEqual({ kind: "preview", pageId: 90, entry: "sample" });
    // An entry the address does not name: the first published, as with none.
    expect(readView("?preview=90&entry=first")).toEqual({ kind: "preview", pageId: 90 });
  });

  test("the cart and an order its checkout made are read back from their addresses", () => {
    expect(readView(cartAddress)).toEqual({ kind: "cart" });
    expect(readView(orderAddress(14))).toEqual({ kind: "order", orderId: 14 });
  });

  test("anything else is the editor, never a view of nothing", () => {
    for (const search of [
      "", "?page=3", "?preview=", "?preview=0", "?preview=-1", "?preview=1.5", "?preview=abc", "?published=99999999999999999", "?published= 4", "?entry=", "?entry=0", "?entry=sample", "?entry=news/dawn-swims",
      "?cart=1", "?cart=thanks", "?order=", "?order=0", "?order=cs_test_1",
    ]) {
      expect(readView(search), search).toBeNull();
    }
  });
});
