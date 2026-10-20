// A section's picture, in its Background group: chosen in the media
// library with no alt text asked, a dark veil coming with a first picture
// on a section that names none, replaced and taken out, each one step;
// with a picture, its veil, the veil's strength (while there is a veil)
// and the point kept in view, per device as every style setting, and how
// the words read on it said as a colour's contrast is; the server's 422 on
// the picture under it. And every block's Motion group.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { describedText, editorKit, groupNames, openGroups, widgetPage } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import type { MediaItem } from "../../storage/adapter.ts";
import { BlockPanel } from "./EditPanel.tsx";

const item = (id: string, filename: string, alt = ""): MediaItem => ({ id, alt, width: 1600, height: 900, contentType: "image/jpeg", byteSize: 1, filename, url: `/media/${filename}`, createdAt: "2026-10-20T08:00:00.000Z" });
const LIBRARY = [item("gym1", "gym-floor.jpg", "The gym floor at opening"), item("gym2", "rowers.jpg")];
const field = (label: string) => screen.getAllByText(label, { selector: ".label" })[0]!.closest<HTMLElement>(".field")!;
const pickIn = (name: string) => {
  const dialog = screen.getByRole("dialog", { name: "Media library" });
  fireEvent.click(within(dialog).getByRole("radio", { name: new RegExp(`^${name}`) }));
  return dialog;
};

describe("a section's picture", () => {
  test("is chosen in the library with no alt text asked, a dark veil with it, then replaced and taken out, each one step", async () => {
    const kit = editorKit({ document: page(), selection: "hero" });
    kit.ui.getState().setMedia(LIBRARY);
    kit.render(<BlockPanel id="hero" />);
    openGroups("Background");
    // None yet: the colour, and a key to choose one; no veil, no focus.
    expect(screen.queryByRole("radiogroup", { name: "Veil" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Choose a picture" }));
    // An image of the library only, and no alt text asked: rowers.jpg has none.
    const dialog = pickIn("rowers.jpg");
    expect(within(dialog).queryByLabelText("Image address")).toBeNull();
    expect(within(dialog).queryByRole("checkbox", { name: /decorative/ })).toBeNull();
    expect(within(dialog).getByText(/Behind a section the picture is decorative: it needs no alt text there\./)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Use picture" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(kit.block("hero")?.props).toMatchObject({ picture: { mediaId: "gym2" } });
    // A first picture on a section with no veil comes with a dark one, in the same step.
    expect(kit.block("hero")?.style).toEqual({ base: { spaceAbove: "section-l", veil: "dark" } });
    expect(kit.store.getState().past).toHaveLength(1);
    expect(kit.lastCommand()).toMatchObject({ kind: "props", label: "Set a picture behind Hero" });
    // Its settings, in the group, after the colour.
    const names = [...document.querySelectorAll("[data-group=background] .field > .label, [data-group=background] .field > .label-row > .label")].map((e) => e.textContent);
    expect(names).toEqual(["Background", "Picture", "Veil", "Strength", "Focus"]);
    expect(screen.getByRole("radiogroup", { name: "Veil" }).querySelector("[aria-checked=true]")?.textContent).toBe("Dark");
    // The strength the theme gives a veil with none of its own, and the centre.
    expect(screen.getByRole("radiogroup", { name: "Strength" }).querySelector("[aria-checked=true]")?.textContent).toBe("Medium");
    expect(within(screen.getByRole("radiogroup", { name: "Focus" })).getByRole("radio", { checked: true }).getAttribute("aria-label")).toBe("Center");

    // Replaced: the veil is the section's, and stays.
    fireEvent.click(screen.getByRole("button", { name: "Replace picture" }));
    fireEvent.click(within(pickIn("gym-floor.jpg")).getByRole("button", { name: "Use picture" }));
    expect(kit.block("hero")?.props).toMatchObject({ picture: { mediaId: "gym1" } });
    expect(kit.lastCommand()?.label).toBe("Replaced the picture of Hero");

    // Taken out: the key with it, the focus on Choose; the veil kept for the next.
    fireEvent.click(screen.getByRole("button", { name: "Remove picture" }));
    expect(kit.block("hero")?.props).not.toHaveProperty("picture");
    expect(kit.block("hero")?.style).toEqual({ base: { spaceAbove: "section-l", veil: "dark" } });
    expect(kit.lastCommand()?.label).toBe("Removed the picture of Hero");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Choose a picture" })));
    expect(screen.queryByRole("radiogroup", { name: "Veil" })).toBeNull();
  });

  test("a section that names a veil keeps it when a picture comes", () => {
    const kit = editorKit({ document: page(), selection: "hero" });
    kit.ui.getState().setMedia(LIBRARY);
    act(() => kit.store.getState().load({ ...page(), sections: page().sections.map((section) => (section.id === "hero" ? { ...section, style: { base: {}, phone: { veil: "light" } } } : section)) }));
    kit.render(<BlockPanel id="hero" />);
    openGroups("Background");
    fireEvent.click(screen.getByRole("button", { name: "Choose a picture" }));
    fireEvent.click(within(pickIn("gym-floor.jpg")).getByRole("button", { name: "Use picture" }));
    expect(kit.block("hero")?.style).toEqual({ base: {}, phone: { veil: "light" } });
  });

  test("its veil, strength and focus are set per device, and the words' contrast on it is said", () => {
    const kit = editorKit({ document: page(), selection: "hero" });
    kit.ui.getState().setMedia(LIBRARY);
    kit.render(<BlockPanel id="hero" />);
    openGroups("Background");
    fireEvent.click(screen.getByRole("button", { name: "Choose a picture" }));
    fireEvent.click(within(pickIn("gym-floor.jpg")).getByRole("button", { name: "Use picture" }));
    const check = () => screen.getByRole("list", { name: "Veil: contrast" }).textContent;
    // White words over black at .6, where the picture is white: #666666, 5.7 to 1.
    expect(check()).toBe("Words on the picture, where it is lightest: 5.7 to 1, readable");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Strength" })).getByRole("radio", { name: "Light" }));
    expect(kit.block("hero")?.style.base).toMatchObject({ veilStrength: "light" });
    expect(kit.lastCommand()?.label).toBe("Set Veil strength to Light, Hero");
    expect(check()).toBe("Words on the picture, where it is lightest: 2.8 to 1, hard to read");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Veil" })).getByRole("radio", { name: "Light" }));
    expect(check()).toMatch(/^Words on the picture, where it is darkest: /);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Veil" })).getByRole("radio", { name: "Text color" }));
    expect(kit.lastCommand()?.label).toBe("Set Veil to Text color, Hero");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Focus" })).getByRole("radio", { name: "Top left" }));
    expect(kit.block("hero")?.style.base).toMatchObject({ veil: "text", veilStrength: "light", focus: "top-left" });
    // No veil: no strength to set, and the words' contrast is the picture's.
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Veil" })).getByRole("radio", { name: "None" }));
    expect(screen.queryByRole("radiogroup", { name: "Strength" })).toBeNull();
    expect(check()).toBe("No veil: whether the words read depends on the picture.");
    // A phone's own focus, said as the phone's, with the desktop's kept.
    act(() => kit.ui.getState().setPreview("phone"));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Focus" })).getByRole("radio", { name: "Bottom" }));
    expect(kit.block("hero")?.style).toMatchObject({ base: { focus: "top-left" }, phone: { focus: "bottom" } });
    expect(field("Focus").querySelector(".scope")?.textContent).toBe("Phone only");
    expect(kit.lastCommand()?.label).toBe("Set Focus to Bottom on phone, Hero");
  });

  test("the group says the picture and its veil closed, and holds the server's 422 on it", () => {
    const kit = editorKit({ document: page(), selection: "hero" });
    act(() => kit.store.getState().load({ ...page(), sections: page().sections.map((section) => (section.id === "hero" ? { ...section, props: { ...section.props, picture: { mediaId: "gone" } }, style: { base: { background: "soft", veil: "dark" } } } : section)) }));
    kit.render(<BlockPanel id="hero" />);
    const head = screen.getByRole("button", { name: "Background" });
    expect(describedText(head)).toMatch(/^\S+, picture, dark veil$/);
    act(() => kit.refuse("hero", "/props/picture/mediaId", "mediaExists", "The media library has no item gone."));
    // The refusal opens the group, and shows under the picture.
    expect(within(field("Picture")).getByText("The media library has no item gone.")).toBeTruthy();
    expect(within(field("Picture")).getByText(/The picture is not in the media library any more/)).toBeTruthy();
  });
});

describe("every block's Motion group", () => {
  test("sets how the block comes into view, per device, and says it closed", () => {
    const kit = editorKit({ document: widgetPage(), selection: "heading" });
    kit.render(<BlockPanel id="heading" />);
    expect(groupNames()).toContain("Motion");
    expect(describedText(screen.getByRole("button", { name: "Motion" }))).toContain("None");
    openGroups("Motion");
    const motion = screen.getByRole("radiogroup", { name: "Motion" });
    expect([...motion.querySelectorAll("[role=radio]")].map((radio) => radio.textContent)).toEqual(["None", "Rise", "Fade", "Zoom"]);
    expect(describedText(motion)).toContain("not while you edit, and never for visitors who ask for less motion");
    fireEvent.click(within(motion).getByRole("radio", { name: "Rise" }));
    expect(kit.block("heading")?.style.base).toMatchObject({ motion: "rise" });
    expect(kit.lastCommand()?.label).toBe("Set Motion to Rise, Heading in Widgets");
    act(() => kit.ui.getState().setPreview("phone"));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Motion" })).getByRole("radio", { name: "None" }));
    expect(kit.block("heading")?.style).toMatchObject({ base: { motion: "rise" }, phone: { motion: "none" } });
  });
});
