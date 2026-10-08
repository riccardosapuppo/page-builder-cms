// @vitest-environment jsdom
// Form responses, from the mark's menu: offered only when the storage keeps
// responses; the site's forms with their counts; the chosen form's
// responses newest first, a table with headers, each row with when it was
// sent and the page's version; one response opened whole, a visitor's
// markup and links shown as text; delete asked first, with the focus where
// the person is after it; the older responses a part at a time; a read
// that fails, and its Try again.
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { draftWith, FakeResponses, formBlock } from "../../../test/fake-responses.ts";
import { StorageError } from "../../storage/adapter.ts";
import { serverTime } from "../history-words.ts";
import { TopBar } from "../TopBar.tsx";

// Two published pages with forms, and a third never published.
function site(): FakeResponses {
  const fake = new FakeResponses();
  fake.page(1, "Home", 3, draftWith("Home", [{ label: "Join", widgets: [formBlock("join")] }]));
  fake.page(2, "Winter series", 1, draftWith("Winter series", [{ label: "Sign up", widgets: [formBlock("winter")] }]));
  fake.page(3, "Draft only", null, draftWith("Draft only", [{ label: "Join", widgets: [formBlock("never")] }]));
  return fake;
}

async function openScreen(fake: FakeResponses | undefined): Promise<HTMLElement> {
  const kit = editorKit({ document: page(), ...(fake ? { responses: fake } : {}) });
  kit.render(<TopBar />);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Form responses" })));
  const dialog = screen.getByRole("dialog", { name: "Form responses" });
  await within(dialog).findByRole("list", { name: "Forms" });
  return dialog;
}

const now = Date.UTC(2026, 9, 2, 9);
const when = (iso: string) => serverTime(iso, now);
const rowsOf = (dialog: HTMLElement) => within(within(dialog).getByRole("table")).getAllByRole("row").slice(1).map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent));

test("the mark's menu offers Form responses only when the storage keeps them", () => {
  const kit = editorKit({ document: page() });
  kit.render(<TopBar />);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  expect(within(screen.getByRole("menu", { name: "Page Builder CMS" })).getAllByRole("menuitem").map((item) => item.textContent)).not.toContain("Form responses");
});

test("the site's forms with their counts, and the chosen form's responses newest first, with the time and the page's version", async () => {
  const fake = site();
  fake.send(2, "winter", "2026-09-28T07:02:00.000Z", { "field-1": "Ann Diver" });
  fake.send(1, "join", "2026-09-29T10:00:00.000Z", { "field-1": "Bo", "field-3": "First" }, { versionNumber: 2 });
  fake.send(1, "join", "2026-10-01T18:30:00.000Z", { "field-1": "", "field-3": "Cold water\nis fine" }, { versionNumber: 3 });
  fake.send(1, "join", "2026-10-02T08:15:00.000Z", { "field-4": true }, { versionNumber: 3 });
  const dialog = await openScreen(fake);

  expect(within(dialog).getByText("4 responses to 2 forms")).toBeTruthy();
  const forms = within(within(dialog).getByRole("list", { name: "Forms" })).getAllByRole("button");
  expect(forms.map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-current")])).toEqual([
    ["Form in Join, Home, 3 responses", "true"],
    ["Form in Sign up, Winter series, 1 response", null],
  ]);

  const table = await within(dialog).findByRole("table", { name: /^Form in Join/ });
  expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Sent, newest first", "Version", "First written answer"]);
  await within(table).findAllByRole("rowheader");
  expect(rowsOf(dialog)).toEqual([
    [when("2026-10-02T08:15:00.000Z"), "3", "No written answer"],
    [when("2026-10-01T18:30:00.000Z"), "3", "Message: Cold water is fine"],
    [when("2026-09-29T10:00:00.000Z"), "2", "Name: Bo"],
  ]);

  await act(async () => fireEvent.click(forms[1]!));
  await within(dialog).findByRole("table", { name: /^Form in Sign up/ });
  await within(dialog).findAllByRole("rowheader");
  expect(rowsOf(dialog)).toEqual([[when("2026-09-28T07:02:00.000Z"), "1", "Name: Ann Diver"]]);
  // The page never published was not asked.
  expect(fake.calls.filter((c) => c.endsWith(" 3") || c.includes(" 3 "))).toEqual([]);
});

test("a response opened whole: every field the form had, and what the visitor wrote shown as text, never as markup or a link", async () => {
  const fake = site();
  const markup = '<img src="x" onerror="alert(1)"><b>Bold?</b>';
  const link = '<a href="javascript:alert(1)">Claim your prize</a> javascript:alert(2)';
  fake.send(1, "join", "2026-10-01T18:30:00.000Z", { "field-1": markup, "field-2": "ann@example.org", "field-3": link, "field-4": true }, { versionNumber: 3 });
  fake.send(1, "join", "2026-10-01T19:30:00.000Z", { "field-1": "Bo" }, { versionNumber: 2 });
  const dialog = await openScreen(fake);
  const rows = await within(dialog).findAllByRole("rowheader");
  await act(async () => fireEvent.click(within(rows[1]!).getByRole("button")));

  const details = await within(dialog).findByRole("region", { name: `Sent ${when("2026-10-01T18:30:00.000Z")}` });
  expect(within(details).getByText("Version 3 of Home, the version live now")).toBeTruthy();
  const terms = [...details.querySelectorAll("dt")].map((dt) => dt.textContent);
  const answers = [...details.querySelectorAll("dd")].map((dd) => dd.textContent);
  expect(terms).toEqual(["Name", "Email", "Message", "Keep me posted"]);
  expect(answers).toEqual([markup, "ann@example.org", link, "Ticked"]);
  // The markup is text: nothing it names was made.
  expect(dialog.querySelectorAll("img, b, a, [onerror], [href]")).toHaveLength(0);
  // The list's excerpt too.
  expect(rowsOf(dialog)[1]![2]).toBe(`Name: ${markup}`);

  // The other, from an older version, with fields left empty.
  await act(async () => fireEvent.click(within(rows[0]!).getByRole("button")));
  const other = await within(dialog).findByRole("region", { name: `Sent ${when("2026-10-01T19:30:00.000Z")}` });
  expect(within(other).getByText("Version 2 of Home")).toBeTruthy();
  expect([...other.querySelectorAll("dd")].map((dd) => [dd.textContent, dd.className])).toEqual([["Bo", ""], ["No answer", "rs-none"], ["No answer", "rs-none"], ["Not ticked", ""]]);
});

test("Delete asks first; Keep it gives the focus back; Delete removes the response, says so, and the focus goes to the one that took its place", async () => {
  const fake = site();
  const first = fake.send(1, "join", "2026-10-01T08:00:00.000Z", { "field-1": "Ann" });
  const second = fake.send(1, "join", "2026-10-01T09:00:00.000Z", { "field-1": "Bo" });
  const third = fake.send(1, "join", "2026-10-01T10:00:00.000Z", { "field-1": "Cy" });
  fake.send(2, "winter", "2026-10-01T11:00:00.000Z", { "field-1": "Di" });
  const dialog = await openScreen(fake);
  const open = async (id: number) => {
    await act(async () => fireEvent.click(dialog.querySelector(`[data-response-id="${id}"]`)!));
    return within(dialog).findByRole("button", { name: "Delete response" });
  };

  // The middle one, Bo: asked, and kept.
  let ask = await open(second);
  fireEvent.click(ask);
  const question = within(dialog).getByRole("group", { name: `Delete the response sent ${when("2026-10-01T09:00:00.000Z")}` });
  expect(document.activeElement).toBe(within(question).getByRole("button", { name: "Keep it" }));
  fireEvent.keyDown(question, { key: "Escape" });
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Delete response" }));
  expect(screen.queryByRole("dialog", { name: "Form responses" }), "Esc in the question keeps the screen open").not.toBeNull();
  expect(fake.calls.some((c) => c.startsWith("deleteResponse"))).toBe(false);

  // Deleted: the focus goes to the response below it, the older one.
  ask = within(dialog).getByRole("button", { name: "Delete response" });
  fireEvent.click(ask);
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete" })));
  expect(fake.kept.map((r) => r.id)).toEqual([first, third, 4]);
  expect(dialog.querySelector(".rs-note")?.textContent).toBe(`The response sent ${when("2026-10-01T09:00:00.000Z")} was deleted.`);
  expect(document.activeElement).toBe(dialog.querySelector(`[data-response-id="${first}"]`));
  expect(document.activeElement?.getAttribute("tabindex")).toBe("0");
  expect(within(dialog).getByText("3 responses to 2 forms")).toBeTruthy();
  expect(within(dialog).getByRole("region", { name: "Response" }).textContent).toBe("ResponseChoose a response to read it whole.");

  // The last row: the focus goes to the one above it.
  fireEvent.click(await open(first));
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete" })));
  expect(document.activeElement).toBe(dialog.querySelector(`[data-response-id="${third}"]`));

  // The form's last response: the form leaves the list, the next form is
  // chosen, and the focus is on it.
  fireEvent.click(await open(third));
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete" })));
  const forms = within(within(dialog).getByRole("list", { name: "Forms" })).getAllByRole("button");
  expect(forms.map((b) => b.getAttribute("aria-label"))).toEqual(["Form in Sign up, Winter series, 1 response"]);
  expect(document.activeElement).toBe(forms[0]);
  expect(forms[0]!.getAttribute("aria-current")).toBe("true");

  // The site's last: no form is left, and the focus goes to Close.
  await within(dialog).findAllByRole("rowheader");
  fireEvent.click(await open(4));
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete" })));
  expect(within(dialog).getByText("No responses yet", { selector: ".rs-empty-title" })).toBeTruthy();
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
  expect(fake.kept).toEqual([]);
});

test("a response deleted elsewhere already counts as deleted; a delete the CMS refuses says why and keeps it", async () => {
  const fake = site();
  const kept = fake.send(1, "join", "2026-10-01T08:00:00.000Z", { "field-1": "Ann" });
  const gone = fake.send(1, "join", "2026-10-01T09:00:00.000Z", { "field-1": "Bo" });
  const dialog = await openScreen(fake);
  await act(async () => fireEvent.click((await within(dialog).findAllByRole("rowheader"))[1]!.querySelector("button")!));
  fireEvent.click(await within(dialog).findByRole("button", { name: "Delete response" }));
  fake.fail("deleteResponse", { kind: "unknown", cause: "network", status: null, message: "The CMS did not answer." });
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete" })));
  expect(within(dialog).getByText("Not deleted: The CMS did not answer.")).toBeTruthy();
  expect(fake.kept.map((r) => r.id)).toEqual([kept, gone]);
  expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Delete response" }));

  await act(async () => fireEvent.click(dialog.querySelector(`[data-response-id="${gone}"]`)!));
  fake.kept.splice(1, 1);
  fireEvent.click(await within(dialog).findByRole("button", { name: "Delete response" }));
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete" })));
  expect(dialog.querySelector(".rs-note")?.textContent).toBe(`The response sent ${when("2026-10-01T09:00:00.000Z")} had already been deleted.`);
  expect(rowsOf(dialog).map((r) => r[2])).toEqual(["Name: Ann"]);
});

test("the table is one Tab stop, and the arrows, Home and End move along its rows", async () => {
  const fake = site();
  for (const hour of [8, 9, 10, 11]) fake.send(1, "join", `2026-10-01T${String(hour).padStart(2, "0")}:00:00.000Z`, { "field-1": `At ${hour}` });
  const dialog = await openScreen(fake);
  const buttons = (await within(dialog).findAllByRole("rowheader")).map((cell) => within(cell).getByRole("button"));
  expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
  buttons[0]!.focus();
  fireEvent.keyDown(buttons[0]!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(buttons[1]);
  fireEvent.keyDown(buttons[1]!, { key: "End" });
  expect(document.activeElement).toBe(buttons[3]);
  fireEvent.keyDown(buttons[3]!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(buttons[3]);
  fireEvent.keyDown(buttons[3]!, { key: "Home" });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(buttons[0]!, { key: "ArrowUp" });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(buttons[0]!, { key: "ArrowDown" });
  expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1]);
});

test("the older responses come a part at a time, and the focus goes to the first one each part brings", async () => {
  const fake = site();
  fake.perPart = 2;
  const ids = [8, 9, 10, 11, 12].map((hour) => fake.send(1, "join", `2026-10-01T${String(hour).padStart(2, "0")}:00:00.000Z`, { "field-1": `At ${hour}` }));
  const dialog = await openScreen(fake);
  await within(dialog).findAllByRole("rowheader");
  expect(rowsOf(dialog).map((r) => r[2])).toEqual(["Name: At 12", "Name: At 11"]);
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Show older responses" })));
  expect(rowsOf(dialog).map((r) => r[2])).toEqual(["Name: At 12", "Name: At 11", "Name: At 10", "Name: At 9"]);
  expect(document.activeElement).toBe(dialog.querySelector(`[data-response-id="${ids[2]}"]`));
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Show older responses" })));
  expect(rowsOf(dialog)).toHaveLength(5);
  expect(within(dialog).queryByRole("button", { name: "Show older responses" })).toBeNull();
  expect(fake.calls.filter((c) => c.includes("before="))).toEqual([`listResponses 1 form=join before=${ids[3]}`, `listResponses 1 form=join before=${ids[1]}`]);
});

test("a form's responses that come after another form was chosen are dropped, and the table says it is reading until its own come", async () => {
  const fake = site();
  fake.send(1, "join", "2026-10-01T08:00:00.000Z", { "field-1": "Ann" });
  fake.send(2, "winter", "2026-10-01T09:00:00.000Z", { "field-1": "Bo" });
  // The first form's list is held back until the test lets it go.
  const read = fake.listResponses;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  fake.listResponses = async (pageId, query) => {
    if (query?.form === "join") await held;
    return read(pageId, query);
  };
  const dialog = await openScreen(fake);
  expect(within(dialog).getByRole("table", { name: /^Form in Join/ }).getAttribute("aria-busy")).toBe("true");
  expect(within(dialog).getByText("Reading the responses…")).toBeTruthy();
  await act(async () => fireEvent.click(within(within(dialog).getByRole("list", { name: "Forms" })).getAllByRole("button")[1]!));
  await within(dialog).findAllByRole("rowheader");
  await act(async () => release());
  expect(within(dialog).getByRole("table").querySelector("caption")?.textContent).toBe("Form in Sign up on Winter series");
  expect(rowsOf(dialog).map((r) => r[2])).toEqual(["Name: Bo"]);
});

// The next delete is held until the test lets it land, or fail.
function holdDelete(fake: FakeResponses): { land: () => Promise<void>; fail: (message: string) => Promise<void> } {
  const real = fake.deleteResponse;
  let settle: { land: () => void; fail: (error: Error) => void } = { land: () => {}, fail: () => {} };
  const held = new Promise<void>((resolve, reject) => (settle = { land: resolve, fail: reject }));
  fake.deleteResponse = async (pageId, responseId) => {
    await held;
    return real(pageId, responseId);
  };
  return {
    land: async () => act(async () => settle.land()),
    fail: async (message) => act(async () => settle.fail(new StorageError({ kind: "unknown", cause: "network", status: null, message }))),
  };
}

const forget = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Delete" });

test("a delete still on its way when another form is chosen changes the form it was for, and leaves the chosen form's table and focus alone", async () => {
  const fake = site();
  fake.send(1, "join", "2026-10-01T08:00:00.000Z", { "field-1": "Ann" });
  const bo = fake.send(1, "join", "2026-10-01T09:00:00.000Z", { "field-1": "Bo" });
  fake.send(2, "winter", "2026-10-01T10:00:00.000Z", { "field-1": "Cy" });
  const dialog = await openScreen(fake);
  await act(async () => fireEvent.click(dialog.querySelector(`[data-response-id="${bo}"]`)!));
  fireEvent.click(await within(dialog).findByRole("button", { name: "Delete response" }));
  const delayed = holdDelete(fake);
  await act(async () => fireEvent.click(forget(dialog)));

  // Another form is chosen while the delete is on its way, and its
  // responses come first.
  await act(async () => fireEvent.click(within(within(dialog).getByRole("list", { name: "Forms" })).getAllByRole("button")[1]!));
  await within(dialog).findByRole("table", { name: /^Form in Sign up/ });
  await within(dialog).findAllByRole("rowheader");
  const focused = document.activeElement;
  await delayed.land();

  const table = within(dialog).getByRole("table");
  expect(table.querySelector("caption")?.textContent).toBe("Form in Sign up on Winter series");
  expect(table.getAttribute("aria-busy"), "the chosen form's table is not left reading").toBeNull();
  expect(rowsOf(dialog).map((r) => r[2])).toEqual(["Name: Cy"]);
  expect(within(dialog).queryByText("Reading the responses…")).toBeNull();
  expect(fake.kept.map((r) => r.id)).toEqual([1, 3]);
  // The form it was for counts one less; the chosen form is as it was.
  expect(within(within(dialog).getByRole("list", { name: "Forms" })).getAllByRole("button").map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-current")])).toEqual([
    ["Form in Join, Home, 1 response", null],
    ["Form in Sign up, Winter series, 1 response", "true"],
  ]);
  expect(within(dialog).getByText("2 responses to 2 forms")).toBeTruthy();
  expect(dialog.querySelector(".rs-note")?.textContent).toBe(`The response sent ${when("2026-10-01T09:00:00.000Z")} was deleted.`);
  expect(document.activeElement, "the focus is not taken from where the person is").toBe(focused);
  // Going back, the form it was for has not got the deleted one.
  await act(async () => fireEvent.click(within(within(dialog).getByRole("list", { name: "Forms" })).getAllByRole("button")[0]!));
  await within(dialog).findByRole("table", { name: /^Form in Join/ });
  await within(dialog).findAllByRole("rowheader");
  expect(rowsOf(dialog).map((r) => r[2])).toEqual(["Name: Ann"]);
});

test("a delete that empties a form that is not chosen any more takes that form out of the list and leaves the chosen one", async () => {
  const fake = site();
  const only = fake.send(1, "join", "2026-10-01T08:00:00.000Z", { "field-1": "Ann" });
  fake.send(2, "winter", "2026-10-01T10:00:00.000Z", { "field-1": "Cy" });
  const dialog = await openScreen(fake);
  await act(async () => fireEvent.click(dialog.querySelector(`[data-response-id="${only}"]`)!));
  fireEvent.click(await within(dialog).findByRole("button", { name: "Delete response" }));
  const delayed = holdDelete(fake);
  await act(async () => fireEvent.click(forget(dialog)));
  await act(async () => fireEvent.click(within(within(dialog).getByRole("list", { name: "Forms" })).getAllByRole("button")[1]!));
  await within(dialog).findAllByRole("rowheader");
  await delayed.land();

  expect(within(within(dialog).getByRole("list", { name: "Forms" })).getAllByRole("button").map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-current")])).toEqual([
    ["Form in Sign up, Winter series, 1 response", "true"],
  ]);
  expect(rowsOf(dialog).map((r) => r[2])).toEqual(["Name: Cy"]);
  expect(within(dialog).getByRole("table").getAttribute("aria-busy")).toBeNull();
});

test("a delete still on its way when another response is opened leaves that response open, and its own delete as it was", async () => {
  const fake = site();
  const ann = fake.send(1, "join", "2026-10-01T08:00:00.000Z", { "field-1": "Ann" });
  const bo = fake.send(1, "join", "2026-10-01T09:00:00.000Z", { "field-1": "Bo" });
  const cy = fake.send(1, "join", "2026-10-01T10:00:00.000Z", { "field-1": "Cy" });
  const dialog = await openScreen(fake);
  await act(async () => fireEvent.click(dialog.querySelector(`[data-response-id="${bo}"]`)!));
  fireEvent.click(await within(dialog).findByRole("button", { name: "Delete response" }));
  const delayed = holdDelete(fake);
  await act(async () => fireEvent.click(forget(dialog)));

  // Cy is opened while Bo's delete is on its way.
  await act(async () => fireEvent.click(dialog.querySelector(`[data-response-id="${cy}"]`)!));
  await within(dialog).findByRole("region", { name: `Sent ${when("2026-10-01T10:00:00.000Z")}` });
  await delayed.land();

  expect(within(dialog).getByRole("region", { name: `Sent ${when("2026-10-01T10:00:00.000Z")}` }), "the response that was opened stays open").toBeTruthy();
  expect(dialog.querySelector(`[data-response-id="${cy}"]`)?.getAttribute("aria-current")).toBe("true");
  expect(rowsOf(dialog).map((r) => r[2])).toEqual(["Name: Cy", "Name: Ann"]);
  expect(dialog.querySelector(`[data-response-id="${bo}"]`)).toBeNull();
  expect(within(dialog).getByRole("button", { name: "Delete response" }).getAttribute("aria-disabled"), "Cy's delete is not left as the other's was").toBeNull();
  expect(within(dialog).getByText("2 responses to 1 form")).toBeTruthy();
  expect(fake.kept.map((r) => r.id)).toEqual([ann, cy]);
  expect(dialog.querySelector(".rs-note")?.textContent).toBe(`The response sent ${when("2026-10-01T09:00:00.000Z")} was deleted.`);
});

test("a delete the CMS refuses after the person moved on is said in the note, not under the response now open", async () => {
  const fake = site();
  const bo = fake.send(1, "join", "2026-10-01T09:00:00.000Z", { "field-1": "Bo" });
  const cy = fake.send(1, "join", "2026-10-01T10:00:00.000Z", { "field-1": "Cy" });
  const dialog = await openScreen(fake);
  await act(async () => fireEvent.click(dialog.querySelector(`[data-response-id="${bo}"]`)!));
  fireEvent.click(await within(dialog).findByRole("button", { name: "Delete response" }));
  const delayed = holdDelete(fake);
  await act(async () => fireEvent.click(forget(dialog)));
  await act(async () => fireEvent.click(dialog.querySelector(`[data-response-id="${cy}"]`)!));
  await within(dialog).findByRole("region", { name: `Sent ${when("2026-10-01T10:00:00.000Z")}` });
  await delayed.fail("The CMS did not answer.");

  expect(within(dialog).queryByText(/^Not deleted/)).toBeNull();
  expect(dialog.querySelector(".rs-note")?.textContent).toBe(`The response sent ${when("2026-10-01T09:00:00.000Z")} was not deleted: The CMS did not answer.`);
  expect(fake.kept.map((r) => r.id)).toEqual([bo, cy]);
  expect(rowsOf(dialog)).toHaveLength(2);
  expect(within(dialog).getByRole("button", { name: "Delete response" }).getAttribute("aria-disabled")).toBeNull();
});

test("a read that fails says why, and Try again reads again", async () => {
  const fake = site();
  fake.send(1, "join", "2026-10-01T08:00:00.000Z", { "field-1": "Ann" });
  fake.fail("listPages", { kind: "unknown", cause: "server", status: 500, message: "The CMS failed (500)." });
  const kit = editorKit({ document: page(), responses: fake });
  kit.render(<TopBar />);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Form responses" })));
  const dialog = screen.getByRole("dialog", { name: "Form responses" });
  expect(await within(dialog).findByText("The responses could not be read: The CMS failed (500).")).toBeTruthy();
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Try again" })));
  expect(await within(dialog).findAllByRole("rowheader")).toHaveLength(1);
});

test("a page whose responses cannot be read is named under the forms the others have, and Try again reads it again", async () => {
  const fake = site();
  fake.send(1, "join", "2026-10-01T08:00:00.000Z", { "field-1": "Ann" });
  fake.send(2, "winter", "2026-10-01T09:00:00.000Z", { "field-1": "Bo" });
  fake.fail("listResponses", { kind: "unknown", cause: "server", status: 500, message: "The CMS failed (500)." }, 2);
  const dialog = await openScreen(fake);
  expect(within(within(dialog).getByRole("list", { name: "Forms" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Form in Join, Home, 1 response"]);
  expect(within(dialog).getByText("The responses of Winter series could not be read: The CMS failed (500).")).toBeTruthy();
  await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Try again" })));
  await within(dialog).findByRole("button", { name: "Form in Sign up, Winter series, 1 response" });
  expect(within(dialog).queryByText(/could not be read/)).toBeNull();
});

test("every page failing but the list of pages says which, not that there are no responses", async () => {
  const fake = site();
  fake.send(1, "join", "2026-10-01T08:00:00.000Z", { "field-1": "Ann" });
  fake.fail("getDraft", { kind: "unknown", cause: "network", status: null, message: "The CMS did not answer." }, 1);
  const kit = editorKit({ document: page(), responses: fake });
  kit.render(<TopBar />);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Form responses" })));
  const dialog = screen.getByRole("dialog", { name: "Form responses" });
  expect(await within(dialog).findByText("The responses of Home could not be read: The CMS did not answer.")).toBeTruthy();
  expect(within(dialog).queryByText("No responses yet")).toBeNull();
});

test("rows sent in the same minute are told apart by name, each keeping the time it shows", async () => {
  const fake = site();
  fake.send(1, "join", "2026-10-01T08:00:10.000Z", { "field-1": "Ann" });
  fake.send(1, "join", "2026-10-01T08:00:40.000Z", { "field-1": "Bo" });
  fake.send(1, "join", "2026-10-01T09:30:00.000Z", { "field-1": "Cy" });
  const dialog = await openScreen(fake);
  const rows = await within(dialog).findAllByRole("rowheader");
  const buttons = rows.map((row) => within(row).getByRole("button"));
  const minute = when("2026-10-01T08:00:00.000Z");
  expect(buttons.map((b) => [b.textContent, b.getAttribute("aria-label")])).toEqual([
    [when("2026-10-01T09:30:00.000Z"), when("2026-10-01T09:30:00.000Z")],
    [minute, `${minute} (1)`],
    [minute, `${minute} (2)`],
  ]);
});
