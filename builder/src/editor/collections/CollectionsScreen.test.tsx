// @vitest-environment jsdom
// Collections, from the mark's menu (and the phone's More): offered only
// when the storage keeps collections; with none, what a collection is and
// the first made from a preset, its prefix suggested from its name and
// refused where another collection or a page has it; a collection's entries
// as a table, its first two fields in words, searched by the storage; its
// settings (fields added from the types, keys from labels and fixed once
// entries hold values, moved, deleted after asking, saved, each change made
// to the settings as they are then; once saved, the collection as the
// storage answers it, another tab's field with it, and what changed while
// the save travelled kept); Delete asked twice; the template opened as a
// page is; changes not saved, and text still in its pause, asked about
// before they are left.
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { editorKit } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { field, NEWS, openScreen, press, type } from "../../../test/collections-kit.tsx";
import { FakeCollections } from "../../../test/fake-collections.ts";
import { emptySession } from "../session.tsx";
import { PhoneBar } from "../PhoneBar.tsx";
import { TopBar } from "../TopBar.tsx";

const menuItems = () => within(screen.getByRole("menu", { name: "Page Builder CMS" })).getAllByRole("menuitem").map((item) => item.querySelector("span")?.textContent);

test("the mark's menu offers Collections after Form responses, and the phone's More too, only when the storage keeps them", () => {
  const without = editorKit({ document: page() });
  without.render(<><TopBar /><PhoneBar /></>);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  expect(menuItems()).not.toContain("Collections");
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  expect(within(screen.getByRole("dialog", { name: "More" })).queryByRole("button", { name: "Collections" })).toBeNull();
  without.render(<></>).unmount();
  document.body.innerHTML = "";

  const kit = editorKit({ document: page(), collections: new FakeCollections(), session: { capabilities: { ...emptySession().capabilities, collections: true } } });
  kit.render(<><TopBar /><PhoneBar /></>);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  expect(menuItems().slice(-3)).toEqual(["Collections", "Keyboard shortcuts", "About Page Builder CMS"]);
  fireEvent.click(screen.getByRole("menuitem", { name: "Collections" }));
  expect(kit.ui.getState().collections).toEqual({ collectionId: null });
  kit.ui.getState().setCollections(null);
  fireEvent.click(screen.getByRole("button", { name: "More" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "More" })).getByRole("button", { name: "Collections" }));
  expect(kit.ui.getState().collections).toEqual({ collectionId: null });
  expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
});

test("with no collection, the screen says what one is; the first is made from a preset, its prefix suggested from its name, and opens on its entries", async () => {
  const fake = new FakeCollections();
  const { dialog } = await openScreen(fake);
  expect(within(dialog).getByText("No collections yet", { selector: ".co-empty-title" })).toBeTruthy();
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "New collection" }));
  await press(within(dialog).getByRole("button", { name: "New collection" }));

  const form = within(dialog).getByRole("region", { name: "New collection" });
  await type(field(form, /^Name/), "Winter swims");
  expect(field(form, /^Prefix/)).toHaveProperty("value", "winter-swims");
  const presets = within(form).getByRole("radiogroup", { name: "Start with" });
  expect(within(presets).getAllByRole("radio").map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([
    ["Articles: Summary, Image, Body and Date", "true"],
    ["Events: Date, Place, Summary and Image", "false"],
    ["Blank: No fields yet: add your own.", "false"],
  ]);
  fireEvent.click(within(presets).getByRole("radio", { name: /^Events/ }));
  await press(within(form).getByRole("button", { name: "Create collection" }));

  expect(fake.calls).toContain("createCollection Winter swims /winter-swims");
  expect(fake.collections[0]?.fields.map((f) => [f.key, f.type])).toEqual([["date", "date"], ["place", "text"], ["summary", "paragraph"], ["image", "image"]]);
  expect(fake.collections[0]?.sort).toEqual({ by: "date", direction: "asc" });
  expect(within(dialog).getByRole("button", { name: "Winter swims, /winter-swims, no entries" }).getAttribute("aria-current")).toBe("true");
  expect(within(dialog).getByText("No entries yet", { selector: ".co-empty-title" })).toBeTruthy();
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Write the first entry" }));
  expect(dialog.querySelector(".co-note")?.textContent).toBe("Winter swims is made: write its first entry.");
});

test("a prefix another collection or a page has is refused at the prefix, in the editor's words; nothing is made", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  fake.pageSlugs.add("events");
  const { dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("button", { name: "New collection" }));
  const form = within(dialog).getByRole("region", { name: "New collection" });
  await type(field(form, /^Name/), "More news");
  await type(field(form, /^Prefix/), "news");
  await press(within(form).getByRole("button", { name: "Create collection" }));
  const prefix = field(form, /^Prefix/);
  expect(prefix.getAttribute("aria-invalid")).toBe("true");
  expect(prefix.closest(".field")?.querySelector(".error")?.textContent).toBe("Another collection has this prefix. Choose another.");
  await type(prefix, "events");
  await press(within(form).getByRole("button", { name: "Create collection" }));
  expect(prefix.closest(".field")?.querySelector(".error")?.textContent).toBe("A page has this address. Choose another prefix, or change the page’s.");
  // The editor's own check, before anything is sent.
  await type(prefix, "Not A Prefix");
  const sent = fake.calls.length;
  await press(within(form).getByRole("button", { name: "Create collection" }));
  expect(prefix.closest(".field")?.querySelector(".error")?.textContent).toBe("Lowercase letters, digits and hyphens.");
  expect(fake.calls.length).toBe(sent);
  expect(fake.collections).toHaveLength(1);
});

test("the entries' table: title and slug, status, when each changed, the first two fields in words; the search asks the storage after a pause", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  fake.addEntry(news.id, { title: "First swim", slug: "first-swim", values: { summary: "Cold water.", date: "2026-10-01" } }, { published: true });
  const changed = fake.addEntry(news.id, { title: "Night swim", slug: "night-swim", values: { date: "2026-10-03", image: { mediaId: "m1", alt: "The bay" } } }, { published: true });
  fake.saveElsewhere(changed.id, { title: "Night swim, again" });
  fake.addEntry(news.id, { title: "Race day", slug: "race-day", values: { summary: "Twelve swimmers\nand a boat." } });
  const { kit, dialog } = await openScreen(fake);
  const table = await within(dialog).findByRole("table", { name: /^Entries of News/ });
  expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Title", "Status", "Updated", "Summary", "Image", "Actions"]);
  const rows = within(table).getAllByRole("row").slice(1).map((row) => [...row.querySelectorAll("th, td")].slice(0, 5).map((cell) => cell.textContent));
  // The collection's own order: the latest date first, none last.
  expect(rows.map((r) => [r[0], r[1], r[3], r[4]])).toEqual([
    ["Night swim, again/news/night-swim", "Changed since published", "Not set", "Image: The bay"],
    ["First swim/news/first-swim", "Published", "Cold water.", "Not set"],
    ["Race day/news/race-day", "Draft", "Twelve swimmers and a boat.", "Not set"],
  ]);
  expect(within(dialog).getByText("3 entries, 2 published")).toBeTruthy();

  fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search the titles of News" }), { target: { value: "SWIM" } });
  expect(fake.calls.filter((c) => c.includes("q="))).toEqual([]);
  await act(async () => kit.clock.advance(300));
  expect(fake.calls.filter((c) => c.includes("q="))).toEqual(["listEntries 1 q=SWIM"]);
  expect(within(dialog).getAllByRole("row").slice(1).map((row) => row.querySelector("th")?.textContent)).toEqual(["Night swim, again/news/night-swim", "First swim/news/first-swim"]);
  expect(within(dialog).getByText("2 entries hold “SWIM”")).toBeTruthy();
  fireEvent.change(within(dialog).getByRole("searchbox", { name: "Search the titles of News" }), { target: { value: "tide" } });
  await act(async () => kit.clock.advance(300));
  expect(within(dialog).getByText("No entry’s title holds “tide”.")).toBeTruthy();
});

test("a row publishes and unpublishes its entry; deleted after asking twice, the focus goes to the entry that took its place", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  const a = fake.addEntry(news.id, { title: "A swim", slug: "a", values: { date: "2026-10-03" } });
  const b = fake.addEntry(news.id, { title: "B swim", slug: "b", values: { date: "2026-10-02" } });
  fake.addEntry(news.id, { title: "C swim", slug: "c", values: { date: "2026-10-01" } });
  const { dialog } = await openScreen(fake);
  await within(dialog).findByRole("table");
  await press(within(dialog).getByRole("button", { name: "Publish A swim" }));
  expect(fake.calls).toContain(`publishEntry 1 ${a.id} r0`);
  expect(within(dialog).getByRole("button", { name: "Unpublish A swim" })).toBeTruthy();
  expect(dialog.querySelector(".co-note")?.textContent).toBe("“A swim” is published: visitors find it at /news/a.");
  await press(within(dialog).getByRole("button", { name: "Unpublish A swim" }));
  expect(fake.entries.find((e) => e.id === a.id)?.published).toBeNull();

  fireEvent.click(within(dialog).getByRole("button", { name: "Delete B swim" }));
  const question = within(dialog).getByRole("group", { name: /^Delete “B swim” for good\?/ });
  expect(document.activeElement).toBe(within(question).getByRole("button", { name: "Keep it" }));
  fireEvent.keyDown(question, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Collections" }), "Esc in the question keeps the screen").not.toBeNull();
  expect(fake.calls.some((c) => c.startsWith("deleteEntry"))).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete B swim" }));
  await press(within(dialog).getByRole("button", { name: "Delete entry" }));
  expect(fake.entries.map((e) => e.title)).toEqual(["A swim", "C swim"]);
  expect(document.activeElement).toBe(dialog.querySelector('[data-entry-id="3"]'));
  expect(dialog.querySelector(".co-note")?.textContent).toBe("“B swim” was deleted.");
  expect(within(dialog).getByRole("button", { name: "News, /news, 2 entries" })).toBeTruthy();
  expect(b.id).toBe(2);
});

test("settings: a field added from the types takes its key from its label, moves, and is saved with the rest in one change", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  const { dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  await within(dialog).findByRole("listitem", { name: "Summary, Paragraph" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add a field" }));
  const types = within(dialog).getByRole("group", { name: "Add a field of the type:" });
  expect(within(types).getAllByRole("button").map((b) => b.querySelector("strong")?.textContent).filter(Boolean)).toEqual(["Text", "Paragraph", "Rich text", "Number", "Date", "Image", "Link", "Toggle", "Choice"]);
  await press(within(types).getByRole("button", { name: /^Number/ }));
  const card = within(dialog).getByRole("listitem", { name: "Number, Number" });
  expect(document.activeElement).toBe(field(card, "Label"));
  await type(field(card, "Label"), "Water temperature");
  expect(field(card, "Key")).toHaveProperty("value", "water-temperature");
  await type(field(card, "Lowest"), "0");
  await type(field(card, "Highest"), "30");
  await press(within(card).getByRole("button", { name: "Move Water temperature up" }));
  expect(within(dialog).getAllByRole("listitem").filter((li) => li.classList.contains("co-fieldcard")).map((li) => li.getAttribute("data-field-uid") !== null && li.querySelector(".co-fieldcard-name")?.firstChild?.textContent)).toEqual(["Summary", "Image", "Body", "Water temperature", "Date"]);
  expect(within(dialog).getByText("Changes not saved yet.")).toBeTruthy();
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(fake.calls).toContain("updateCollection 1 fields");
  expect(fake.collections[0]?.fields.map((f) => f.key)).toEqual(["summary", "image", "body", "water-temperature", "date"]);
  expect(fake.collections[0]?.fields[3]).toEqual({ key: "water-temperature", label: "Water temperature", type: "number", required: false, min: 0, max: 30 });
  expect(within(dialog).getByText("Saved.")).toBeTruthy();
});

test("settings: a key following its label is not taken for one typed when the Tab key passes through it before it is drawn again", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  const { dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  await within(dialog).findByRole("listitem", { name: "Summary, Paragraph" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add a field" }));
  await press(within(within(dialog).getByRole("group", { name: "Add a field of the type:" })).getByRole("button", { name: /^Choice/ }));
  const card = within(dialog).getByRole("listitem", { name: "Choice, Choice" });
  const label = field(card, "Label");
  const key = field(card, "Key");
  fireEvent.change(label, { target: { value: "Level" } });
  // Out of act, as a busy browser runs it: the label left, its change
  // drawn and the key told to follow it; then the key passed through by
  // the Tab key before it is drawn again.
  label.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: key }));
  await Promise.resolve();
  key.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  key.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(key).toHaveProperty("value", "level");
  // Still following: a label changed again takes the key with it.
  await type(label, "Grade");
  expect(key).toHaveProperty("value", "grade");
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(fake.collections[0]?.fields.at(-1)).toEqual({ key: "grade", label: "Grade", type: "choice", required: false, options: ["First option"] });
});

test("settings: a label handed over and a switch flipped before it is drawn both stay, each made to the field as it is then", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  const { dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  await within(dialog).findByRole("listitem", { name: "Summary, Paragraph" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add a field" }));
  await press(within(within(dialog).getByRole("group", { name: "Add a field of the type:" })).getByRole("button", { name: /^Choice/ }));
  const card = within(dialog).getByRole("listitem", { name: "Choice, Choice" });
  fireEvent.change(field(card, "Label"), { target: { value: "Level" } });
  // Out of act, as a busy browser may run it (a label handed over at its
  // pause is drawn by a later task): the label handed over, and Required
  // flipped before the label is drawn.
  field(card, "Label").dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  within(card).getByRole("switch", { name: "Required" }).click();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(fake.collections[0]?.fields.at(-1)).toEqual({ key: "level", label: "Level", type: "choice", required: true, options: ["First option"] });
});

test("settings: a field another tab added while they were open is kept: saved, the settings take the collection as the storage holds it, and a second save keeps the field", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  const { dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  await within(dialog).findByRole("listitem", { name: "Summary, Paragraph" });
  // Another tab adds a field; this tab renames the collection, and only
  // the name is sent, merged into the collection as it stands.
  await fake.updateCollection(news.id, { fields: [...NEWS.fields, { key: "place", label: "Place", type: "text", required: false }] });
  await type(field(dialog, /^Name/), "Harbour news");
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(fake.calls.filter((c) => c.startsWith("updateCollection"))).toEqual(["updateCollection 1 fields", "updateCollection 1 name"]);
  expect(fake.collections[0]?.fields.map((f) => f.key)).toEqual(["summary", "image", "body", "date", "place"]);
  // The other tab's field is in the settings now, and nothing waits.
  expect(within(dialog).getByRole("listitem", { name: "Place, Text" })).toBeTruthy();
  expect(within(dialog).getByRole("button", { name: "Save changes" }).getAttribute("aria-disabled")).toBe("true");
  // A second save keeps it.
  await type(field(dialog, /^Name/), "Harbour notices");
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(fake.collections[0]?.name).toBe("Harbour notices");
  expect(fake.collections[0]?.fields.map((f) => f.key)).toEqual(["summary", "image", "body", "date", "place"]);
});

test("settings: what is changed while a save travels stays, a change of its own, over the collection the save answers with", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  const answer = fake.updateCollection;
  let arrive = () => {};
  fake.updateCollection = (collectionId, changes) => new Promise((done) => {
    arrive = () => done(answer(collectionId, changes));
  });
  const { dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  await within(dialog).findByRole("listitem", { name: "Summary, Paragraph" });
  await type(field(dialog, /^Name/), "Harbour news");
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  // While it travels, a field's label changes.
  await type(field(within(dialog).getByRole("listitem", { name: "Summary, Paragraph" }), "Label"), "Short summary");
  await act(async () => arrive());
  expect(fake.collections[0]?.name).toBe("Harbour news");
  expect(fake.collections[0]?.fields[0]?.label).toBe("Summary");
  expect(field(within(dialog).getByRole("listitem", { name: "Short summary, Paragraph" }), "Label")).toHaveProperty("value", "Short summary");
  expect(field(dialog, /^Name/)).toHaveProperty("value", "Harbour news");
  expect(within(dialog).getByRole("button", { name: "Save changes" }).getAttribute("aria-disabled")).toBeNull();
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  await act(async () => arrive());
  expect(fake.collections[0]?.fields[0]?.label).toBe("Short summary");
  expect(fake.collections[0]?.name).toBe("Harbour news");
});

// A save held on its way until the test lets its answer arrive; another
// tab's change goes straight to the storage meanwhile.
function slowSaves(fake: FakeCollections) {
  const elsewhere = fake.updateCollection;
  let arrive = () => {};
  fake.updateCollection = (collectionId, changes) => new Promise((done) => {
    arrive = () => done(elsewhere(collectionId, changes));
  });
  return { elsewhere, arrive: () => act(async () => arrive()) };
}

const fieldOrder = (dialog: HTMLElement) => within(dialog).getAllByRole("listitem").filter((li) => li.classList.contains("co-fieldcard")).map((li) => li.getAttribute("aria-label"));

test("settings: a field moved, and one deleted, while a save travels stay so, changes of their own that the next save sends", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  const { arrive } = slowSaves(fake);
  const { dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  await within(dialog).findByRole("listitem", { name: "Summary, Paragraph" });
  await type(field(dialog, /^Name/), "Harbour news");
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  await press(within(dialog).getByRole("button", { name: "Move Date up" }));
  await arrive();
  expect(fake.collections[0]?.name).toBe("Harbour news");
  expect(fieldOrder(dialog)).toEqual(["Summary, Paragraph", "Image, Image", "Date, Date", "Body, Rich text"]);
  expect(within(dialog).getByRole("button", { name: "Save changes" }).getAttribute("aria-disabled")).toBeNull();
  // Saved, and while that save travels, Image deleted.
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete Image" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete field" }));
  await arrive();
  expect(fake.collections[0]?.fields.map((f) => f.key)).toEqual(["summary", "image", "date", "body"]);
  expect(fieldOrder(dialog)).toEqual(["Summary, Paragraph", "Date, Date", "Body, Rich text"]);
  expect(within(dialog).getByRole("button", { name: "Save changes" }).getAttribute("aria-disabled")).toBeNull();
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  await arrive();
  expect(fake.collections[0]?.fields.map((f) => f.key)).toEqual(["summary", "date", "body"]);
});

test("settings: moved here while another tab added a field, both stay: this tab's order, and the other tab's field before the one it came before", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  const { elsewhere, arrive } = slowSaves(fake);
  const { dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  await within(dialog).findByRole("listitem", { name: "Summary, Paragraph" });
  await type(field(dialog, /^Name/), "Harbour news");
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  // While this save travels, another tab puts Place after Summary, and
  // Date is moved up here.
  const [summary, ...rest] = NEWS.fields;
  await elsewhere(news.id, { fields: [summary!, { key: "place", label: "Place", type: "text", required: false }, ...rest] });
  await press(within(dialog).getByRole("button", { name: "Move Date up" }));
  await arrive();
  expect(fieldOrder(dialog)).toEqual(["Summary, Paragraph", "Place, Text", "Image, Image", "Date, Date", "Body, Rich text"]);
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  await arrive();
  expect(fake.collections[0]?.fields.map((f) => f.key)).toEqual(["summary", "place", "image", "date", "body"]);
});

test("settings: a field deleted after asking, saying the entries keep its values until each is saved again; its key, fixed while entries hold values, and the order that followed it", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  fake.addEntry(news.id, { title: "First swim", slug: "first-swim", values: { date: "2026-10-01" } });
  const { dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  const date = within(dialog).getByRole("listitem", { name: "Date, Date" });
  // An entry holds a value under date: its key is no field to change.
  await within(date).findByText("Fixed: entries hold values under it.");
  expect(within(date).getByRole("textbox", { name: "Key" }).hasAttribute("readonly")).toBe(true);
  expect(within(dialog).getByRole("listitem", { name: "Summary, Paragraph" }).querySelector("[data-field-key] input")?.hasAttribute("readonly")).toBe(false);

  fireEvent.click(within(date).getByRole("button", { name: "Delete Date" }));
  const question = within(date).getByRole("group", { name: /^Delete the field Date\?/ });
  expect(question.textContent).toBe("Delete the field Date? The entries of News keep their Date values until each is saved again, which leaves them out. The entries’ order follows it: it goes back to the last change, newest first. It goes when you save the settings.Keep itDelete field");
  expect(document.activeElement).toBe(within(question).getByRole("button", { name: "Keep it" }));
  fireEvent.click(within(question).getByRole("button", { name: "Delete field" }));
  await press(within(dialog).getByRole("button", { name: "Save changes" }));
  expect(fake.collections[0]?.fields.map((f) => f.key)).toEqual(["summary", "image", "body"]);
  expect(fake.collections[0]?.sort).toEqual({ by: "updatedAt", direction: "desc" });
  // The entry still holds its value: its next save leaves it out.
  expect(fake.entries[0]?.values).toEqual({ date: "2026-10-01" });
});

test("delete a collection, asked twice, saying its entries and template go with it", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  fake.add({ ...NEWS, name: "Events", prefix: "events" });
  fake.addEntry(news.id, { title: "First swim", slug: "first-swim", values: {} }, { published: true });
  fake.addEntry(news.id, { title: "Second swim", slug: "second-swim", values: {} });
  const { dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete collection" }));
  const question = within(dialog).getByRole("group", { name: /^Delete News for good\?/ });
  expect(question.querySelector("p")?.textContent).toBe("Delete News for good? Its 2 entries (1 published) and its template go with it. Nothing of it can be brought back.");
  await act(async () => {
    await Promise.resolve();
  });
  expect(document.activeElement?.textContent).toBe("Keep it");
  await press(within(question).getByRole("button", { name: "Delete collection" }));
  expect(fake.collections.map((c) => c.name)).toEqual(["Events"]);
  expect(fake.entries).toEqual([]);
  expect(within(dialog).getByRole("button", { name: "Events, /events, no entries" }).getAttribute("aria-current")).toBe("true");
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Events, /events, no entries" }));
  expect(dialog.querySelector(".co-note")?.textContent).toBe("News was deleted, with its entries and its template.");
});

test("Edit the template opens it as a page is opened, and the screen closes", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  const openPage = vi.fn(async () => null);
  const { kit, dialog } = await openScreen(fake, { openPage });
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  expect(within(dialog).getByText(/^Every entry of News is drawn with the template/)).toBeTruthy();
  await press(within(dialog).getByRole("button", { name: "Edit the template" }));
  expect(openPage).toHaveBeenCalledWith(news.template.id);
  expect(kit.ui.getState().collections).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Collections" })).toBeNull();
});

test("changes not saved are asked about before they are left: Keep editing stays, Leave without saving goes", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  fake.add({ ...NEWS, name: "Events", prefix: "events" });
  const { kit, dialog } = await openScreen(fake);
  await press(within(dialog).getByRole("tab", { name: "Settings" }));
  await type(field(dialog, /^Name/), "Club news");
  // Another collection: asked first.
  fireEvent.click(within(dialog).getByRole("button", { name: /^Events,/ }));
  const question = within(dialog).getByRole("alertdialog", { name: /^Leave without saving\?/ });
  expect(question.textContent).toContain("The changes to the settings of News are not saved.");
  expect(document.activeElement).toBe(within(question).getByRole("button", { name: "Keep editing" }));
  fireEvent.click(within(question).getByRole("button", { name: "Keep editing" }));
  expect(field(dialog, /^Name/)).toHaveProperty("value", "Club news");
  // Closing, from the window's Esc: asked too; leaving goes.
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.getByRole("dialog", { name: "Collections" })).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Leave without saving" }));
  expect(kit.ui.getState().collections).toBeNull();
  expect(fake.collections[0]?.name).toBe("News");
});

test("text typed and not handed over yet, still in its pause, is asked about too: on Esc, on the way back to the entries, and on another collection", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  fake.add({ ...NEWS, name: "Events", prefix: "events" });
  fake.addEntry(news.id, { title: "First swim", slug: "first-swim", values: { summary: "Cold water." } });
  const { kit, dialog } = await openScreen(fake);
  await press(await within(dialog).findByRole("button", { name: "Edit First swim" }));
  const form = await within(dialog).findByRole("region", { name: "First swim" });
  // Typed, and not handed over: the field has not been left, and its pause
  // has not run out.
  fireEvent.change(field(form, /^Summary/), { target: { value: "Cold water, warm hearts." } });
  expect(kit.ui.getState().pending.waiting).toBe(1);
  const asked = () => within(dialog).getByRole("alertdialog", { name: /^Leave without saving\?/ });
  const keepEditing = () => fireEvent.click(within(asked()).getByRole("button", { name: "Keep editing" }));

  fireEvent.keyDown(field(form, /^Summary/), { key: "Escape" });
  expect(kit.ui.getState().collections).not.toBeNull();
  expect(asked().textContent).toContain("The changes to this entry are not saved.");
  keepEditing();

  fireEvent.click(within(form).getByRole("button", { name: "All entries" }));
  expect(within(dialog).queryByRole("region", { name: "First swim" })).not.toBeNull();
  expect(asked()).toBeTruthy();
  keepEditing();

  fireEvent.click(within(dialog).getByRole("button", { name: /^Events,/ }));
  expect(within(dialog).queryByRole("region", { name: "First swim" })).not.toBeNull();
  expect(asked()).toBeTruthy();
  keepEditing();
  expect(field(form, /^Summary/)).toHaveProperty("value", "Cold water, warm hearts.");
  // Left without saving, it is gone, and the entry is as it was.
  fireEvent.click(within(dialog).getByRole("button", { name: /^Events,/ }));
  await press(within(asked()).getByRole("button", { name: "Leave without saving" }));
  expect(within(dialog).getByRole("heading", { name: "Events" })).toBeTruthy();
  expect(fake.entries[0]?.values).toEqual({ summary: "Cold water." });
});

test("a read that fails says why, and Try again reads again", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  fake.fail("listCollections", { kind: "unknown", cause: "server", status: 500, message: "The CMS failed (500)." });
  const { dialog } = await openScreen(fake);
  expect(await within(dialog).findByText("The collections could not be read: The CMS failed (500).")).toBeTruthy();
  await press(within(dialog).getByRole("button", { name: "Try again" }));
  expect(await within(dialog).findByRole("button", { name: "News, /news, no entries" })).toBeTruthy();
});
