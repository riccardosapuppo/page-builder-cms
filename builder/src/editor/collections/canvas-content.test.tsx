// The collections on the canvas and in the sidebar: a page's Collection
// list draws the storage's published entries, never a draft; a template
// draws its Field blocks with the entry its Page tab picks (the first
// published by default, made-up values when its collection has none), and
// a field with nothing to draw is drawn faintly, saying so; the panels of
// the two blocks, Insert's offer of each, and a Field block pasted where
// only a template takes one.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../../test/editor-kit.tsx";
import { newsCollection, newsEntry, siteOf } from "../../../test/site-entries.ts";
import { clipboardText } from "../../document/clipboard.ts";
import type { Block, PageDocument } from "../../shared/document.ts";
import { FIELD_OUTSIDE } from "../../shared/validate.ts";
import type { Capabilities } from "../../storage/adapter.ts";
import { Canvas } from "../Canvas.tsx";
import { pasteText } from "../clipboard.ts";
import { Palette } from "../Palette.tsx";
import { BlockPanel, TemplatePanel } from "../panels/EditPanel.tsx";
import type { OpenPage } from "../session.tsx";

const CAPABILITIES: Capabilities = { publish: true, schedule: false, responses: false, imageVariants: false, livePages: true, collections: true };
const widget = (id: string, type: string, props: Record<string, unknown>): Block => ({ id, type, props, children: [], style: { base: {} } }) as unknown as Block;
const document = (...widgets: Block[]): PageDocument => ({
  schemaVersion: 1,
  title: "News",
  sections: [{ id: "s", type: "section", props: {}, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: widgets as never }] }],
});
const list = widget("list", "collectionList", { collection: 3, count: 3, order: { by: "day", direction: "desc" }, layout: "grid", columns: 3, date: "day", linkLabel: "Read more", emptyText: "Nothing yet." });
const template: OpenPage = { id: 90, kind: "template", slug: null, home: false, published: null, revision: 1, links: { preview: "/preview/90", live: null }, collection: { id: 3, name: "News", prefix: "news" } };
const page: OpenPage = { id: 7, kind: "page", slug: "news", home: false, published: null, revision: 1, links: { preview: "/preview/7", live: null } };

const news = newsCollection();
const dawn = newsEntry(1, "Dawn swims", "2026-05-02");
const winter = newsEntry(2, "Winter series", "2026-11-01", { values: { "members-only": true } });
const draft = newsEntry(3, "A draft", "2026-12-24", { live: false });
const root = (id: string) => window.document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`)!;

test("a page's Collection list draws the storage's published entries in its order, never a draft, each card linking to its entry's address", () => {
  const kit = editorKit({ document: document(list), session: { current: page, capabilities: CAPABILITIES } });
  act(() => kit.ui.getState().setSiteEntries(siteOf(news, [dawn, winter, draft])));
  kit.render(<Canvas />);

  expect([...root("list").querySelectorAll(".sw-entry-title a")].map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
    ["Winter series", "/news/winter-series"], ["Dawn swims", "/news/dawn-swims"],
  ]);
  expect(root("list").textContent).not.toContain("A draft");
  act(() => kit.ui.getState().setSiteEntries(siteOf(news, [])));
  expect(root("list").querySelector(".sw-entries-empty")?.textContent).toBe("Nothing yet.");
});

test("a template's Field blocks draw the first published entry's draft, another picked in its Page tab, or made-up values; one with nothing to draw says so on the canvas", () => {
  const fields = [widget("t", "field", { field: "title", level: 1 }), widget("d", "field", { field: "day" }), widget("m", "field", { field: "members-only" }), widget("g", "field", { field: "gone" })];
  const kit = editorKit({ document: document(...fields), session: { current: template, capabilities: CAPABILITIES } });
  act(() => kit.ui.getState().setSiteEntries(siteOf(news, [dawn, winter, draft])));
  kit.render(<><Canvas /><TemplatePanel /></>);

  expect(root("t").querySelector("h1")?.textContent).toBe("Winter series");
  expect(root("d").querySelector("time")?.textContent).toBe("Nov 1, 2026");
  expect(root("m").textContent).toBe("Members only");
  expect(root("g").hasAttribute("hidden")).toBe(true);
  expect(root("g").querySelector(".field-none")?.textContent).toBe("No field “gone” in this collection");

  const picker = screen.getByLabelText("Preview with") as HTMLSelectElement;
  expect([...picker.options].map((option) => option.textContent)).toEqual(["A draft (draft)", "Winter series", "Dawn swims", "Sample values"]);
  expect(picker.value).toBe("2");
  fireEvent.change(picker, { target: { value: "1" } });
  expect(root("t").querySelector("h1")?.textContent).toBe("Dawn swims");
  expect(root("m").querySelector(".field-none")?.textContent).toBe("“Members only” is off in this entry");
  fireEvent.change(picker, { target: { value: "sample" } });
  expect(root("t").querySelector("h1")?.textContent).toBe("The title of an entry");
  expect(root("d").querySelector("time")).not.toBeNull();
});

test("the Field panel lists the title and the collection's fields, says what each draws, and draws a text as a heading of a level or as a paragraph", () => {
  const kit = editorKit({ document: document(widget("t", "field", { field: "title", level: 1 })), selection: "t", session: { current: template, capabilities: CAPABILITIES } });
  act(() => kit.ui.getState().setSiteEntries(siteOf(news, [winter])));
  kit.render(<BlockPanel id="t" />);

  const select = screen.getByLabelText("Field") as HTMLSelectElement;
  expect([...select.options].map((option) => option.textContent)).toEqual(["Title", "Summary", "Picture", "Day", "Members only"]);
  fireEvent.click(screen.getByRole("radio", { name: "Text" }));
  expect(kit.block("t")?.props).toEqual({ field: "title" });
  fireEvent.click(screen.getByRole("radio", { name: "H2" }));
  expect(kit.block("t")?.props).toEqual({ field: "title", level: 2 });
  expect(screen.getByText(/The canvas shows the values of “Winter series”/)).toBeTruthy();

  fireEvent.change(select, { target: { value: "day" } });
  expect(kit.block("t")?.props).toEqual({ field: "day", level: 2 });
  expect(kit.lastCommand()?.label).toBe("Changed Field shown in Section 1");
  expect(screen.getByText("The day, written as Oct 15, 2026.")).toBeTruthy();
  expect(screen.queryByRole("radio", { name: "H2" })).toBeNull();
  // A day draws as a text: the text's own groups, not a heading's.
  expect([...window.document.querySelectorAll(".grp .grp-name")].map((name) => name.textContent)).toEqual(["Field", "Size and color", "Type", "Alignment", "Shown on", "Advanced"]);
  fireEvent.change(select, { target: { value: "picture" } });
  expect([...window.document.querySelectorAll(".grp .grp-name")].map((name) => name.textContent)).toEqual(["Field", "Shape", "Shown on", "Advanced"]);
});

test("the Collection list panel chooses the collection, its order and what it keeps, says how many drafts it leaves out, and leads to them", () => {
  const events = newsCollection({ id: 4, name: "Events", prefix: "events", sort: { by: "title", direction: "asc" } });
  const kit = editorKit({ document: document(list), selection: "list", session: { current: page, capabilities: CAPABILITIES } });
  act(() => kit.ui.getState().setSiteEntries({ collections: [news, events], entries: new Map([[3, [dawn, winter, draft]], [4, []]]) }));
  kit.render(<BlockPanel id="list" />);
  const listProps = () => (kit.block("list")?.props ?? {}) as Record<string, unknown>;

  expect(screen.getByText(/A list shows published entries only\. 1 draft is not shown\./)).toBeTruthy();
  const order = screen.getByLabelText("Order") as HTMLSelectElement;
  expect([...order.options].map((option) => option.textContent)).toEqual(["Newest first", "Oldest first", "Title, A to Z", "Title, Z to A", "Day, latest first", "Day, earliest first"]);
  fireEvent.change(order, { target: { value: "title asc" } });
  expect(listProps().order).toEqual({ by: "title", direction: "asc" });
  const show = screen.getByLabelText("Show") as HTMLSelectElement;
  expect([...show.options].map((option) => option.textContent)).toEqual(["Every entry", "Members only: on", "Members only: off"]);
  fireEvent.change(show, { target: { value: JSON.stringify(["members-only", true]) } });
  expect(listProps().filter).toEqual({ field: "members-only", value: true });

  fireEvent.click(screen.getByRole("button", { name: "News in Collections" }));
  expect(kit.ui.getState().collections).toEqual({ collectionId: 3, tab: "entries" });

  // Another collection: its own order, and no filter of the last one's.
  fireEvent.change(screen.getByLabelText("Collection"), { target: { value: "4" } });
  expect(kit.block("list")?.props).toMatchObject({ collection: 4, order: { by: "title", direction: "asc" } });
  expect(listProps().filter).toBeUndefined();
  expect(screen.getByText("Events has no published entry yet: the list says its empty words.")).toBeTruthy();
});

test("Insert offers This entry first in a template, its Field block alone, and a Collection list where the storage keeps collections, naming the first", () => {
  const groups = () => [...window.document.querySelectorAll(".drawer-body .group-title")].map((title) => title.textContent);
  const kit = editorKit({ document: document(widget("h", "heading", { level: 2, text: "News" })), selection: "h", session: { current: template, capabilities: CAPABILITIES } });
  act(() => kit.ui.getState().setSiteEntries(siteOf(news, [])));
  const { unmount } = kit.render(<Palette />);
  expect(groups()).toEqual(["New section, by number of columns", "This entry", "Basic", "Media", "Content", "Site"]);
  expect(within(screen.getByRole("group", { name: "This entry" })).getAllByRole("button").map((key) => key.textContent)).toEqual(["Field"]);
  expect(within(screen.getByRole("group", { name: "Content" })).getAllByRole("button").at(-1)?.textContent).toBe("Collection list");
  fireEvent.click(screen.getByRole("button", { name: "Collection list" }));
  expect(kit.block(kit.store.getState().selection ?? "")?.props).toMatchObject({ collection: 3, order: { by: "day", direction: "desc" }, count: 3, layout: "grid" });
  unmount();

  const plain = editorKit({ document: document(), session: { current: page } });
  plain.render(<Palette />);
  expect(screen.queryByRole("button", { name: "Field" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Collection list" })).toBeNull();
});

test("a Field block pasted into a page is refused, the page unchanged; into a template it is pasted", () => {
  const field = widget("f", "field", { field: "title", level: 1 });
  const kit = editorKit({ document: document(widget("h", "heading", { level: 2, text: "News" })), selection: "h", session: { current: page } });
  const before = kit.doc();

  expect(pasteText(kit.env, clipboardText(field), "canvas", "page")).toEqual({ reason: "nesting", message: FIELD_OUTSIDE });
  expect(kit.doc()).toBe(before);
  expect(kit.ui.getState().notice).toBe(FIELD_OUTSIDE);
  expect(pasteText(kit.env, clipboardText(field), "canvas", "template")).toBeNull();
  expect(kit.doc().sections[0]?.children[0]?.children.map((block) => block.type)).toEqual(["heading", "field"]);
});
