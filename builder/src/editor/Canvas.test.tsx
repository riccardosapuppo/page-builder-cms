// The canvas: every block of the page is a group with its role described;
// a click selects the block it falls in and draws its marks and clamp
// there and nowhere else; the clamp moves the block, its menus duplicate
// and delete by their commands, and its keys give their place to bold,
// italic and link while a text is written; a "+" opens its picker, which
// adds by one command; the page's links do nothing; the width previewed
// narrows the page root; an empty page offers its first section.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { makeSetProps } from "../document/commands.ts";
import type { PageDocument } from "../shared/document.ts";
import { BlockMenu } from "./BlockMenu.tsx";
import { Canvas, dimensionOf, relationOf, tabStopOf } from "./Canvas.tsx";

const root = (id: string) => document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`)!;

test("every block is a group whose role is described, named as the navigator names it", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  expect(screen.getByRole("main", { name: "Page canvas" })).toBeTruthy();
  const described = [...document.querySelectorAll(".canvas [data-block-id]")].map((e) => `${e.getAttribute("role")} ${e.getAttribute("aria-roledescription")} ${e.getAttribute("aria-label")}`);
  expect(described).toEqual([
    "group section Hero", "group column Column 1", "group widget Heading", "group widget Text", "group widget Button", "group column Column 2", "group widget Image",
    "group section Join", "group column Column 1", "group widget Divider", "group widget Quote", "group widget Gallery",
  ]);
  // Nothing selected: the first section is the canvas's one Tab stop.
  expect([...document.querySelectorAll<HTMLElement>(".canvas [data-block-id]")].filter((e) => e.tabIndex === 0).map((e) => e.dataset.blockId)).toEqual(["hero"]);
});

test("a click selects the block it falls in, whose marks and clamp are drawn there only, with the + on its edge and on the seam below its section", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  fireEvent.click(within(root("h1")).getByText("Winter series"));
  expect(kit.store.getState().selection).toBe("h1");
  expect(kit.ui.getState().tray).toBe("edit");
  const clamps = screen.getAllByRole("toolbar");
  expect(clamps).toHaveLength(1);
  expect(clamps[0]!.getAttribute("aria-label")).toBe("Heading tools");
  expect(clamps[0]!.getAttribute("aria-orientation")).toBe("vertical");
  expect(root("h1").contains(clamps[0]!)).toBe(true);
  expect(root("h1").tabIndex).toBe(0);
  // From the top: the head (the block menu), the grip, the moves, More.
  expect(within(clamps[0]!).getAllByRole("button").map((key) => key.getAttribute("aria-label"))).toEqual([
    "Heading: block menu", "Drag to move, or press Space to pick up", "Move up", "Move down", "More: copy, paste, duplicate, insert, delete",
  ]);
  // The "+" on its bottom edge, and on the seam below Hero only.
  expect(within(root("h1")).getByRole("button", { name: "Add a block after Heading" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /^Add a section/ }).map((plus) => plus.getAttribute("aria-label"))).toEqual(["Add a section after Hero"]);
  expect(root("hero").querySelector(":scope > .ins-sec")).not.toBeNull();
});

test("the clamp is one Tab stop, its arrows go along it and Esc goes back to the block", () => {
  const kit = editorKit({ document: page(), selection: "t1" });
  kit.render(<Canvas />);
  const clamp = screen.getByRole("toolbar", { name: "Text tools" });
  const keys = within(clamp).getAllByRole("button");
  expect(keys.map((key) => key.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  keys[0]!.focus();
  fireEvent.keyDown(keys[0]!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(keys[1]);
  expect(keys.map((key) => key.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
  fireEvent.keyDown(keys[1]!, { key: "End" });
  expect(document.activeElement).toBe(keys[4]);
  fireEvent.keyDown(keys[4]!, { key: "ArrowUp" });
  expect(document.activeElement).toBe(keys[3]);
  fireEvent.keyDown(keys[3]!, { key: "Escape" });
  expect(document.activeElement).toBe(root("t1"));
});

test("the page's links do nothing on the canvas and take no focus", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  const link = root("h1").querySelector("a")!;
  expect(link.tabIndex).toBe(-1);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(kit.store.getState().selection).toBe("h1");
});

test("a form's fields and button take no focus on the canvas, and its button sends nothing", () => {
  const doc = page();
  const form = { id: "f1", type: "form", props: { items: [{ name: "name", kind: "text", label: "Name", required: true, maxLength: 100 }, { name: "notes", kind: "textarea", label: "Notes", required: false, maxLength: 1000 }, { name: "ok", kind: "checkbox", label: "OK", required: true }], submitLabel: "Send", confirmation: "Sent." }, children: [], style: { base: {} } };
  (doc.sections[0]!.children[0]!.children as unknown[]).push(form);
  const kit = editorKit({ document: doc });
  kit.render(<Canvas />);
  // The three fields, the field for robots and the button.
  const stops = [...root("f1").querySelectorAll<HTMLElement>(".sw-form input:not([type=hidden]), .sw-form textarea, .sw-form button")];
  expect(stops.map((element) => [element.getAttribute("name") ?? element.textContent, element.tabIndex])).toEqual([
    ["answers[name]", -1], ["answers[notes]", -1], ["answers[ok]", -1], ["website", -1], ["Send", -1],
  ]);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  within(root("f1")).getByRole("button", { name: "Send" }).dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(kit.store.getState().selection).toBe("f1");
});

test("the clamp's moves are one command each, the key kept; at an end the move says why it cannot be made", () => {
  const kit = editorKit({ document: page(), selection: "t1" });
  kit.render(<><Canvas /><BlockMenu /></>);
  const column = () => kit.doc().sections[0]!.children[0]!.children.map((w) => w.id);
  fireEvent.click(screen.getByRole("button", { name: "Move up" }));
  expect(column()).toEqual(["t1", "h1", "b1"]);
  expect(kit.lastCommand()).toMatchObject({ kind: "move", label: "Moved Text in Hero" });
  // First in its column now: the key says so and does nothing.
  const up = screen.getByRole("button", { name: "Move up" });
  expect(up.getAttribute("aria-disabled")).toBe("true");
  expect(up.getAttribute("title")).toBe("Already the first block in Column 1");
  fireEvent.click(up);
  expect(kit.store.getState().past).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Move down" }));
  expect(column()).toEqual(["h1", "t1", "b1"]);
  expect(kit.store.getState().past).toHaveLength(2);
  // A column moves left and right.
  act(() => kit.store.getState().select("c1"));
  expect(screen.getByRole("toolbar", { name: "Column 1 tools" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Move left" }).getAttribute("title")).toBe("Already the first column");
  fireEvent.click(screen.getByRole("button", { name: "Move right" }));
  expect(kit.doc().sections[0]!.children.map((c) => c.id)).toEqual(["c2", "c1"]);
});

test("More duplicates and deletes the block by their commands, the same menu a right click opens", () => {
  const kit = editorKit({ document: page(), selection: "b1" });
  kit.render(<><Canvas /><BlockMenu /></>);
  const more = () => fireEvent.click(screen.getByRole("button", { name: /^More: / }));
  more();
  expect(screen.getByRole("button", { name: /^More: / }).getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(within(screen.getByRole("menu", { name: "Button actions" })).getByRole("menuitem", { name: /^Duplicate/ }));
  const column = () => kit.doc().sections[0]!.children[0]!.children.map((w) => w.id);
  expect(column()).toEqual(["h1", "t1", "b1", "n1"]);
  expect(kit.lastCommand()).toMatchObject({ kind: "duplicate", label: "Duplicated Button in Hero" });
  expect(kit.store.getState().selection).toBe("n1");

  more();
  fireEvent.click(within(screen.getByRole("menu", { name: "Button actions" })).getByRole("menuitem", { name: /^Delete/ }));
  expect(column()).toEqual(["h1", "t1", "b1"]);
  expect(kit.lastCommand()).toMatchObject({ kind: "delete", label: "Deleted Button in Hero" });
  // The focus goes to the neighbour, now selected.
  expect(kit.store.getState().selection).toBe("b1");
  // The head opens the block menu: the moves, then the same items.
  fireEvent.click(screen.getByRole("button", { name: "Button: block menu" }));
  expect(within(screen.getByRole("menu", { name: "Button: block menu" })).getAllByRole("menuitem").map((item) => item.getAttribute("data-item"))).toEqual([
    "back", "on", "copy", "paste", "duplicate", "before", "after", "parent", "delete",
  ]);
  // Pressed again, it closes it.
  fireEvent.click(screen.getByRole("button", { name: "Button: block menu" }));
  expect(screen.queryByRole("menu")).toBeNull();
});

test("a refusal from the clamp's menu is said, and the page stays as it was", () => {
  const kit = editorKit({ document: page(), selection: "c3" });
  kit.render(<><Canvas /><BlockMenu /></>);
  fireEvent.click(screen.getByRole("button", { name: /^More: / }));
  fireEvent.click(within(screen.getByRole("menu", { name: "Column 1 actions" })).getByRole("menuitem", { name: /^Delete/ }));
  expect(kit.doc().sections[1]!.children).toHaveLength(1);
  expect(kit.ui.getState().notice).toBe("Join must keep at least 1 column.");
});

test("while a text is written, the clamp's moving keys give their place to bold, italic and link", () => {
  const kit = editorKit({ document: page(), selection: "t1" });
  const calls: string[] = [];
  const tools = {
    id: "t1", bold: true, italic: false, link: null, linkOpen: false,
    run: { toggleBold: () => calls.push("bold"), toggleItalic: () => calls.push("italic"), openLink: () => calls.push("link"), closeLink: () => calls.push("close"), applyLink: () => null, removeLink: () => calls.push("remove") },
  };
  kit.render(<Canvas />);
  act(() => kit.ui.setState({ textTools: tools }));
  const clamp = screen.getByRole("toolbar", { name: "Text formatting" });
  // The grip and More stay: the block can still move and be duplicated.
  expect(within(clamp).getAllByRole("button").map((key) => [key.getAttribute("aria-label"), key.getAttribute("aria-pressed"), key.tabIndex])).toEqual([
    ["Drag to move, or press Space to pick up", null, -1], ["Bold", "true", 0], ["Italic", "false", -1], ["Link", "false", -1], ["More: copy, paste, duplicate, insert, delete", null, -1],
  ]);
  expect(within(clamp).getByRole("img", { name: "Text, being written" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
  // The "+" on the text's edge waits while it is written.
  expect(screen.queryByRole("button", { name: "Add a block after Text" })).toBeNull();
  for (const name of ["Bold", "Italic", "Link"]) fireEvent.click(within(clamp).getByRole("button", { name }));
  expect(calls).toEqual(["bold", "italic", "link"]);
  // Esc in the clamp goes back into the text.
  fireEvent.keyDown(within(clamp).getByRole("button", { name: "Bold" }), { key: "Escape" });
  expect(calls.at(-1)).toBe("close");
  // The text closed: the moves are back.
  act(() => kit.ui.setState({ textTools: null }));
  expect(screen.getByRole("toolbar", { name: "Text tools" })).toBeTruthy();
});

test("a + opens its yellow line and the picker beside it, which offers only what fits there and adds by one command", async () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<Canvas />);
  fireEvent.click(screen.getByRole("button", { name: "Add a block after Heading" }));
  const picker = screen.getByRole("dialog", { name: "Add a block after Heading" });
  // The line opens in the column, after the heading, and its "+" is open.
  const slot = root("c1").querySelector(":scope > .ins-slot-wrap")!;
  expect(slot).not.toBeNull();
  expect(within(slot as HTMLElement).getByRole("button", { name: "Add a block after Heading" }).getAttribute("aria-expanded")).toBe("true");
  // Widgets only, all of them.
  expect(within(picker).getAllByRole("button").filter((key) => key.classList.contains("pkey")).map((key) => key.textContent)).toEqual([
    "Heading", "Text", "Image", "Button", "Divider", "Spacer", "Gallery", "Video", "Map", "Icon box", "Quote", "Accordion", "Form",
  ]);
  expect(picker.textContent).toContain("Lands on the yellow line, after Heading.");
  // The search narrows them; Enter adds the first.
  fireEvent.change(within(picker).getByRole("searchbox", { name: "Search blocks" }), { target: { value: "quo" } });
  expect(within(picker).getAllByRole("button").filter((key) => key.classList.contains("pkey")).map((key) => key.textContent)).toEqual(["Quote"]);
  fireEvent.keyDown(within(picker).getByRole("searchbox", { name: "Search blocks" }), { key: "Enter" });
  expect(kit.doc().sections[0]!.children[0]!.children.map((w) => w.type)).toEqual(["heading", "quote", "text", "button"]);
  expect(kit.lastCommand()).toMatchObject({ kind: "insert", label: "Added Quote to Column 1 in Hero" });
  expect(kit.store.getState().past).toHaveLength(1);
  expect(kit.store.getState().selection).toBe("n1");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(root("c1").querySelector(":scope > .ins-slot-wrap")).toBeNull();
});

test("the seam's picker offers 1 to 4 columns and the ready-made sections, and Esc closes it with nothing added", () => {
  const kit = editorKit({ document: page(), selection: "q1" });
  kit.render(<Canvas />);
  // Below Join, the section that holds the selection: the page's end.
  fireEvent.click(screen.getByRole("button", { name: "Add a section after Join" }));
  const picker = screen.getByRole("dialog", { name: "Add a section after Join" });
  expect(within(picker).getByRole("group", { name: "Columns" }).textContent).toBe("1 column2 columns3 columns4 columns");
  expect(within(within(picker).getByRole("group", { name: "Ready-made" })).getAllByRole("button").map((key) => key.textContent)).toEqual(["Heading and intro", "Picture beside text", "Three icon boxes"]);
  expect(root("join").querySelector(":scope > .seam")).not.toBeNull();
  fireEvent.keyDown(within(picker).getByRole("searchbox", { name: "Search sections" }), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(kit.store.getState().past).toHaveLength(0);
  // Open again: 2 columns, at the end of the page.
  fireEvent.click(screen.getByRole("button", { name: "Add a section after Join" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Add a section after Join" })).getByRole("button", { name: "2 columns" }));
  expect(kit.doc().sections.map((s) => s.children.length)).toEqual([2, 1, 2]);
  expect(kit.lastCommand()).toMatchObject({ kind: "insert", label: "Added a section with 2 columns" });
  // Its two empty columns each hold a large "+".
  expect(screen.getAllByRole("button", { name: /^Add a block to Column [12]$/ })).toHaveLength(2);
});

test("hovering a block outlines it with its name", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  fireEvent.pointerOver(within(root("q1")).getByText("Cold, then glad."));
  expect(kit.ui.getState().hover).toBe("q1");
  expect(root("q1").querySelector(":scope > .ov-hover")?.textContent).toBe("Quote");
});

test("the width previewed is the page root's, and the canvas tells the bottom line", () => {
  const kit = editorKit({ document: page() });
  const { unmount } = kit.render(<Canvas />);
  act(() => kit.ui.getState().setPreview("tablet"));
  expect(document.querySelector<HTMLElement>(".canvas .site")!.style.width).toBe("768px");
  expect(kit.ui.getState().pageView).toEqual({ width: 768, scale: 1 });
  act(() => kit.ui.getState().setPreview("phone"));
  expect(document.querySelector<HTMLElement>(".canvas .site")!.style.width).toBe("390px");
  expect(kit.ui.getState().pageView).toEqual({ width: 390, scale: 1 });
  // No canvas, no width to say.
  unmount();
  expect(kit.ui.getState().pageView).toBeNull();
});

test("a provider's player on the canvas keeps no address, not even once its block is moved or given a new video", () => {
  const doc = page();
  const video = { id: "v1", type: "video", props: { provider: "youtube", videoId: "dawn-swim01", title: "A dawn swim" }, children: [], style: { base: {} } };
  (doc.sections[1]!.children[0]!.children as unknown[]).push(video);
  const kit = editorKit({ document: doc });
  kit.render(<Canvas />);
  const players = () => [...document.querySelectorAll(".canvas .site iframe")].map((frame) => frame.getAttribute("src"));
  expect(players()).toEqual([null]);
  // The page's renderer wrote it: without the canvas, the frame has one.
  expect(root("v1").querySelector("iframe")?.getAttribute("title")).toBe("A dawn swim");
  // Moved to the top of its column, as a drag's preview moves a block.
  act(() => {
    kit.store.getState().startDrag({ kind: "block", id: "v1" });
    kit.store.getState().dragOver({ parentId: "c3", index: 0 });
  });
  // The video, drawn as the drop line, and the copy left where it stood.
  expect(players()).toEqual([null, null]);
  act(() => void kit.store.getState().drop());
  expect(players()).toEqual([null]);
  // A new video: React writes the new address, the canvas takes it out.
  act(() => {
    const made = makeSetProps(kit.doc(), "v1", { videoId: "night-swim02" });
    if (!made.ok) throw new Error(made.error.message);
    kit.store.getState().dispatch(made.command);
  });
  expect(players()).toEqual([null]);
});

test("a dragged widget keeps a dimmed, inert copy of itself with a Moving chip where it stood, that no lookup takes for the block", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  const ghosts = () => [...document.querySelectorAll<HTMLElement>(".canvas [data-moving-ghost]")];
  expect(ghosts()).toEqual([]);
  act(() => {
    kit.store.getState().startDrag({ kind: "block", id: "t1" });
  });
  // Picked up: the copy where it is, the widget drawn as the drop line beside it.
  expect(ghosts()).toHaveLength(1);
  expect([...root("c1").children].filter((child) => child.hasAttribute("data-block-id")).map((child) => child.getAttribute("data-block-id"))).toEqual(["h1", "t1~moving", "t1", "b1"]);
  act(() => {
    kit.store.getState().dragOver({ parentId: "c3", index: 1 });
  });
  const [ghost] = ghosts();
  expect(ghosts()).toHaveLength(1);
  // In its old column, between the heading and the button, as the text was.
  expect([...root("c1").children].filter((child) => child.hasAttribute("data-block-id")).map((child) => child.getAttribute("data-block-id"))).toEqual(["h1", "t1~moving", "b1"]);
  expect(ghost!.hasAttribute("inert")).toBe(true);
  expect(ghost!.getAttribute("aria-hidden")).toBe("true");
  expect(ghost!.getAttribute("data-block-type")).toBe("text");
  expect(ghost!.textContent).toContain("Meet at the slipway.");
  expect(within(ghost!).getByText("Moving")).toBeTruthy();
  // Not a block of the page: no tab stop, no label, no selection on it.
  expect(ghost!.hasAttribute("tabindex")).toBe(false);
  expect(ghost!.hasAttribute("aria-label")).toBe(false);
  // The widget itself is where it would land, drawn as the drop line.
  expect(root("t1").parentElement).toBe(root("c3"));
  expect(root("t1").getAttribute("data-drag-slot")).toBe("line");
  // Esc: the page as it was, the copy gone, nothing changed in the store.
  act(() => {
    kit.store.getState().cancelDrag();
  });
  expect(ghosts()).toEqual([]);
  expect(root("t1").parentElement).toBe(root("c1"));
});

test("Block edges draws every block's edges on the canvas, and only while it is on", () => {
  const kit = editorKit({ document: page() });
  kit.render(<Canvas />);
  const canvas = document.querySelector(".canvas")!;
  expect(canvas.classList.contains("canvas-edges")).toBe(false);
  act(() => kit.ui.getState().setBlockEdges(true));
  expect(canvas.classList.contains("canvas-edges")).toBe(true);
  act(() => kit.ui.getState().setBlockEdges(false));
  expect(canvas.classList.contains("canvas-edges")).toBe(false);
});

test("an empty page offers its first section", () => {
  const empty: PageDocument = { schemaVersion: 1, title: "Spring series", sections: [] };
  const kit = editorKit({ document: empty });
  kit.render(<Canvas />);
  const offers = screen.getByRole("group", { name: "Add a section" });
  fireEvent.click(within(offers).getByRole("button", { name: "2 columns" }));
  expect(kit.doc().sections).toHaveLength(1);
  expect(kit.doc().sections[0]!.children).toHaveLength(2);
  expect(kit.lastCommand()?.label).toBe("Added a section with 2 columns");
  // Its empty columns each hold a large "+" that adds a block there.
  expect(screen.getAllByRole("button", { name: /^Add a block to Column [12]$/ })).toHaveLength(2);
});

test("a ready-made section comes with its widgets, the page's title as its heading", () => {
  const empty: PageDocument = { schemaVersion: 1, title: "Spring series", sections: [] };
  const kit = editorKit({ document: empty });
  kit.render(<Canvas />);
  fireEvent.click(screen.getByRole("button", { name: "Heading and intro" }));
  const widgets = kit.doc().sections[0]!.children[0]!.children;
  expect(widgets.map((w) => w.type)).toEqual(["heading", "text", "button"]);
  expect(widgets[0]!.props).toEqual({ level: 1, text: "Spring series" });
});

test("how a block stands to the selection", () => {
  const doc = page();
  expect(relationOf(doc, "h1", "h1")).toBe("selected");
  expect(relationOf(doc, "h1", "hero")).toBe("around");
  expect(relationOf(doc, "h1", "c1")).toBe("parent");
  expect(relationOf(doc, "h1", "c2")).toBe("column");
  expect(relationOf(doc, "h1", "join")).toBeNull();
  expect(relationOf(doc, "hero", "c1")).toBeNull();
  expect(relationOf(doc, null, "hero")).toBe("entry");
});

test("the dimension line names the step the previewed device shows, with the device's glyph when it is the device's own", () => {
  // Column 1: M on every device, L of its own on tablets.
  const doc = page();
  expect(dimensionOf(doc, "c1", "desktop")).toEqual({ kind: "pad", label: "M", device: null });
  expect(dimensionOf(doc, "c1", "tablet")).toEqual({ kind: "pad", label: "L", device: "tablet" });
  // A phone shows the base, never the tablet's value: the page's phone
  // rules apply under 560 only, its tablet rules from 560 to 800.
  expect(dimensionOf(doc, "c1", "phone")).toEqual({ kind: "pad", label: "M", device: null });
  // The heading's gap below is its column's Space between, the theme's L.
  expect(dimensionOf(doc, "h1", "tablet")).toEqual({ kind: "gap", label: "L", device: null });

  const kit = editorKit({ document: doc, selection: "c1" });
  kit.ui.setState({ preview: "tablet" });
  kit.render(<Canvas />);
  const line = root("c1").querySelector(":scope > .ov-pad")!;
  expect(line.textContent).toBe("L");
  expect(line.getAttribute("data-device")).toBe("tablet");
  expect(line.querySelector("svg")).not.toBeNull();
  act(() => kit.ui.setState({ preview: "phone" }));
  const phone = root("c1").querySelector(":scope > .ov-pad")!;
  expect(phone.textContent).toBe("M");
  expect(phone.hasAttribute("data-device")).toBe(false);
});

test("the canvas's one Tab stop is a block the device previewed draws: the selection, else the nearest block around it drawn, else the first section drawn", () => {
  const doc = page();
  const hide = (id: string, device: "base" | "tablet" | "phone") => {
    const visit = (blocks: readonly { id: string; style: Record<string, unknown>; children: readonly unknown[] }[]) => {
      for (const block of blocks) {
        if (block.id === id) block.style[device] = { ...(block.style[device] as object | undefined), visibility: "hidden" };
        visit(block.children as typeof blocks);
      }
    };
    visit(doc.sections as unknown as Parameters<typeof visit>[0]);
  };
  hide("h1", "phone");
  hide("c2", "tablet");
  expect(tabStopOf(doc, "h1", "desktop")).toBe("h1");
  expect(tabStopOf(doc, "h1", "phone")).toBe("c1");
  expect(tabStopOf(doc, "i1", "tablet")).toBe("hero");
  expect(tabStopOf(doc, "i1", "phone")).toBe("i1");
  expect(tabStopOf(doc, null, "phone")).toBe("hero");
  hide("hero", "phone");
  expect(tabStopOf(doc, "h1", "phone")).toBe("join");
  expect(tabStopOf(doc, null, "phone")).toBe("join");

  // Drawn: the column around the heading hidden on phones takes the stop.
  const kit = editorKit({ document: doc, selection: "t1" });
  act(() => kit.ui.getState().setPreview("phone"));
  kit.render(<Canvas />);
  const stops = () => [...document.querySelectorAll<HTMLElement>(".canvas [data-block-id]")].filter((e) => e.tabIndex === 0).map((e) => e.dataset.blockId);
  expect(stops()).toEqual(["join"]);
  act(() => kit.store.getState().select("i1"));
  expect(stops()).toEqual(["join"]);
  act(() => kit.ui.getState().setPreview("desktop"));
  expect(stops()).toEqual(["i1"]);
});
