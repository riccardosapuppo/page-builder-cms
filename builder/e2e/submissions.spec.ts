// A visitor's form, sent from a published page to the run's CMS, in
// Chromium with its HTTP cache on (helpers/visitor.ts): the page comes
// from the browser's cache (a 304) and from the CMS's (the fragments
// Solid Cache holds), and the form sent from it is kept and leads to a
// confirmation no one stores; a form the CMS refuses comes back with what
// was written and each refusal by its field; past the limit, or from
// another site, the CMS refuses it whole. Each visitor sends from an
// address of its own (X-Forwarded-For, which the e2e CMS alone counts
// under, helpers/visitor.ts), so one test's count of forms never reaches
// another's limit.
import { axe } from "./helpers/axe.ts";
import { fragments, keptAnswers } from "./helpers/cms-store.ts";
import { cms, column, expect, heading, makePage, section, test, widget } from "./helpers/site.ts";
import { visitor } from "./helpers/visitor.ts";
import type { APIRequestContext, Page } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const FIELDS = [
  { name: "name", kind: "text", label: "Name", required: true, maxLength: 100 },
  { name: "email", kind: "email", label: "Email", required: true },
  { name: "notes", kind: "textarea", label: "Anything we should know?", required: false, maxLength: 1000 },
  { name: "distance", kind: "checkbox", label: "I can swim 200 meters without stopping", required: true },
];
const CONFIRMATION = "Thank you. We reply within two days.";
const BOX = "I can swim 200 meters without stopping (required)";

async function publishedForm(request: APIRequestContext, title: string): Promise<{ id: number; address: string }> {
  const made = await makePage(request, title, [
    section("s", "Join", [column("c", [heading("h", "Join a trial swim"), widget("join-form", "form", { items: FIELDS, submitLabel: "Send request", confirmation: CONFIRMATION })])]),
  ]);
  expect((await request.post(`${cms()}/api/pages/${made.id}/publish`, { data: {} })).status()).toBe(200);
  return { id: made.id, address: `${cms()}/${made.slug}` };
}

async function fillIn(tab: Page, email: string): Promise<void> {
  await tab.getByRole("textbox", { name: "Name (required)" }).fill("Ann Diver");
  await tab.getByRole("textbox", { name: "Email (required)" }).fill(email);
  await tab.getByRole("textbox", { name: "Anything we should know?" }).fill("Cold water\nis fine");
}

test("a form sent from a page the browser and the CMS kept is kept, and leads to a confirmation no one stores", async ({ browser, request }) => {
  const form = await publishedForm(request, "Sent from the cache");
  const reader = await visitor(browser, { from: "198.51.100.21" });
  try {
    const first = await reader.visit(form.address);
    expect(first.status).toBe(200);
    const held = await fragments();
    expect(held, "the CMS drew the page and kept it").toBeGreaterThan(0);
    const again = await reader.visit(form.address);
    expect([again.sent, again.status], "the browser shows the page it kept").toEqual([first.etag, 304]);

    const tab = reader.tab;
    await fillIn(tab, "ann@example.org");
    await tab.getByRole("checkbox", { name: BOX }).check();
    const shown = tab.waitForResponse(`${form.address}/sent/join-form`);
    await tab.getByRole("button", { name: "Send request" }).click();
    const confirmation = await shown;
    const posted = confirmation.request().redirectedFrom();
    expect([posted?.method(), posted?.url(), (await posted?.response())?.status()]).toEqual(["POST", form.address, 303]);
    expect(confirmation.status()).toBe(200);
    expect(confirmation.headers()["cache-control"]).toBe("no-store");
    expect(confirmation.headers()["set-cookie"]).toBeUndefined();
    await expect(tab.getByRole("heading", { name: "Form sent", level: 1 })).toBeVisible();
    await expect(tab.getByText(CONFIRMATION)).toBeVisible();
    await expect(tab.getByRole("link", { name: "Back to Sent from the cache" })).toHaveAttribute("href", new URL(form.address).pathname);

    const kept = await keptAnswers(form.id);
    expect(kept).toEqual([{ formId: "join-form", pageVersionId: expect.any(Number), fields: FIELDS, answers: { name: "Ann Diver", email: "ann@example.org", notes: "Cold water\nis fine", distance: true } }]);

    // Back on the page. A browser drops its copy of an address it has just
    // posted to (HTTP caching, RFC 9111, section 4.4), so it asks for the
    // whole page again, and the CMS reads it whole from its cache: the form
    // changed nothing on the page, and nothing new was drawn.
    const back = await reader.visit(form.address);
    expect([back.sent, back.status, back.etag]).toEqual([undefined, 200, first.etag]);
    expect(await fragments()).toBe(held);
    expect(reader.problems).toEqual([]);
  } finally {
    await reader.close();
  }
});

test("a form the CMS refuses comes back with what was written, each refusal by its field and listed at the top", { tag: "@a11y" }, async ({ browser, request }) => {
  const form = await publishedForm(request, "Sent back");
  const reader = await visitor(browser, { from: "198.51.100.22" });
  try {
    await reader.visit(form.address);
    const tab = reader.tab;
    // A browser that checks nothing before sending, as an old one would,
    // so the CMS is the one to say no.
    await tab.locator("form.sw-form").evaluate((element) => { (element as HTMLFormElement).noValidate = true; });
    await fillIn(tab, "ann@");
    const answered = tab.waitForResponse((r) => r.url() === form.address && r.request().method() === "POST");
    await tab.getByRole("button", { name: "Send request" }).click();
    const response = await answered;
    expect(response.status()).toBe(422);
    expect(response.headers()["cache-control"]).toBe("no-store");
    await expect(tab).toHaveTitle("Error: Sent back");

    const alert = tab.getByRole("alert");
    await expect(alert.getByRole("heading", { name: "Your form was not sent" })).toBeVisible();
    await expect(alert.getByRole("link")).toHaveText([
      "Email: Enter an email address, like name@example.org.",
      "I can swim 200 meters without stopping: Tick this box to send the form.",
    ]);
    const email = tab.getByRole("textbox", { name: "Email (required)" });
    const box = tab.getByRole("checkbox", { name: BOX });
    await expect(email).toHaveValue("ann@");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAccessibleDescription("Enter an email address, like name@example.org.");
    await expect(box).toHaveAccessibleDescription("Tick this box to send the form.");
    await expect(tab.getByRole("textbox", { name: "Name (required)" })).toHaveValue("Ann Diver");
    await expect(tab.getByRole("textbox", { name: "Anything we should know?" })).toHaveValue("Cold water\nis fine");
    const report = await axe(tab);
    for (const line of report.other) console.log(`the page drawn again: ${line}`);
    expect(report.passes).toBeGreaterThan(10);
    expect(report.serious).toEqual([]);
    expect(await keptAnswers(form.id)).toEqual([]);

    // The list's link takes a keyboard user to the field, far down the
    // page, and the field alone in view is not enough: its label and its
    // message must be too, or they land on an empty box that has no name
    // and no reason (scroll-margin-top, site.css). In a desktop window
    // short enough that the page scrolls, and in a phone's, where a
    // message takes more lines.
    const link = alert.getByRole("link", { name: /^Email:/ });
    const label = tab.locator('label[for="join-form:email"]');
    const message = tab.locator('[id="join-form:email:error"]');
    for (const size of [{ width: 1280, height: 480 }, { width: 390, height: 520 }]) {
      await tab.setViewportSize(size);
      await tab.evaluate(() => window.scrollTo(0, 0));
      await link.focus();
      await tab.keyboard.press("Enter");
      await expect(email).toBeFocused();
      expect(await tab.evaluate(() => window.scrollY), `at ${size.width} wide the page scrolled to the field`).toBeGreaterThan(0);
      await expect(email).toBeInViewport();
      await expect(label).toBeInViewport({ ratio: 1 });
      await expect(message).toBeInViewport({ ratio: 1 });
    }

    // Put right, the form is kept.
    await email.fill("ann@example.org");
    await box.check();
    const shown = tab.waitForResponse(`${form.address}/sent/join-form`);
    await tab.getByRole("button", { name: "Send request" }).click();
    expect((await shown).status()).toBe(200);
    await expect(tab.getByRole("heading", { name: "Form sent", level: 1 })).toBeVisible();
    expect((await keptAnswers(form.id)).map((kept) => kept.answers.email)).toEqual(["ann@example.org"]);
    // Chromium's own line for a page that came with an error status.
    expect(reader.problems).toEqual(["Failed to load resource: the server responded with a status of 422 (Unprocessable Content)"]);
  } finally {
    await reader.close();
  }
});

test("past ten forms in ten minutes from one address the CMS refuses with 429, and another address may still send", async ({ browser, request }) => {
  const form = await publishedForm(request, "Held to the limit");
  const reader = await visitor(browser, { from: "198.51.100.23" });
  const other = await visitor(browser, { from: "198.51.100.24" });
  try {
    await reader.visit(form.address);
    const tab = reader.tab;
    // Ten from this address, as the form sends them: the context's own
    // requests carry its address and its Origin.
    for (let i = 1; i <= 10; i++) {
      const sent = await tab.context().request.post(form.address, {
        form: { form: "join-form", "answers[name]": `Swimmer ${i}`, "answers[email]": `swimmer${i}@example.org`, "answers[notes]": "", "answers[distance]": "yes", website: "" },
        headers: { Origin: cms() },
        maxRedirects: 0,
      });
      expect(sent.status(), `form ${i}`).toBe(303);
    }

    // The eleventh, from the page.
    await fillIn(tab, "ann@example.org");
    await tab.getByRole("checkbox", { name: BOX }).check();
    const answered = tab.waitForResponse((r) => r.url() === form.address && r.request().method() === "POST");
    await tab.getByRole("button", { name: "Send request" }).click();
    const response = await answered;
    expect(response.status()).toBe(429);
    expect(response.headers()["retry-after"]).toBe("600");
    expect(response.headers()["cache-control"]).toBe("no-store");
    await expect(tab.getByRole("heading", { name: "Not sent", level: 1 })).toBeVisible();
    await expect(tab.getByText(/^Too many forms were sent from your connection in a short time/)).toBeVisible();
    expect(await keptAnswers(form.id)).toHaveLength(10);

    await other.visit(form.address);
    await fillIn(other.tab, "bo@example.org");
    await other.tab.getByRole("checkbox", { name: BOX }).check();
    const shown = other.tab.waitForResponse(`${form.address}/sent/join-form`);
    await other.tab.getByRole("button", { name: "Send request" }).click();
    expect((await shown).status()).toBe(200);
    expect(await keptAnswers(form.id)).toHaveLength(11);
    expect([...reader.problems, ...other.problems]).toEqual(["Failed to load resource: the server responded with a status of 429 (Too Many Requests)"]);
  } finally {
    await reader.close();
    await other.close();
  }
});

test("a form on another site that posts to the page is refused with 403, and nothing is kept", async ({ browser, request }) => {
  const form = await publishedForm(request, "Not from elsewhere");
  const context = await browser.newContext({ locale: "en-US", timezoneId: "UTC", extraHTTPHeaders: { "X-Forwarded-For": "198.51.100.25" } });
  try {
    // A page of another site, answered inside the browser, with a copy of
    // the form that posts to the page's address.
    await context.route("http://elsewhere.test/", (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="en"><title>Elsewhere</title><form method="post" action="${form.address}"><input type="hidden" name="form" value="join-form"><input type="hidden" name="answers[name]" value="Ann Diver"><input type="hidden" name="answers[email]" value="ann@example.org"><input type="hidden" name="answers[distance]" value="yes"><button>Send</button></form></html>`,
    }));
    const tab = await context.newPage();
    await tab.goto("http://elsewhere.test/");
    const answered = tab.waitForResponse((r) => r.url() === form.address && r.request().method() === "POST");
    await tab.getByRole("button", { name: "Send" }).click();
    const response = await answered;
    expect(await response.request().headerValue("origin")).toBe("http://elsewhere.test");
    expect(response.status()).toBe(403);
    await expect(tab.getByRole("heading", { name: "Not sent", level: 1 })).toBeVisible();
    expect(await keptAnswers(form.id)).toEqual([]);
  } finally {
    await context.close();
  }
});
