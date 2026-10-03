// The page's panel, with nothing selected: title and description by the
// page command; the address through the storage adapter, whose refusal
// shows on the Address field; the server's 422 on the title on its field.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { errorsByBlock } from "../../storage/adapter.ts";
import { EditPanel } from "./EditPanel.tsx";

const current = { id: 7, slug: "winter-series", home: false, published: null, revision: 3, links: { preview: "/preview/7", live: null } };

test("title and description change the page by the page command", () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<EditPanel />);
  const title = screen.getByLabelText("Title");
  fireEvent.change(title, { target: { value: "Winter swims" } });
  fireEvent.blur(title);
  expect(kit.doc().title).toBe("Winter swims");
  expect(kit.lastCommand()).toMatchObject({ kind: "page", label: "Changed the page title", subject: null });

  const description = screen.getByLabelText("Description in search results");
  fireEvent.change(description, { target: { value: "" } });
  fireEvent.blur(description);
  expect(kit.doc()).not.toHaveProperty("description");
  expect(kit.lastCommand()?.label).toBe("Removed the page description");
});

test("the address goes through the adapter, and its refusal shows on the Address field", async () => {
  const asked: string[] = [];
  const kit = editorKit({
    document: page(),
    session: {
      current,
      setSlug: async (slug) => {
        asked.push(slug);
        return [{ pointer: "/slug", keyword: "taken", blockPointer: null, message: "is already the address of another page" }];
      },
    },
  });
  kit.render(<EditPanel />);
  const address = screen.getByLabelText("Address");
  fireEvent.change(address, { target: { value: "/notices" } });
  fireEvent.keyDown(address, { key: "Enter" });
  await waitFor(() => expect(address.getAttribute("aria-invalid")).toBe("true"));
  expect(asked).toEqual(["notices"]);
  expect(describedText(address)).toContain("is already the address of another page");
  // The address is the page's, not the document's: no command was made.
  expect(kit.store.getState().past).toHaveLength(0);
});

test("the server's 422 on the title shows on the Title field", () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<EditPanel />);
  act(() => kit.ui.getState().setServerErrors(errorsByBlock(kit.doc(), [{ pointer: "/document/title", keyword: "maxLength", blockPointer: null, message: "is longer than 120 characters" }])));
  const title = screen.getByLabelText("Title");
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(title)).toContain("Up to 120 characters.");
});
