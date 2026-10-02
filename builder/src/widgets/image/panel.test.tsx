// The image's panel: alt text, the decorative mark and a replaced image
// change the page by the image's props command, source and text together;
// the server's 422 on the image's source shows under the picture.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";

test("alt text and the decorative mark change the image, the one replacing the other", () => {
  const kit = editorKit({ document: widgetPage(), selection: "image" });
  kit.render(<BlockPanel id="image" />);

  const alt = screen.getByLabelText("Alt text");
  fireEvent.change(alt, { target: { value: "Three swimmers at the buoy line" } });
  fireEvent.blur(alt);
  expect(kit.block("image")?.props).toEqual({ url: "https://images.example.org/bay.jpg", alt: "Three swimmers at the buoy line" });
  expect(kit.lastCommand()).toMatchObject({ kind: "props", label: "Changed Alt text in Widgets" });

  fireEvent.click(screen.getByRole("switch", { name: "Decorative" }));
  expect(kit.block("image")?.props).toEqual({ url: "https://images.example.org/bay.jpg", decorative: true });

  // Back from decorative: the alt field opens, and its text replaces the mark.
  fireEvent.click(screen.getByRole("switch", { name: "Decorative" }));
  expect(kit.block("image")?.props).toEqual({ url: "https://images.example.org/bay.jpg", decorative: true });
  const reopened = screen.getByLabelText("Alt text");
  expect((reopened as HTMLTextAreaElement).disabled).toBe(false);
  fireEvent.change(reopened, { target: { value: "The bay again" } });
  fireEvent.blur(reopened);
  expect(kit.block("image")?.props).toEqual({ url: "https://images.example.org/bay.jpg", alt: "The bay again" });
});

test("Replace image puts another image and its own alt text in one change", () => {
  const kit = editorKit({ document: widgetPage(), selection: "image" });
  kit.render(<BlockPanel id="image" />);
  fireEvent.click(screen.getByRole("button", { name: "Replace image" }));
  const dialog = screen.getByRole("dialog", { name: "Replace image" });
  fireEvent.change(within(dialog).getByLabelText("Image address"), { target: { value: "https://images.example.org/jetty.jpg" } });
  fireEvent.change(within(dialog).getByLabelText("Alt text"), { target: { value: "The jetty in winter" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Replace image" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(kit.block("image")?.props).toEqual({ url: "https://images.example.org/jetty.jpg", alt: "The jetty in winter" });
  expect(kit.store.getState().past).toHaveLength(1);
});

test("an address the rules refuse is said in the dialog, and nothing changes", () => {
  const kit = editorKit({ document: widgetPage(), selection: "image" });
  kit.render(<BlockPanel id="image" />);
  fireEvent.click(screen.getByRole("button", { name: "Replace image" }));
  const dialog = screen.getByRole("dialog", { name: "Replace image" });
  fireEvent.change(within(dialog).getByLabelText("Image address"), { target: { value: "http://images.example.org/plain.jpg" } });
  fireEvent.change(within(dialog).getByLabelText("Alt text"), { target: { value: "Plain" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Replace image" }));
  expect(within(dialog).getByText(/Address: Use an https:\/\/ address/)).toBeTruthy();
  expect(kit.block("image")?.props).toMatchObject({ url: "https://images.example.org/bay.jpg" });
});

test("the server's 422 on the image's source shows under the picture, and on the alt text its own", () => {
  const kit = editorKit({ document: widgetPage(), selection: "image" });
  kit.render(<BlockPanel id="image" />);
  act(() => kit.refuse("image", "/props/url", "pattern", "does not match the pattern"));
  const image = screen.getByRole("button", { name: "Replace image" }).closest(".field") as HTMLElement;
  expect(within(image).getByText("Use an https:// address, or a path on this site (/…).")).toBeTruthy();
  act(() => kit.refuse("image", "/props/alt", "maxLength", "is too long"));
  expect(describedText(screen.getByLabelText("Alt text"))).toContain("Up to 300 characters.");
});
