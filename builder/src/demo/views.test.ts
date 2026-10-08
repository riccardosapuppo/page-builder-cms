// The demo's own pages, by the address: the preview and the published page
// of a page id, and the editor for anything else.
import { describe, expect, test } from "vitest";
import { previewAddress, publishedAddress, readView } from "./views.ts";

describe("the demo's addresses", () => {
  test("a page's preview and published page are read back from their addresses", () => {
    expect(readView(previewAddress(12))).toEqual({ kind: "preview", pageId: 12 });
    expect(readView(publishedAddress(3))).toEqual({ kind: "published", pageId: 3 });
    expect(readView("?page=2&published=7")).toEqual({ kind: "published", pageId: 7 });
  });

  test("anything else is the editor, never a view of nothing", () => {
    for (const search of ["", "?page=3", "?preview=", "?preview=0", "?preview=-1", "?preview=1.5", "?preview=abc", "?published=99999999999999999", "?published= 4"]) {
      expect(readView(search), search).toBeNull();
    }
  });
});
