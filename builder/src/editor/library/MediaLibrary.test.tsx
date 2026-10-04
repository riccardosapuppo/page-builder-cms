// The media library's dialog: no image is placed without its alt text or
// the decorative mark, and the button says why it waits; an image placed
// is ONE command born with its mediaId, its alt text copied in and kept in
// the library; an upload reaches the page only once it has finished and
// the person places it; a refused upload says why; a delete the CMS
// refuses says who shows the image; the filters, the search and the count;
// and what the library says about the server's image variants.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { editorKit, widgetPage } from "../../../test/editor-kit.tsx";
import type { SectionBlock } from "../../shared/document.ts";
import { StorageError, type InUse, type Invalid, type MediaItem, type Outcome } from "../../storage/adapter.ts";
import type { UiStore } from "../ui-store.ts";
import { Palette } from "../Palette.tsx";
import { BlockPanel } from "../panels/EditPanel.tsx";
import { MediaLibrary } from "./MediaLibrary.tsx";
import type { Preparation } from "./resize.ts";
import { createMediaService } from "./service.ts";

const T = "2026-09-12T08:00:00.000Z";
const item = (id: string, alt: string, filename = `${id}.png`): MediaItem => ({ id, alt, width: 1600, height: 1200, contentType: "image/png", byteSize: 86_016, filename, url: `/media/${id}.png`, createdAt: T });

// A library on a storage of the test's making: what it was asked, and the
// answers the test gives.
function library(items: MediaItem[]) {
  const asked = { alts: [] as Array<[string, string]>, deletes: [] as string[] };
  const uploads: Array<{ name: string; resolve: (outcome: Outcome<MediaItem, Invalid>) => void }> = [];
  let deleteAnswer: (id: string) => Promise<Outcome<null, InUse>> = async () => ({ ok: true, value: null });
  const refusals = new Map<string, string>();
  const make = (ui: UiStore) => {
    ui.getState().setMedia(items);
    return createMediaService({
      ui,
      adapter: {
        capabilities: { publish: true, schedule: false, responses: false, imageVariants: false },
        listMedia: async () => [...ui.getState().media.values()],
        uploadMedia: (upload) => new Promise((resolve) => uploads.push({ name: upload.file.name, resolve })),
        setMediaAlt: async (id, alt) => {
          asked.alts.push([id, alt]);
          return { ok: true, value: { ...ui.getState().media.get(id)!, alt } };
        },
        deleteMedia: (id) => {
          asked.deletes.push(id);
          return deleteAnswer(id);
        },
      },
      prepare: async (file): Promise<Preparation> => {
        const refused = refusals.get(file.name);
        return refused ? { ok: false, reason: refused } : { ok: true, image: { file, width: 2400, height: 1600, resized: true } };
      },
      urls: { create: () => null, revoke: () => {} },
    });
  };
  return {
    make, asked, uploads, refusals,
    deleteWith: (answer: typeof deleteAnswer) => {
      deleteAnswer = answer;
    },
  };
}

const lastWidget = (kit: ReturnType<typeof editorKit>) => (kit.doc().sections[0] as SectionBlock).children[0]!.children.at(-1)!;

function openImageTile(kit: ReturnType<typeof editorKit>) {
  kit.render(<Palette />);
  fireEvent.click(screen.getByRole("button", { name: "Image" }));
  return screen.getByRole("dialog", { name: "Media library" });
}

describe("placing an image", () => {
  test("without alt text it waits, saying why, and takes the person to the field; with it, ONE command born with the mediaId, the alt copied in and kept in the library", async () => {
    const lib = library([item("dawn", "The bay at dawn"), item("buoys", "")]);
    const kit = editorKit({ document: widgetPage(), selection: "col", media: lib.make });
    const before = kit.store.getState().past.length;
    const dialog = openImageTile(kit);

    fireEvent.click(within(dialog).getByRole("radio", { name: "buoys.png, no alt text" }));
    const add = within(dialog).getByRole("button", { name: "Add image" });
    expect(add.getAttribute("aria-disabled")).toBe("true");
    expect(add.getAttribute("aria-describedby") && document.getElementById(add.getAttribute("aria-describedby")!)?.textContent).toBe("Add alt text to use this image.");
    const alt = within(dialog).getByRole("textbox", { name: /^Alt text/ });
    expect(alt.getAttribute("aria-invalid")).toBe("true");
    expect(within(dialog).getByText(/^Add alt text to use this image\. Describe what it shows/)).toBeTruthy();

    fireEvent.click(add);
    expect(kit.store.getState().past).toHaveLength(before);
    await waitFor(() => expect(document.activeElement).toBe(alt));

    fireEvent.change(alt, { target: { value: "Orange buoys\nacross the bay" } });
    expect((alt as HTMLTextAreaElement).value).toBe("Orange buoys across the bay");
    expect(add.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(add);

    expect(screen.queryByRole("dialog")).toBeNull();
    const past = kit.store.getState().past;
    expect(past).toHaveLength(before + 1);
    expect(lastWidget(kit)).toMatchObject({ type: "image", props: { mediaId: "buoys", alt: "Orange buoys across the bay" } });
    expect(past.at(-1)!.command.label).toMatch(/^Added Image/);
    await waitFor(() => expect(lib.asked.alts).toEqual([["buoys", "Orange buoys across the bay"]]));
    expect(kit.ui.getState().media.get("buoys")?.alt).toBe("Orange buoys across the bay");
  });

  test("marked decorative, it is placed with no alt text, and the library's own text stays as it was", () => {
    const lib = library([item("wake", "")]);
    const kit = editorKit({ document: widgetPage(), selection: "col", media: lib.make });
    const dialog = openImageTile(kit);
    fireEvent.click(within(dialog).getByRole("radio", { name: "wake.png, no alt text" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /This image is decorative/ }));
    expect(within(dialog).queryByText(/^Add alt text to use this image/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add image" }));
    expect(lastWidget(kit).props).toEqual({ mediaId: "wake", decorative: true });
    expect(lib.asked.alts).toEqual([]);
  });

  test("a gallery takes several, each needing its text; the button names how many still do", async () => {
    const lib = library([item("a", "First"), item("b", ""), item("c", "")]);
    const kit = editorKit({ document: widgetPage(), selection: "gallery", media: lib.make });
    kit.render(<BlockPanel id="gallery" />);
    const before = (kit.block("gallery")!.props as { items: unknown[] }).items.length;
    fireEvent.click(screen.getByRole("button", { name: "Add images" }));
    const dialog = screen.getByRole("dialog", { name: "Media library" });
    for (const name of ["a.png", "b.png, no alt text", "c.png, no alt text"]) fireEvent.click(within(dialog).getByRole("checkbox", { name }));
    const add = within(dialog).getByRole("button", { name: "Add images" });
    expect(document.getElementById(add.getAttribute("aria-describedby")!)?.textContent).toBe("Add alt text to 2 images chosen, or mark them decorative.");
    // The details show the last chosen; the button leads to the first that
    // still needs its text.
    fireEvent.click(add);
    await waitFor(() => expect(within(dialog).getByText("b.png", { selector: ".md-name" })).toBeTruthy());
    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Alt text/ }), { target: { value: "Second" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "c.png, no alt text" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "c.png, no alt text" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /This image is decorative/ }));
    fireEvent.click(add);
    const items = (kit.block("gallery")!.props as { items: unknown[] }).items;
    expect(items.slice(before)).toEqual([{ mediaId: "a", alt: "First" }, { mediaId: "b", alt: "Second" }, { mediaId: "c", decorative: true }]);
    expect(kit.lastCommand()).toMatchObject({ kind: "items", label: "Added 3 images to Gallery in Widgets" });
  });
});

describe("uploading", () => {
  test("an image on its way cannot be chosen and changes nothing on the page; once the CMS has it, it is chosen, and placed only by the button", async () => {
    const lib = library([item("old", "Old")]);
    const kit = editorKit({ document: widgetPage(), selection: "col", media: lib.make });
    const before = kit.store.getState().past.length;
    const dialog = openImageTile(kit);
    const file = new File(["bytes"], "harbour.jpg", { type: "image/jpeg" });
    fireEvent.change(within(dialog).getByLabelText("Images to upload"), { target: { files: [file] } });

    await waitFor(() => expect(within(dialog).getByRole("progressbar", { name: "Uploading harbour.jpg" })).toBeTruthy());
    expect(within(dialog).getByText("1 image, 1 uploading")).toBeTruthy();
    expect(within(dialog).queryByRole("radio", { name: /harbour/ })).toBeNull();
    expect(kit.store.getState().past).toHaveLength(before);

    await waitFor(() => expect(lib.uploads).toHaveLength(1));
    act(() => lib.uploads[0]!.resolve({ ok: true, value: item("harbour", "", "harbour.jpg") }));
    const tile = await within(dialog).findByRole("radio", { name: "harbour.jpg, no alt text" });
    expect(tile.getAttribute("aria-checked")).toBe("true");
    expect(within(dialog).queryByRole("progressbar")).toBeNull();
    expect(kit.store.getState().past).toHaveLength(before);

    fireEvent.change(within(dialog).getByRole("textbox", { name: /^Alt text/ }), { target: { value: "Boats in the harbour" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add image" }));
    expect(kit.store.getState().past).toHaveLength(before + 1);
    expect(lastWidget(kit).props).toEqual({ mediaId: "harbour", alt: "Boats in the harbour" });
  });

  test("an upload that finishes while the alt text of the image shown is being written leaves the field, its focus and its words where they are, and says it is in", async () => {
    const lib = library([item("buoys", "")]);
    const kit = editorKit({ document: widgetPage(), media: lib.make });
    kit.render(<MediaLibrary purpose={{ kind: "manage" }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Media library" });
    fireEvent.change(within(dialog).getByLabelText("Images to upload"), { target: { files: [new File(["bytes"], "probe-b.png", { type: "image/png" })] } });
    await waitFor(() => expect(lib.uploads).toHaveLength(1));
    fireEvent.click(within(dialog).getByRole("radio", { name: "buoys.png, no alt text" }));
    const alt = within(dialog).getByRole("textbox", { name: "Alt text" });
    act(() => alt.focus());
    fireEvent.change(alt, { target: { value: "Orange bu" } });
    act(() => lib.uploads[0]!.resolve({ ok: true, value: item("b", "", "probe-b.png") }));
    await within(dialog).findByText("“probe-b.png” is in the library now.");
    expect(document.activeElement).toBe(alt);
    expect((alt as HTMLTextAreaElement).value).toBe("Orange bu");
    expect(within(dialog).getByRole("radio", { name: "buoys.png, no alt text" }).getAttribute("aria-checked")).toBe("true");
    // With nothing being written, the next one finished is shown.
    fireEvent.blur(alt);
    await within(dialog).findByText("Saved in the library.");
    act(() => within(dialog).getByRole("radio", { name: "buoys.png" }).focus());
    fireEvent.change(within(dialog).getByLabelText("Images to upload"), { target: { files: [new File(["bytes"], "probe-c.png", { type: "image/png" })] } });
    await waitFor(() => expect(lib.uploads).toHaveLength(2));
    act(() => lib.uploads[1]!.resolve({ ok: true, value: item("c", "", "probe-c.png") }));
    await waitFor(() => expect(within(dialog).getByRole("radio", { name: "probe-c.png, no alt text" }).getAttribute("aria-checked")).toBe("true"));
  });

  test("a file refused before it goes up says why, by name, until it is dismissed", async () => {
    const lib = library([]);
    lib.refusals.set("logo.svg", "SVG images are not taken: an SVG is a document that can carry script.");
    const kit = editorKit({ document: widgetPage(), media: lib.make });
    kit.render(<MediaLibrary purpose={{ kind: "manage" }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Media library" });
    fireEvent.change(within(dialog).getByLabelText("Images to upload"), { target: { files: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })] } });
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("Not added: SVG images are not taken: an SVG is a document that can carry script.");
    expect(lib.uploads).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Dismiss logo.svg" }));
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });
});

describe("looking after the library", () => {
  test("opened from the menu it places nothing; an alt text is kept in the library when the field is left", async () => {
    const lib = library([item("pier", "")]);
    const kit = editorKit({ document: widgetPage(), media: lib.make });
    kit.render(<MediaLibrary purpose={{ kind: "manage" }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Media library" });
    expect(within(dialog).queryByRole("button", { name: "Add image" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("radio", { name: "pier.png, no alt text" }));
    expect(within(dialog).getByText("1600 × 1200, 84 KB. Added Sep 12.")).toBeTruthy();
    const alt = within(dialog).getByRole("textbox", { name: "Alt text" });
    fireEvent.change(alt, { target: { value: "The pier at low tide" } });
    fireEvent.blur(alt);
    await within(dialog).findByText("Saved in the library.");
    expect(lib.asked.alts).toEqual([["pier", "The pier at low tide"]]);
    expect(within(dialog).getByRole("radio", { name: "pier.png" })).toBeTruthy();
  });

  test("a delete, asked twice; one the CMS refuses says which pages and versions show the image, and keeps it", async () => {
    const lib = library([item("tea", "Tea"), item("jetty", "Jetty")]);
    const kit = editorKit({ document: widgetPage(), media: lib.make, session: { pages: [{ id: 1, title: "Home" } as never] } });
    kit.render(<MediaLibrary purpose={{ kind: "manage" }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Media library" });

    lib.deleteWith(async () => ({ ok: false, problem: { kind: "in-use", message: "Pages still use this image.", usedBy: { pages: [{ id: 1, title: "Home", slug: "home" }], versions: [{ pageId: 1, number: 3 }] } } }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "tea.png" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete from library" }));
    const question = within(dialog).getByRole("group", { name: "Delete tea.png" });
    expect(document.activeElement).toBe(within(question).getByRole("button", { name: "Keep it" }));
    fireEvent.click(within(question).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByText("Not deleted: it is still shown by the page Home, and a kept version of Home (3). Take it off that page first. A kept version holds its images for as long as it is kept.")).toBeTruthy();
    expect(kit.ui.getState().media.has("tea")).toBe(true);

    lib.deleteWith(async () => ({ ok: true, value: null }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "jetty.png" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete from library" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByText("“jetty.png” was deleted from the library.")).toBeTruthy();
    expect([...kit.ui.getState().media.keys()]).toEqual(["tea"]);
    expect(lib.asked.deletes).toEqual(["tea", "jetty"]);
  });

  test("Esc in the delete question takes the question back, not the library: the focus back on Delete from library, nothing deleted", () => {
    const lib = library([item("tea", "Tea")]);
    const kit = editorKit({ document: widgetPage(), media: lib.make });
    let closed = 0;
    kit.render(<MediaLibrary purpose={{ kind: "manage" }} onClose={() => { closed += 1; }} />);
    const dialog = screen.getByRole("dialog", { name: "Media library" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "tea.png" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete from library" }));
    const keep = within(within(dialog).getByRole("group", { name: "Delete tea.png" })).getByRole("button", { name: "Keep it" });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(keep, { key: "Escape" });
    expect(closed).toBe(0);
    expect(within(dialog).queryByRole("group", { name: "Delete tea.png" })).toBeNull();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Delete from library" }));
    expect(lib.asked.deletes).toEqual([]);
    // Esc anywhere else still closes the library.
    fireEvent.keyDown(within(dialog).getByRole("button", { name: "Delete from library" }), { key: "Escape" });
    expect(closed).toBe(1);
  });

  test("a delete whose answer never came says so, and the image stays", async () => {
    const lib = library([item("tea", "Tea")]);
    const kit = editorKit({ document: widgetPage(), media: lib.make });
    kit.render(<MediaLibrary purpose={{ kind: "manage" }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Media library" });
    lib.deleteWith(async () => {
      throw new StorageError({ kind: "unknown", cause: "network", status: null, message: "DELETE /media/{id} could not reach the CMS: offline" });
    });
    fireEvent.click(within(dialog).getByRole("radio", { name: "tea.png" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete from library" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByText("Not deleted: DELETE /media/{id} could not reach the CMS: offline")).toBeTruthy();
    expect(kit.ui.getState().media.has("tea")).toBe(true);
  });

  test("the filters, the search and the count; and the line saying the CMS makes no smaller copies", () => {
    const lib = library([item("m1", "On the page"), item("lone", ""), item("other", "Boats", "boats.png")]);
    const kit = editorKit({ document: widgetPage(), media: lib.make });
    kit.render(<MediaLibrary purpose={{ kind: "manage" }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Media library" });
    const names = () => within(dialog).queryAllByRole("radio", { name: /\.png/ }).map((tile) => tile.getAttribute("aria-label"));
    expect(within(dialog).getByText("3 images, 1 without alt text")).toBeTruthy();
    // The widget page's gallery shows m1.
    fireEvent.click(within(dialog).getByRole("radio", { name: "On this page" }));
    expect(names()).toEqual(["m1.png, on this page"]);
    fireEvent.click(within(dialog).getByRole("radio", { name: /^Missing alt text/ }));
    expect(names()).toEqual(["lone.png, no alt text"]);
    fireEvent.click(within(dialog).getByRole("radio", { name: "All images" }));
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search images" }), { target: { value: "boat" } });
    expect(names()).toEqual(["boats.png"]);
    fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search images" }), { target: { value: "ON THE" } });
    expect(names()).toEqual(["m1.png, on this page"]);
    expect(within(dialog).getByText(/^Images you upload are available on every page\. The CMS makes no smaller copies of them, so each is resized here first, to 2400 px at most on its long side\.$/)).toBeTruthy();
  });

  test("the images are one tab stop: the arrows, Home and End move along them, and a radio follows the focus", () => {
    const lib = library([item("a", "A"), item("b", "B"), item("c", "C")]);
    const kit = editorKit({ document: widgetPage(), media: lib.make });
    kit.render(<MediaLibrary purpose={{ kind: "manage" }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Media library" });
    const tiles = within(dialog).getAllByRole("radio", { name: /\.png$/ });
    expect(tiles.map((tile) => tile.tabIndex)).toEqual([0, -1, -1]);
    // The dialog opens with the focus on the grid's tab stop.
    expect(document.activeElement).toBe(tiles[0]);
    fireEvent.keyDown(tiles[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tiles[1]);
    expect(tiles[1]!.getAttribute("aria-checked")).toBe("true");
    expect(within(dialog).getByText("b.png", { selector: ".md-name" })).toBeTruthy();
    fireEvent.keyDown(tiles[1]!, { key: "End" });
    expect(document.activeElement).toBe(tiles[2]);
    fireEvent.keyDown(tiles[2]!, { key: "Home" });
    expect(document.activeElement).toBe(tiles[0]);
    expect(within(dialog).getAllByRole("radio", { name: /\.png$/ }).map((tile) => tile.tabIndex)).toEqual([0, -1, -1]);
    fireEvent.keyDown(tiles[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tiles[0]);
  });

  test("without the library's work (a panel on its own), nothing is drawn for upload or delete", () => {
    const kit = editorKit({ document: widgetPage() });
    kit.ui.getState().setMedia([item("a", "A")]);
    kit.render(<MediaLibrary purpose={{ kind: "pick", confirm: "Add image", multiple: false, onPick: () => null }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Media library" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "a.png" }));
    expect(within(dialog).queryByRole("button", { name: "Upload images" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Delete from library" })).toBeNull();
    expect(within(dialog).getByText("Images you upload are available on every page.")).toBeTruthy();
  });
});
