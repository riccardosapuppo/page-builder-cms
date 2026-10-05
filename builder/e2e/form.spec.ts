// The form widget in Chromium, in the editor and on the published page:
// its tile in Insert's Forms group and in the "+"'s picker, each adding a
// form a person can send as it comes; on the canvas its fields take
// neither a click nor the focus; published, it is plain HTML with no
// script, which the browser
// holds back while a field it requires is empty or ticks nothing, then
// sends to the page's own address: the block's id in "form", each answer
// under answers[<field name>], and the field for robots empty. What the
// server does with it is not this test's: the browser's request is
// answered here, before it reaches the CMS.
import { block } from "./helpers/canvas.ts";
import { cms, column, draftOf, drawer, expect, heading, makePage, open, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const FIELDS = [
  { name: "name", kind: "text", label: "Name", required: true, maxLength: 100 },
  { name: "email", kind: "email", label: "Email", required: true },
  { name: "notes", kind: "textarea", label: "Anything we should know?", required: false, maxLength: 1000 },
  { name: "distance", kind: "checkbox", label: "I can swim 200 meters without stopping", required: true },
];

test("the form's tile is in Insert's Forms group and in the picker, and each adds a form ready to send", async ({ page, request }) => {
  const { id } = await makePage(request, "Form tiles", [section("s", "Join", [column("c1", [heading("h", "Join a trial swim")])])]);
  await open(page, id);
  await block(page, "h").click();
  const insert = await drawer(page, "Insert");
  await insert.getByRole("group", { name: "Forms" }).getByRole("button", { name: "Form", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Close Insert" }).click();

  await block(page, "h").click();
  await page.keyboard.press("+");
  const picker = page.getByRole("dialog", { name: "Add a block after Heading" });
  await picker.getByRole("button", { name: "Form", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await saved(page);

  const widgets = (await draftOf(request, id)).document.sections[0]!.children[0]!.children;
  expect(widgets.map((w) => w.type)).toEqual(["heading", "form", "form"]);
  for (const form of widgets.slice(1)) {
    expect(form.props).toEqual({
      items: [
        { name: "name", kind: "text", label: "Name", required: true, maxLength: 100 },
        { name: "email", kind: "email", label: "Email", required: true },
        { name: "message", kind: "textarea", label: "Message", required: false, maxLength: 1000 },
      ],
      submitLabel: "Send",
      confirmation: "Thank you. Your message has reached us.",
    });
  }

  // On the canvas a click where a field is selects its form: the field
  // takes neither the click nor the focus, so nothing can be typed in it.
  const first = block(page, widgets[1]!.id);
  const name = first.getByRole("textbox", { name: "Name (required)" });
  await expect(name).toHaveCSS("pointer-events", "none");
  await expect(name).toHaveAttribute("tabindex", "-1");
  const box = (await name.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(first).toHaveAttribute("data-editor-selected", "true");
  await expect(name).not.toBeFocused();
});

test("published, the form is plain HTML that the browser sends to the page's own address once what it requires is there", async ({ page, request }) => {
  const made = await makePage(request, "Form sent", [section("s", "Join", [column("c", [widget("join-form", "form", { items: FIELDS, submitLabel: "Send request", confirmation: "Thank you." })])])]);
  expect((await request.post(`${cms()}/api/pages/${made.id}/publish`, { data: {} })).status()).toBe(200);
  const address = `${cms()}/${made.slug}`;
  await page.goto(address);
  await expect(page.locator("script")).toHaveCount(0);

  const sent: Array<{ url: string; method: string; type: string; body: string }> = [];
  await page.route(address, async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    sent.push({ url: request.url(), method: request.method(), type: (await request.allHeaders())["content-type"] ?? "", body: request.postData() ?? "" });
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>Received</title><p>Received</p>" });
  });

  const send = page.getByRole("button", { name: "Send request" });
  // Nothing written: the browser keeps the form, on its first required field.
  await send.click();
  await expect(page.getByRole("textbox", { name: "Name (required)" })).toBeFocused();
  // The box that must be ticked holds it back too, after the text is in.
  await page.getByRole("textbox", { name: "Name (required)" }).fill("Ann Diver");
  await page.getByRole("textbox", { name: "Email (required)" }).fill("ann@example.org");
  await send.click();
  await expect(page.getByRole("checkbox", { name: "I can swim 200 meters without stopping (required)" })).toBeFocused();
  expect(sent).toEqual([]);

  await page.getByRole("checkbox", { name: "I can swim 200 meters without stopping (required)" }).check();
  await send.click();
  await expect(page.getByText("Received")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0]!.url).toBe(address);
  expect(sent[0]!.method).toBe("POST");
  expect(sent[0]!.type).toBe("application/x-www-form-urlencoded");
  expect([...new URLSearchParams(sent[0]!.body)]).toEqual([
    ["form", "join-form"],
    ["answers[name]", "Ann Diver"],
    ["answers[email]", "ann@example.org"],
    ["answers[notes]", ""],
    ["answers[distance]", "yes"],
    ["website", ""],
  ]);
});
