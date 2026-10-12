// The media library's work as the shell gives it: closing the tab while an
// image is on its way asks first, and not once it has arrived or was
// refused.
// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { expect, test } from "vitest";
import { editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import type { Invalid, MediaItem, Outcome } from "../../storage/adapter.ts";
import { EditorProvider } from "../context.tsx";
import { MediaProvider, useMediaService } from "./context.tsx";
import type { MediaAdapter, MediaService } from "./service.ts";

const closing = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

test("the tab asks before it closes while an upload is on its way", async () => {
  const answers: Array<(outcome: Outcome<MediaItem, Invalid>) => void> = [];
  const adapter: MediaAdapter = {
    capabilities: { publish: true, schedule: false, responses: false, imageVariants: false, livePages: true },
    listMedia: async () => [],
    uploadMedia: () => new Promise<Outcome<MediaItem, Invalid>>((resolve) => answers.push(resolve)),
    setMediaAlt: async () => ({ ok: false, problem: { kind: "invalid", code: "invalid_request", message: "", errors: [] } }),
    deleteMedia: async () => ({ ok: true, value: null }),
  };
  const prepare = async (file: File) => ({ ok: true as const, image: { file, width: 10, height: 10, resized: false } });
  const kit = editorKit({ document: widgetPage() });
  const ui = kit.ui;
  const given: { service: MediaService | null } = { service: null };
  function Grab() {
    const service = useMediaService();
    useLayoutEffect(() => {
      given.service = service;
    });
    return null;
  }
  render(<EditorProvider env={kit.env}><MediaProvider adapter={adapter} prepare={prepare}><Grab /></MediaProvider></EditorProvider>);
  expect(closing()).toBe(false);
  act(() => {
    given.service!.upload([new File(["x"], "a.png", { type: "image/png" })]);
  });
  expect(closing()).toBe(true);
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
    answers[0]!({ ok: true, value: { id: "a", alt: "", width: 10, height: 10, contentType: "image/png", byteSize: 1, filename: "a.png", url: "/a", createdAt: "2026-10-03T08:00:00.000Z" } });
    await new Promise((done) => setTimeout(done, 0));
  });
  expect(closing()).toBe(false);
  expect([...ui.getState().media.keys()]).toEqual(["a"]);
});
