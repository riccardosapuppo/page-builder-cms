// Forms from end to end, as the person editing, a visitor and another
// site meet them, on the run's CMS: the person adds a form from Insert,
// names its button in the sidebar and publishes; a visitor in a browser of
// its own (helpers/visitor.ts, its HTTP cache on) gets the page, then a
// 304, and sends the form from the copy the browser kept. The CMS refuses
// a wrong address with the page drawn again, keeps the answers put right
// and leads to a confirmation no one stores; the page the visitor goes
// back to comes whole from Solid Cache, nothing drawn again. Past ten forms
// from one address the CMS refuses with 429, and a form posted from
// another site gets 403; neither is kept. In the editor, Form responses
// lists what was kept, newest first, and opens the visitor's own. axe
// reads the served page, the page drawn again, the confirmation, the
// refusal and Form responses.
import { axe, type AxeReport } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { fragments, keptAnswers } from "./helpers/cms-store.ts";
import { cms, column, draftOf, drawer, expect, makePage, open, openGroup, section, test, widget } from "./helpers/site.ts";
import { visitor } from "./helpers/visitor.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// What a form added from Insert holds, before anyone changes it.
const FIELDS = [
  { name: "name", kind: "text", label: "Name", required: true, maxLength: 100 },
  { name: "email", kind: "email", label: "Email", required: true },
  { name: "message", kind: "textarea", label: "Message", required: false, maxLength: 1000 },
];
const CONFIRMATION = "Thank you. Your message has reached us.";

function clean(where: string, report: AxeReport): void {
  for (const line of report.other) console.log(`${where}: ${line}`);
  expect(report.passes, `axe looked at ${where}`).toBeGreaterThan(10);
  expect(report.serious, where).toEqual([]);
}

test("a form added in the editor is sent from the page the caches kept, held to its limit and to its own site, and read in Form responses", { tag: "@a11y" }, async ({ page, request, browser }) => {
  const title = `Open water ${Date.now().toString(36)}`;
  const made = await makePage(request, title, [section("s", "Join", [column("c", [widget("h", "heading", { level: 1, text: "Join a trial swim" })])])]);
  await open(page, made.id);

  // The form, from Insert's Forms group, after the heading; its button
  // named in the sidebar's Button and message.
  await block(page, "h").click();
  const insert = await drawer(page, "Insert");
  await insert.getByRole("group", { name: "Forms" }).getByRole("button", { name: "Form", exact: true }).click();
  await page.getByRole("button", { name: "Close Insert" }).click();
  const widgets = async () => (await draftOf(request, made.id)).document.sections[0]!.children[0]!.children;
  await expect.poll(async () => (await widgets()).map((w) => w.type)).toEqual(["heading", "form"]);
  const formId = (await widgets())[1]!.id;
  await block(page, formId).click();
  await openGroup(page, "Button and message");
  const button = page.getByRole("complementary", { name: "Settings" }).getByRole("textbox", { name: "Button text" });
  await button.fill("Send request");
  await button.press("Enter");
  await expect.poll(async () => (await widgets())[1]!.props).toEqual({ items: FIELDS, submitLabel: "Send request", confirmation: CONFIRMATION });

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".topbar .tb-status")).toHaveText("Published");
  const live = ((await (await request.get(`${cms()}/api/pages/${made.id}`)).json()) as { published: { versionNumber: number } }).published.versionNumber;

  const address = `${cms()}/${made.slug}`;
  const reader = await visitor(browser, { from: "198.51.100.51" });
  const tab = reader.tab;
  try {
    // From the caches: the CMS drew the page once and kept it, and the
    // browser shows the copy it kept on a 304.
    const first = await reader.visit(address);
    expect(first.status).toBe(200);
    const held = await fragments();
    expect(held, "the CMS drew the page and kept it").toBeGreaterThan(0);
    const again = await reader.visit(address);
    expect([again.sent, again.status], "the browser shows the page it kept").toEqual([first.etag, 304]);
    await expect(tab.getByRole("button", { name: "Send request" })).toBeVisible();
    clean("the served page", await axe(tab));

    // A wrong address, from a browser that checks nothing before sending,
    // as an old one would, so the CMS is the one to say no.
    await tab.locator("form.sw-form").evaluate((form) => { (form as HTMLFormElement).noValidate = true; });
    await tab.getByRole("textbox", { name: "Name (required)" }).fill("Ann Diver");
    await tab.getByRole("textbox", { name: "Email (required)" }).fill("ann@");
    await tab.getByRole("textbox", { name: "Message", exact: true }).fill("Is the lake warm in May?");
    const refused = tab.waitForResponse((r) => r.url() === address && r.request().method() === "POST");
    await tab.getByRole("button", { name: "Send request" }).click();
    expect((await refused).status()).toBe(422);
    await expect(tab).toHaveTitle(`Error: ${title}`);
    const email = tab.getByRole("textbox", { name: "Email (required)" });
    await expect(email).toHaveValue("ann@");
    await expect(email).toHaveAccessibleDescription("Enter an email address, like name@example.org.");
    await expect(tab.getByRole("textbox", { name: "Message", exact: true })).toHaveValue("Is the lake warm in May?");
    clean("the page drawn again", await axe(tab));
    expect(await keptAnswers(made.id)).toEqual([]);

    // Put right, it is kept, and the confirmation is stored by no one.
    await email.fill("ann@example.org");
    const shown = tab.waitForResponse(`${address}/sent/${formId}`);
    await tab.getByRole("button", { name: "Send request" }).click();
    const confirmation = await shown;
    const posted = confirmation.request().redirectedFrom();
    expect([posted?.method(), posted?.url(), (await posted?.response())?.status()]).toEqual(["POST", address, 303]);
    expect([confirmation.status(), confirmation.headers()["cache-control"]]).toEqual([200, "no-store"]);
    await expect(tab.getByRole("heading", { name: "Form sent", level: 1 })).toBeVisible();
    await expect(tab.getByText(CONFIRMATION)).toBeVisible();
    clean("the confirmation", await axe(tab));
    expect(await keptAnswers(made.id)).toEqual([{ formId, pageVersionId: expect.any(Number), fields: FIELDS, answers: { name: "Ann Diver", email: "ann@example.org", message: "Is the lake warm in May?" } }]);

    // Back on the page: the browser asks for it whole after posting to its
    // address, and the CMS reads it whole from Solid Cache. Neither the
    // page drawn again nor the confirmation added to what it holds.
    const back = await reader.visit(address);
    expect([back.sent, back.status, back.etag]).toEqual([undefined, 200, first.etag]);
    expect(await fragments()).toBe(held);

    // Eight more from this address, as the form sends them (the context's
    // requests carry its address and its Origin): with the refused one and
    // the kept one, ten in ten minutes.
    for (let i = 3; i <= 10; i++) {
      const sent = await tab.context().request.post(address, {
        form: { form: formId, "answers[name]": `Swimmer ${i}`, "answers[email]": `swimmer${i}@example.org`, "answers[message]": "", website: "" },
        headers: { Origin: cms() },
        maxRedirects: 0,
      });
      expect(sent.status(), `form ${i}`).toBe(303);
    }
    // The eleventh, from the page.
    await tab.getByRole("textbox", { name: "Name (required)" }).fill("Ann Diver");
    await tab.getByRole("textbox", { name: "Email (required)" }).fill("ann@example.org");
    const limited = tab.waitForResponse((r) => r.url() === address && r.request().method() === "POST");
    await tab.getByRole("button", { name: "Send request" }).click();
    const past = await limited;
    expect([past.status(), past.headers()["retry-after"], past.headers()["cache-control"]]).toEqual([429, "600", "no-store"]);
    await expect(tab.getByRole("heading", { name: "Not sent", level: 1 })).toBeVisible();
    await expect(tab.getByText(/^Too many forms were sent from your connection in a short time/)).toBeVisible();
    clean("the refusal past the limit", await axe(tab));
    expect(await keptAnswers(made.id)).toHaveLength(9);
    expect(reader.problems).toEqual([
      "Failed to load resource: the server responded with a status of 422 (Unprocessable Content)",
      "Failed to load resource: the server responded with a status of 429 (Too Many Requests)",
    ]);
  } finally {
    await reader.close();
  }

  // Another site's page, answered inside a browser of its own, with a copy
  // of the form that posts to the page: Chromium names that site in the
  // Origin, and the CMS refuses it whole.
  const elsewhere = await browser.newContext({ locale: "en-US", timezoneId: "UTC", extraHTTPHeaders: { "X-Forwarded-For": "198.51.100.52" } });
  try {
    await elsewhere.route("http://elsewhere.test/", (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="en"><title>Elsewhere</title><form method="post" action="${address}"><input type="hidden" name="form" value="${formId}"><input type="hidden" name="answers[name]" value="Bo Swimmer"><input type="hidden" name="answers[email]" value="bo@example.org"><button>Send</button></form></html>`,
    }));
    const other = await elsewhere.newPage();
    await other.goto("http://elsewhere.test/");
    const answered = other.waitForResponse((r) => r.url() === address && r.request().method() === "POST");
    await other.getByRole("button", { name: "Send" }).click();
    const response = await answered;
    expect(await response.request().headerValue("origin")).toBe("http://elsewhere.test");
    expect(response.status()).toBe(403);
    await expect(other.getByRole("heading", { name: "Not sent", level: 1 })).toBeVisible();
    expect(await keptAnswers(made.id)).toHaveLength(9);
  } finally {
    await elsewhere.close();
  }

  // In the editor, from the mark's menu: the nine kept, newest first, the
  // visitor's the oldest, opened whole.
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Form responses" }).click();
  const screen = page.getByRole("dialog", { name: "Form responses" });
  const form = screen.getByRole("list", { name: "Forms" }).getByRole("button", { name: `Form in Join, ${title}, 9 responses` });
  await form.click();
  const table = screen.getByRole("table", { name: `Form in Join on ${title}` });
  const rows = table.getByRole("row").filter({ has: page.getByRole("rowheader") });
  await expect(rows).toHaveCount(9);
  await expect(rows.nth(0).getByRole("cell")).toHaveText([String(live), "Name: Swimmer 10"]);
  await expect(rows.nth(8).getByRole("cell")).toHaveText([String(live), "Name: Ann Diver"]);
  await rows.nth(8).getByRole("button").click();
  const details = screen.getByRole("region", { name: /^Sent Today, / });
  await expect(details.getByText(`Version ${live} of ${title}, the version live now`)).toBeVisible();
  await expect(details.locator("dt")).toHaveText(["Name", "Email", "Message"]);
  await expect(details.locator("dd")).toHaveText(["Ann Diver", "ann@example.org", "Is the lake warm in May?"]);
  clean("Form responses", await axe(page, { include: ".dlg-responses" }));
});
