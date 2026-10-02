// The video's panel: the address of a video's page, or its id, becomes the
// provider and the id by the video's props command, and the title its own;
// what is no video is refused on the field; the server's 422 on the id
// shows there too.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import { BlockPanel } from "../../editor/panels/EditPanel.tsx";
import { parseVideo } from "../../editor/pickers.tsx";

test("an address is read for the provider and the id, and only those are kept", () => {
  const kit = editorKit({ document: widgetPage(), selection: "video" });
  kit.render(<BlockPanel id="video" />);
  const field = screen.getByLabelText("Video address or id");
  fireEvent.change(field, { target: { value: "https://vimeo.com/76979871" } });
  fireEvent.blur(field);
  expect(kit.block("video")?.props).toEqual({ provider: "vimeo", videoId: "76979871", title: "Video" });
  expect(kit.lastCommand()).toMatchObject({ kind: "props", label: "Changed Video in Widgets" });

  const title = screen.getByLabelText("Title");
  fireEvent.change(title, { target: { value: "Watch a dawn swim" } });
  fireEvent.blur(title);
  expect(kit.block("video")?.props).toMatchObject({ title: "Watch a dawn swim" });
  expect(kit.lastCommand()?.label).toBe("Changed Video title in Widgets");
});

test("what is not a video is refused on the field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "video" });
  kit.render(<BlockPanel id="video" />);
  const field = screen.getByLabelText("Video address or id");
  fireEvent.change(field, { target: { value: "https://example.org/watch?v=nope" } });
  fireEvent.blur(field);
  expect(kit.block("video")?.props).toMatchObject({ provider: "youtube", videoId: "abcdefghijk" });
  expect(describedText(field)).toContain("That is not the address of a video");
});

test("the server's 422 on the video id shows on its field", () => {
  const kit = editorKit({ document: widgetPage(), selection: "video" });
  kit.render(<BlockPanel id="video" />);
  act(() => kit.refuse("video", "/props/videoId", "pattern", "does not match the pattern"));
  const field = screen.getByLabelText("Video address or id");
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(field)).toContain("This value is not accepted here.");
});

test("addresses of a video's page, and bare ids, read as the provider and the id", () => {
  expect(parseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
  expect(parseVideo("https://youtu.be/dQw4w9WgXcQ")).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
  expect(parseVideo("youtube.com/embed/dQw4w9WgXcQ")).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
  expect(parseVideo("https://player.vimeo.com/video/76979871")).toEqual({ provider: "vimeo", videoId: "76979871" });
  expect(parseVideo("76979871")).toEqual({ provider: "vimeo", videoId: "76979871" });
  expect(parseVideo("dQw4w9WgXcQ")).toEqual({ provider: "youtube", videoId: "dQw4w9WgXcQ" });
  // Eleven digits are an id of either: the provider the video has stays.
  expect(parseVideo("12345678901", "youtube")).toEqual({ provider: "youtube", videoId: "12345678901" });
  expect(parseVideo("12345678901", "vimeo")).toEqual({ provider: "vimeo", videoId: "12345678901" });
  for (const no of ["", "https://example.org/v/dQw4w9WgXcQ", "https://youtube.com/watch?v=short", "javascript:alert(1)"]) expect(parseVideo(no)).toBeNull();
});
