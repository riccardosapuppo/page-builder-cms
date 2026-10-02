// The gallery's panel: each image's alt text, its moves and its removal
// change the page by the gallery's own item commands, and new images come
// in by the insert-items command; the server's 422 on one image shows
// under that image.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

const items = (kit: ReturnType<typeof editorKit>) => (kit.block("gallery")!.props as { items: unknown[] }).items;

test("alt text, moves and removal change one image each, by the item commands", () => {
  const kit = editorKit({ document: widgetPage(), selection: "gallery" });
  kit.render(<BlockPanel id="gallery" />);

  const alt = screen.getByLabelText("Alt text, image 1");
  fireEvent.change(alt, { target: { value: "The first light" } });
  fireEvent.blur(alt);
  expect(items(kit)[0]).toEqual({ url: "https://images.example.org/one.jpg", alt: "The first light" });
  expect(kit.lastCommand()).toMatchObject({ kind: "items", label: "Changed the alt text of image 1 in Gallery in Widgets" });

  fireEvent.click(screen.getByRole("button", { name: "Move image 1 down" }));
  expect(items(kit)).toEqual([{ mediaId: "m1", alt: "Two" }, { url: "https://images.example.org/one.jpg", alt: "The first light" }]);
  expect(kit.lastCommand()?.label).toBe("Moved image 1 in Gallery in Widgets");

  fireEvent.click(screen.getByRole("button", { name: "Remove image 1" }));
  expect(items(kit)).toEqual([{ url: "https://images.example.org/one.jpg", alt: "The first light" }]);
  // The last image cannot go: a gallery holds at least one.
  expect((screen.getByRole("button", { name: "Remove image 1" }) as HTMLButtonElement).disabled).toBe(true);
});

test("Add images puts the chosen images at the end, in one change", () => {
  const kit = editorKit({ document: widgetPage(), selection: "gallery" });
  kit.ui.getState().setMedia([
    { id: "lib1", alt: "Rock pools", width: 800, height: 600, contentType: "image/png", byteSize: 1, filename: "rockpools.png", url: "/media/rockpools.png", createdAt: "2026-10-02T08:00:00.000Z" },
  ]);
  kit.render(<BlockPanel id="gallery" />);
  fireEvent.click(screen.getByRole("button", { name: "Add images" }));
  const dialog = screen.getByRole("dialog", { name: "Add images" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Rock pools" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Add images" }));
  expect(items(kit)).toHaveLength(3);
  expect(items(kit)[2]).toEqual({ mediaId: "lib1", alt: "Rock pools" });
  expect(kit.lastCommand()).toMatchObject({ kind: "items", label: "Added an image to Gallery in Widgets" });
});

test("the server's 422 on the second image's source shows under that image only", () => {
  const kit = editorKit({ document: widgetPage(), selection: "gallery" });
  kit.render(<BlockPanel id="gallery" />);
  act(() => kit.refuse("gallery", "/props/items/1/mediaId", "mediaExists", "The media library has no item m1."));
  const [first, second] = screen.getAllByRole("listitem");
  expect(within(second!).getByText("The media library has no item m1.")).toBeTruthy();
  expect(within(first!).queryByText("The media library has no item m1.")).toBeNull();
});
