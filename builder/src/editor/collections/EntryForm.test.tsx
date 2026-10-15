// @vitest-environment jsdom
// An entry's form: its slug suggested from its title while it is new; one
// control per type of field; a required field and a value past its bounds
// said at the field before anything is sent; one save with everything, at
// the revision the form was opened at, a save whose answer was lost sent
// again as it was; a link's two parts kept when one comes before the
// other is drawn; the storage's refusals at their fields; values no field
// takes said and left out; a conflict settled by Reload or Keep mine;
// publish and unpublish, an unpublish that finds another tab's newer draft
// saying the conflict at once; an image chosen in the library opened over
// the screen; changes not saved asked about before they are left.
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { field, NEWS, openScreen, press, type } from "../../../test/collections-kit.tsx";
import { FakeCollections } from "../../../test/fake-collections.ts";
import { standInLayout } from "../../../test/text-editor-kit.ts";
import type { Field } from "../../shared/collection.ts";
import type { MediaItem } from "../../storage/adapter.ts";

standInLayout();

const EVERY: Field[] = [
  { key: "summary", label: "Summary", type: "paragraph", required: true },
  { key: "place", label: "Place", type: "text", required: false },
  { key: "temperature", label: "Water temperature", type: "number", required: false, min: 0, max: 30 },
  { key: "day", label: "Day", type: "date", required: false },
  { key: "more", label: "Read more", type: "link", required: false },
  { key: "members", label: "Members only", type: "toggle", required: false },
  { key: "level", label: "Level", type: "choice", required: false, options: ["Beginner", "Strong"] },
  { key: "lane", label: "Lane", type: "choice", required: true, options: ["1", "2", "3", "4", "5"] },
];

const image = (id: string, filename: string): MediaItem => ({ id, alt: "", width: 800, height: 600, contentType: "image/png", byteSize: 1000, filename, url: `https://images.example.org/${filename}`, createdAt: "2026-10-01T09:00:00.000Z" });

async function newEntry(fake: FakeCollections) {
  const opened = await openScreen(fake);
  await press(await within(opened.dialog).findByRole("button", { name: "Write the first entry" }));
  return { ...opened, form: within(opened.dialog).getByRole("region", { name: "New entry" }) };
}

test("a new entry: its slug follows its title; a required field and a number past its bound are said at their fields, and nothing is sent", async () => {
  const fake = new FakeCollections();
  fake.add({ ...NEWS, fields: EVERY, sort: { by: "updatedAt", direction: "desc" } });
  const { form } = await newEntry(fake);
  expect(document.activeElement).toBe(field(form, /^Title/));
  await type(field(form, /^Title/), "First swim of the season!");
  expect(field(form, /^Slug/)).toHaveProperty("value", "first-swim-of-the-season");
  await type(field(form, /^Water temperature/), "45");
  await press(within(form).getByRole("button", { name: "Save" }));

  expect(fake.calls.filter((c) => c.startsWith("createEntry"))).toEqual([]);
  expect(form.querySelector(".co-said")?.textContent).toBe("Not saved: 3 fields need a change, marked below.");
  const errorOf = (control: HTMLElement) => control.closest(".field")?.querySelector(".error")?.textContent;
  expect(errorOf(field(form, /^Summary/))).toBe("Required. Write something here.");
  expect(errorOf(field(form, /^Water temperature/))).toBe("At most 30.");
  expect(field(form, /^Water temperature/).getAttribute("aria-invalid")).toBe("true");
  expect(within(form).getByRole("combobox", { name: /^Lane/ }).closest(".field")?.querySelector(".error")?.textContent).toBe("Required. Choose an option.");
  // The first field marked takes the focus.
  await act(async () => {
    await new Promise((done) => requestAnimationFrame(() => done(null)));
  });
  expect(document.activeElement).toBe(field(form, /^Summary/));
});

test("every type of field, written and saved in one call with its values; then published", async () => {
  const fake = new FakeCollections();
  fake.add({ ...NEWS, fields: EVERY, sort: { by: "updatedAt", direction: "desc" } });
  const { form, dialog } = await newEntry(fake);
  // Nothing saved, nothing to preview.
  expect(within(form).queryByRole("link", { name: "Preview" })).toBeNull();
  await type(field(form, /^Title/), "First swim");
  await type(field(form, /^Summary/), "Cold water,\nwarm hearts.");
  await type(field(form, /^Place/), "North slipway");
  await type(field(form, /^Water temperature/), "14.5");
  fireEvent.change(within(form).getByLabelText(/^Day/), { target: { value: "2026-10-15" } });
  await type(field(form, "Words"), "Join us");
  await type(field(form, "Address"), " /join ");
  fireEvent.click(within(form).getByRole("switch", { name: "Members only" }));
  // Two options: segments, None first; five: a list.
  const level = within(form).getByRole("radiogroup", { name: "Level" });
  expect(within(level).getAllByRole("radio").map((r) => r.textContent)).toEqual(["None", "Beginner", "Strong"]);
  fireEvent.click(within(level).getByRole("radio", { name: "Strong" }));
  const lane = within(form).getByRole("combobox", { name: /^Lane/ });
  expect([...lane.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Choose an option", "1", "2", "3", "4", "5"]);
  fireEvent.change(lane, { target: { value: "3" } });
  await press(within(form).getByRole("button", { name: "Save" }));

  const made = fake.calls.filter((c) => c.startsWith("createEntry"));
  expect(made).toHaveLength(1);
  expect(fake.entries[0]).toMatchObject({
    title: "First swim",
    slug: "first-swim",
    values: { summary: "Cold water,\nwarm hearts.", place: "North slipway", temperature: 14.5, day: "2026-10-15", more: { label: "Join us", href: "/join" }, members: true, level: "Strong", lane: "3" },
  });
  expect(form.querySelector(".co-said")?.textContent).toMatch(/^Saved, Today, /);
  expect(within(form).getByRole("heading", { name: "First swim" })).toBeTruthy();
  expect(form.querySelector(".co-form-state")?.textContent).toMatch(/^Draft·Updated Today, /);
  // Saved, its draft has a preview: in the template, on the CMS.
  const preview = within(form).getByRole("link", { name: "Preview" });
  expect(preview.getAttribute("href")).toMatch(/^https?:\/\/[^/]+\/preview\/101\?entry=1$/);
  expect(preview.getAttribute("target")).toBe("_blank");

  await press(within(form).getByRole("button", { name: "Publish" }));
  expect(fake.calls.filter((c) => c.startsWith("publishEntry"))).toEqual(["publishEntry 1 1 r0"]);
  expect(form.querySelector(".co-said")?.textContent).toBe("Published: visitors find it at /news/first-swim.");
  expect(form.querySelector(".co-form-state")?.textContent).toMatch(/^Published·/);
  await press(within(form).getByRole("button", { name: "Unpublish" }));
  expect(fake.entries[0]?.published).toBeNull();
  expect(form.querySelector(".co-said")?.textContent).toBe("Unpublished: visitors no longer find it. Its draft is kept.");
  // The list's counts follow.
  expect(within(dialog).getByRole("button", { name: "News, /news, 1 entry" })).toBeTruthy();
});

test("a link's words handed over, then its address before the words are drawn: the link keeps both", async () => {
  const fake = new FakeCollections();
  fake.add({ ...NEWS, fields: [{ key: "more", label: "Read more", type: "link", required: false }], sort: { by: "updatedAt", direction: "desc" } });
  const { form } = await newEntry(fake);
  await type(field(form, /^Title/), "First swim");
  const words = field(form, "Words");
  const address = field(form, "Address");
  fireEvent.change(words, { target: { value: "Join us" } });
  fireEvent.change(address, { target: { value: "/join" } });
  // Out of act, as a busy browser may run it: each part handed over, the
  // second before the first is drawn.
  words.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  address.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await press(within(form).getByRole("button", { name: "Save" }));
  expect(fake.entries[0]?.values).toEqual({ more: { label: "Join us", href: "/join" } });
});

test("the storage's refusal of a slug another entry has is laid on the slug", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  fake.addEntry(news.id, { title: "First swim", slug: "first-swim", values: {} });
  const { dialog } = await openScreen(fake);
  await press(await within(dialog).findByRole("button", { name: "New entry" }));
  const form = within(dialog).getByRole("region", { name: "New entry" });
  await type(field(form, /^Title/), "First swim");
  await press(within(form).getByRole("button", { name: "Save" }));
  const slug = field(form, /^Slug/);
  expect(slug.getAttribute("aria-invalid")).toBe("true");
  expect(slug.closest(".field")?.querySelector(".error")?.textContent).toBe("Another entry of this collection has this address. Choose another.");
  await type(slug, "first-swim-again");
  await press(within(form).getByRole("button", { name: "Save" }));
  expect(fake.entries.map((e) => e.slug)).toEqual(["first-swim", "first-swim-again"]);
  expect(slug.getAttribute("aria-invalid")).toBeNull();
});

test("an entry holding values no field takes says so, and its save leaves them out", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  // A field deleted since ("hero"), and a key given to a field of another
  // type ("date" now holds a number).
  const entry = fake.addEntry(news.id, { title: "Old one", slug: "old-one", values: { summary: "Kept", hero: "x", date: 20261015 } as never });
  const { dialog } = await openScreen(fake);
  await press(await within(dialog).findByRole("button", { name: "Edit Old one" }));
  const form = await within(dialog).findByRole("region", { name: "Old one" });
  expect(form.querySelector(".co-left")?.textContent).toBe("This entry still holds values no field of News takes (hero, date). Saving leaves them out.");
  await press(within(form).getByRole("button", { name: "Save" }));
  expect(fake.calls.filter((c) => c.startsWith("saveEntry"))).toEqual([`saveEntry 1 ${entry.id} r0 {"title":"Old one","slug":"old-one","values":{"summary":"Kept"}}`]);
  expect(fake.entries[0]?.values).toEqual({ summary: "Kept" });
  expect(form.querySelector(".co-left")).toBeNull();
});

test("a save whose answer was lost is sent again as it was, and answered as saved", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  fake.addEntry(news.id, { title: "First swim", slug: "first-swim", values: {} });
  const { dialog } = await openScreen(fake);
  await press(await within(dialog).findByRole("button", { name: "Edit First swim" }));
  const form = await within(dialog).findByRole("region", { name: "First swim" });
  await type(field(form, /^Summary/), "Cold water.");
  fake.loseNextSave();
  await press(within(form).getByRole("button", { name: "Save" }));
  expect(form.querySelector(".co-said")?.textContent).toBe("Not saved: The CMS did not answer. Your changes are still here: try again.");
  await press(within(form).getByRole("button", { name: "Save" }));
  const saves = fake.calls.filter((c) => c.startsWith("saveEntry"));
  expect(saves).toHaveLength(2);
  expect(saves[0]).toBe(saves[1]);
  expect(fake.entries[0]?.revision).toBe(1);
  expect(form.querySelector(".co-said")?.textContent).toMatch(/^Saved, /);
});

test("a conflict: another tab saved first; the banner asks; Keep mine saves this one over it, Reload takes the other's", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  const entry = fake.addEntry(news.id, { title: "First swim", slug: "first-swim", values: { summary: "Mine to change" } });
  const { dialog } = await openScreen(fake);
  await press(await within(dialog).findByRole("button", { name: "Edit First swim" }));
  let form = await within(dialog).findByRole("region", { name: "First swim" });
  await type(field(form, /^Summary/), "This tab's words");
  fake.saveElsewhere(entry.id, { values: { summary: "The other tab's words" } });
  await press(within(form).getByRole("button", { name: "Save" }));
  const banner = within(form).getByRole("alert");
  expect(banner.textContent).toContain("Changed in another tab. This entry was saved in another tab after you opened it. Saving waits until you choose.");
  expect(within(form).getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
  await press(within(banner).getByRole("button", { name: "Keep mine" }));
  expect(fake.calls.filter((c) => c.startsWith("saveEntry")).map((c) => c.split(" ")[3])).toEqual(["r0", "r1"]);
  expect(fake.entries[0]?.values).toEqual({ summary: "This tab's words" });
  expect(form.querySelector(".co-said")?.textContent).toMatch(/^Kept this tab’s entry: it is saved over the other one, /);

  // Again, and this time Reload: the other tab's words in the form.
  fake.saveElsewhere(entry.id, { values: { summary: "Theirs again" } });
  await type(field(form, /^Summary/), "Mine again");
  await press(within(form).getByRole("button", { name: "Save" }));
  await press(within(within(form).getByRole("alert")).getByRole("button", { name: "Reload" }));
  form = within(dialog).getByRole("region", { name: "First swim" });
  expect(field(form, /^Summary/)).toHaveProperty("value", "Theirs again");
  expect(within(form).queryByRole("alert")).toBeNull();
  expect(form.querySelector(".co-said")?.textContent).toBe("Reloaded: this is the entry as the other tab saved it.");
});

test("an unpublish after another tab saved the draft lands, and says the conflict at once: the other tab's draft is not saved over unasked", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  const entry = fake.addEntry(news.id, { title: "First swim", slug: "first-swim", values: { summary: "As this tab read it" } }, { published: true });
  const { dialog } = await openScreen(fake);
  await press(await within(dialog).findByRole("button", { name: "Edit First swim" }));
  const form = await within(dialog).findByRole("region", { name: "First swim" });
  // Another tab saves a newer draft; this form still holds the one it read.
  fake.saveElsewhere(entry.id, { values: { summary: "The other tab's words" } });
  await press(within(form).getByRole("button", { name: "Unpublish" }));
  expect(fake.entries[0]?.published).toBeNull();
  expect(form.querySelector(".co-said")?.textContent).toBe("Unpublished: visitors no longer find it. Its draft is kept.");
  // The draft kept is not the one in this form: said now, with its choices,
  // and Save waits for one.
  const banner = within(form).getByRole("alert");
  expect(banner.textContent).toContain("Changed in another tab. This entry was saved in another tab after you opened it. Saving waits until you choose.");
  await type(field(form, /^Summary/), "This tab's words");
  expect(within(form).getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
  await press(within(form).getByRole("button", { name: "Save" }));
  expect(fake.calls.filter((c) => c.startsWith("saveEntry"))).toEqual([]);
  expect(fake.entries[0]?.values).toEqual({ summary: "The other tab's words" });
  // Keep mine, chosen, saves this tab's draft over it.
  await press(within(banner).getByRole("button", { name: "Keep mine" }));
  expect(fake.calls.filter((c) => c.startsWith("saveEntry")).map((c) => c.split(" ")[3])).toEqual(["r1"]);
  expect(fake.entries[0]?.values).toEqual({ summary: "This tab's words" });
});

test("a publish from the list that a field refuses opens the entry, the field marked", async () => {
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  fake.addEntry(news.id, { title: "First swim", slug: "first-swim", values: {} });
  // The summary made required after the entry was saved.
  fake.collections[0]!.fields = fake.collections[0]!.fields.map((f) => (f.key === "summary" ? { ...f, required: true } : f));
  const { dialog } = await openScreen(fake);
  await press(await within(dialog).findByRole("button", { name: "Publish First swim" }));
  const form = await within(dialog).findByRole("region", { name: "First swim" });
  expect(form.querySelector(".co-said")?.textContent).toBe("Not published: fill in the marked fields, then publish.");
  expect(field(form, /^Summary/).closest(".field")?.querySelector(".error")?.textContent).toBe("Required. Write something here.");
  await type(field(form, /^Summary/), "Cold water.");
  await press(within(form).getByRole("button", { name: "Publish" }));
  expect(fake.entries[0]?.published?.values).toEqual({ summary: "Cold water." });
});

test("an image of the library, chosen in the library opened over the screen: no image from another site; Esc closes the library alone", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  const { kit, form, dialog } = await newEntry(fake);
  kit.ui.getState().setMedia([image("m1", "harbour.png"), image("m2", "slipway.png")]);
  const choose = within(form).getByRole("button", { name: "Choose image" });
  fireEvent.click(choose);
  const library = screen.getByRole("dialog", { name: "Media library" });
  expect(within(library).queryByText("Or an image from another site")).toBeNull();
  // The screen under it waits.
  expect(dialog.hasAttribute("inert")).toBe(true);
  fireEvent.keyDown(within(library).getAllByRole("radio")[0]!, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Media library" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "Collections" })).toBeTruthy();
  expect(dialog.hasAttribute("inert")).toBe(false);
  expect(document.activeElement).toBe(choose);

  fireEvent.click(choose);
  const again = screen.getByRole("dialog", { name: "Media library" });
  fireEvent.click(within(again).getByRole("radio", { name: "slipway.png, no alt text" }));
  fireEvent.change(within(again).getByRole("textbox", { name: /^Alt text/ }), { target: { value: "The slipway at dawn" } });
  await act(async () => fireEvent.click(within(again).getByRole("button", { name: "Use image" })));
  expect(screen.queryByRole("dialog", { name: "Media library" })).toBeNull();
  expect(document.activeElement).toBe(within(form).getByRole("button", { name: "Replace image" }));
  expect(within(form).getByText("slipway.png")).toBeTruthy();
  expect(field(form, /^Alt text/)).toHaveProperty("value", "The slipway at dawn");
  await type(field(form, /^Title/), "With a picture");
  await press(within(form).getByRole("button", { name: "Save" }));
  expect(fake.entries[0]?.values.image).toEqual({ mediaId: "m2", alt: "The slipway at dawn" });
});

test("a rich text is written in the text widget's editor, its bold, italic and link above it", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  const { form } = await newEntry(fake);
  const text = await within(form).findByRole("textbox", { name: "Body" });
  expect(text.getAttribute("contenteditable")).toBe("true");
  const tools = within(form).getByRole("toolbar", { name: "Body: formatting" });
  expect(within(tools).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Bold", "Italic", "Link"]);
  fireEvent.click(within(tools).getByRole("button", { name: "Link" }));
  const link = within(form).getByRole("group", { name: "Link to" });
  // Esc in the link's field goes back to the text; the screen stays.
  fireEvent.keyDown(link.querySelector("input")!, { key: "Escape" });
  expect(within(form).queryByRole("group", { name: "Link to" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "Collections" })).toBeTruthy();
});

test("a number the field cannot take stays in it, marked, and Save waits for it", async () => {
  const fake = new FakeCollections();
  fake.add({ ...NEWS, fields: [{ key: "price", label: "Price", type: "number", required: false }], sort: { by: "price", direction: "asc" } });
  const { form } = await newEntry(fake);
  await type(field(form, /^Title/), "Cold");
  const temperature = field(form, /^Price/);
  fireEvent.focus(temperature);
  fireEvent.change(temperature, { target: { value: "1,5" } });
  await press(within(form).getByRole("button", { name: "Save" }));
  expect(fake.calls.filter((c) => c.startsWith("createEntry"))).toEqual([]);
  expect(form.querySelector(".co-said")?.textContent).toBe("Not saved: a field holds what it cannot take. Change it first.");
  expect(temperature.closest(".field")?.querySelector(".error")?.textContent).toBe("Write a number, with two decimals at most: 1250.50.");
  await type(temperature, "1,250.50");
  await press(within(form).getByRole("button", { name: "Save" }));
  expect(form.querySelector(".co-said")?.textContent).toMatch(/^Saved, /);
  expect(fake.entries[0]?.values).toEqual({ price: 1250.5 });
});

test("changes not saved are asked about before the form is left; the question's Esc keeps them", async () => {
  const fake = new FakeCollections();
  fake.add(NEWS);
  const { dialog, form } = await newEntry(fake);
  await type(field(form, /^Title/), "Half written");
  fireEvent.click(within(form).getByRole("button", { name: "All entries" }));
  const question = within(dialog).getByRole("alertdialog", { name: /^Leave without saving\?/ });
  expect(question.textContent).toContain("The changes to this entry are not saved.");
  fireEvent.keyDown(question, { key: "Escape" });
  expect(within(dialog).queryByRole("alertdialog")).toBeNull();
  expect(field(form, /^Title/)).toHaveProperty("value", "Half written");
  fireEvent.click(within(form).getByRole("button", { name: "All entries" }));
  await press(within(dialog).getByRole("button", { name: "Leave without saving" }));
  expect(within(dialog).queryByRole("region", { name: "New entry" })).toBeNull();
  expect(fake.entries).toEqual([]);
  expect(document.activeElement).toBe(await within(dialog).findByRole("button", { name: "Write the first entry" }));
});

test("a refusal goes from its field once the field is changed, and the line about marked fields with the last of them", async () => {
  const fake = new FakeCollections();
  fake.add({ ...NEWS, fields: [EVERY[0]!, EVERY[2]!] });
  const { form } = await newEntry(fake);
  await type(field(form, /^Title/), "Cold");
  await type(field(form, /^Water temperature/), "45");
  await press(within(form).getByRole("button", { name: "Save" }));
  expect(form.querySelector(".co-said")?.textContent).toBe("Not saved: 2 fields need a change, marked below.");
  await type(field(form, /^Summary/), "Cold water.");
  expect(field(form, /^Summary/).getAttribute("aria-invalid")).toBeNull();
  expect(field(form, /^Water temperature/).getAttribute("aria-invalid")).toBe("true");
  expect(form.querySelector(".co-said")?.textContent).toBe("Not saved: 2 fields need a change, marked below.");
  await type(field(form, /^Water temperature/), "12");
  expect(field(form, /^Water temperature/).getAttribute("aria-invalid")).toBeNull();
  expect(form.querySelector(".co-said")?.textContent).toBe("");
});
