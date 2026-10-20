// The Assistant (src/assistant/README.md) in Chromium, the providers'
// APIs answered inside the browser: no key is real and nothing leaves the
// machine. A key is checked with its provider and kept; a brief becomes a
// new page, section by section, each a step of the Assistant's in History;
// the key goes to its provider and nowhere else, is found in no storage of
// the browser's, and a reload forgets it. After the page, the tokens the
// provider counted and what they come to at the model's list price, and at
// the drawer's foot the total since the key was connected, forgotten with
// it. Stats, steps and pricing land as blocks of their own, a plan's button
// whose address the brief does not give leading to the top of the page,
// said. A key the provider refuses is said and not kept; Forget key
// forgets it; with no key, the sample builds its page the same way; the
// drawer passes axe. In a block's panel, a heading is written again and an
// image of the library described, each shown before it is taken, with what
// it used, and taken as one step of the Assistant's.
import type { Page, Route } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { png } from "./helpers/images.ts";
import { drawer, expect, makePage, open, section, column, heading, test, unique } from "./helpers/site.ts";

const ANTHROPIC_KEY = "sk-ant-e2e-not-a-real-key-a1b2";
const OPENAI_KEY = "sk-proj-e2e-not-a-real-key-c3d4";
const words = (text: string) => ({ kind: "text", paragraphs: [text] });
const PLAN = JSON.stringify({
  title: "Open day",
  description: "Trial swims at the slipway on Saturday 12 April.",
  sections: [
    { label: "Hero", anchor: "", background: "soft", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: "Open day at the slipway", display: true }, words("Saturday 12 April, from 8 to 11."), { kind: "button", label: "Book a place", target: "#book" }] }] },
    { label: "The morning", anchor: "", background: "none", widths: "equal", columns: [
      { align: "left", blocks: [{ kind: "iconbox", icon: "clock", title: "From 8 to 11", text: "Come when it suits you." }] },
      { align: "left", blocks: [{ kind: "iconbox", icon: "cup", title: "Hot drinks", text: "Tea on the slipway after." }] },
    ] },
    { label: "Book", anchor: "book", background: "primary", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "heading", level: 2, text: "Book a place", display: false }, { kind: "form", fields: [{ type: "text", label: "Your name", required: true }, { type: "email", label: "Email", required: true }], submitLabel: "Book", confirmation: "See you there." }] }] },
  ],
});
// A page of the club's figures, the steps to join and its plans: the
// Family plan's button leads to an address the brief does not give.
const offer = (name: string, price: string, features: string[], target: string, featured = false) => ({ name, price, period: "a month", text: "", features, buttonLabel: "Join", buttonTarget: target, featured, badge: featured ? "For families" : "" });
const WIDGETS_PLAN = JSON.stringify({
  title: "Membership",
  description: "Join the swimming club: two plans, from €20 a month.",
  sections: [
    { label: "Club", anchor: "", background: "soft", widths: "equal", columns: [{ align: "left", blocks: [
      { kind: "heading", level: 1, text: "Swim with the club", display: true },
      { kind: "stats", figures: [{ value: "120", label: "Members" }, { value: "1987", label: "Swimming since" }] },
    ] }] },
    { label: "How to join", anchor: "how-to-join", background: "none", widths: "equal", columns: [{ align: "left", blocks: [
      { kind: "heading", level: 2, text: "How to join", display: false },
      { kind: "steps", steps: [{ title: "Come along", text: "Any Saturday at eight." }, { title: "Swim with a coach", text: "Close to the shore, at your pace." }, { title: "Join", text: "Choose a plan below." }] },
    ] }] },
    { label: "Plans", anchor: "", background: "none", widths: "equal", columns: [{ align: "left", blocks: [
      { kind: "heading", level: 2, text: "Membership", display: false },
      { kind: "pricing", plans: [offer("Swimmer", "€20", ["Two swims a week"], "#how-to-join"), offer("Family", "€45", ["Two adults and their children"], "https://club.example/join", true)] },
    ] }] },
  ],
});

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
const sse = (events: Array<[string | null, unknown]>) => events.map(([event, data]) => `${event ? `event: ${event}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`).join("");
const pieces = (text: string) => text.match(/[\s\S]{1,48}/g) ?? [];

interface Asked {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

// The answer to a question, by the schema it asks for: a page's plan, a
// heading written again, an image described.
function answerTo(body: { output_config?: { format?: { schema?: { required?: string[] } } } }, plan = PLAN): string {
  const asked = body.output_config?.format?.schema?.required ?? [];
  if (asked.includes("sections")) return plan;
  if (asked.includes("decorative")) return JSON.stringify({ decorative: false, alt: "A small green and sand picture, split down the middle" });
  return JSON.stringify({ text: "Swim at first light" });
}

// Anthropic's API answered here: the models a key may use, and one answer
// streamed as server-sent events, a page's being `plan`; a key other than
// `key` refused, as the API refuses it.
async function anthropic(page: Page, key = ANTHROPIC_KEY, plan = PLAN): Promise<Asked[]> {
  const asked: Asked[] = [];
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    asked.push({ url: request.url(), headers: request.headers(), body: request.postDataJSON() as unknown });
    if (request.headers()["x-api-key"] !== key) {
      return route.fulfill({ status: 401, headers: CORS, contentType: "application/json", body: JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
    }
    if (request.url().includes("/v1/models")) {
      return route.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify({
        data: [
          { type: "model", id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5", created_at: "2026-09-10T00:00:00Z" },
          { type: "model", id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2026-08-01T00:00:00Z" },
        ],
        has_more: false, first_id: "claude-sonnet-5-5", last_id: "claude-opus-5-5",
      }) });
    }
    return route.fulfill({ headers: { ...CORS, "content-type": "text/event-stream" }, body: sse([
      ["message_start", { type: "message_start", message: { id: "msg_e2e", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1234, output_tokens: 1 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ...pieces(answerTo(request.postDataJSON() as Parameters<typeof answerTo>[0], plan)).map((text): [string, unknown] => ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }]),
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 567 } }],
      ["message_stop", { type: "message_stop" }],
    ]) });
  });
  return asked;
}

// OpenAI's API answered here, the same way, as Chat Completions streams.
async function openai(page: Page): Promise<Asked[]> {
  const asked: Asked[] = [];
  await page.route("https://api.openai.com/**", async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    asked.push({ url: request.url(), headers: request.headers(), body: request.postDataJSON() as unknown });
    if (request.url().includes("/v1/models")) {
      return route.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify({ object: "list", data: [{ id: "gpt-5", object: "model", created: 1754000000, owned_by: "openai" }, { id: "whisper-1", object: "model", created: 1, owned_by: "openai" }] }) });
    }
    const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({ id: "c1", object: "chat.completion.chunk", created: 1, model: "gpt-5", choices: [{ index: 0, delta, finish_reason: finish }] });
    return route.fulfill({ headers: { ...CORS, "content-type": "text/event-stream" }, body: sse([
      ...pieces(PLAN).map((content): [null, unknown] => [null, chunk({ content })]),
      [null, chunk({}, "stop")],
      [null, { id: "c1", object: "chat.completion.chunk", created: 1, model: "gpt-5", choices: [], usage: { prompt_tokens: 900, completion_tokens: 400, total_tokens: 1300, prompt_tokens_details: { cached_tokens: 300, cache_write_tokens: 200 } } }],
      [null, "[DONE]"],
    ]) });
  });
  return asked;
}

// Everything the browser keeps for this site: its two storages, its
// cookies, its address, every IndexedDB database's every record, its caches.
async function keptByTheBrowser(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const parts = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }), document.cookie, location.href];
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((done, fail) => {
        const opening = indexedDB.open(info.name!);
        opening.onsuccess = () => done(opening.result);
        opening.onerror = () => fail(opening.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const all = await new Promise<unknown[]>((done, fail) => {
          const reading = db.transaction(store).objectStore(store).getAll();
          reading.onsuccess = () => done(reading.result);
          reading.onerror = () => fail(reading.error);
        });
        parts.push(JSON.stringify(all, (_key, value: unknown) => (value instanceof Blob ? "(a file)" : value)));
      }
      db.close();
    }
    for (const name of await caches.keys()) parts.push(name);
    return parts.join("\n");
  });
}

// The page's own sections on the canvas: not the site's header's and footer's.
const pageSections = (page: Page) => page.locator(".canvas [data-block-type='section']:not([data-theme-part] *)");

async function assistant(page: Page) {
  const box = page.getByRole("complementary", { name: "Assistant", exact: true });
  if (!(await box.isVisible())) await page.locator(".topbar").getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(box).toBeVisible();
  return box;
}

async function startOn(page: Page, request: Parameters<typeof makePage>[0], title: string) {
  const { id } = await makePage(request, title, [section("s1", "Start", [column("c1", [heading("h1", "Start")])])]);
  await open(page, id);
}

test("a key kept in this tab's memory writes a page from a brief, each section a step of the Assistant's; the key goes only to its provider, no storage holds it, and a reload forgets it", async ({ page, request }) => {
  const asked = await anthropic(page);
  await startOn(page, request, "Before the Assistant");
  const box = await assistant(page);
  await box.getByLabel("Your Anthropic key").fill(ANTHROPIC_KEY);
  await box.getByRole("button", { name: "Connect Anthropic" }).click();
  await expect(box.getByText("key …a1b2")).toBeVisible();
  await expect(box.getByLabel("Model")).toHaveValue("claude-opus-5-5");
  await expect(box.getByLabel("Your Anthropic key")).toHaveCount(0);

  await box.getByLabel("What is the page for?").fill("An open day at the club on Saturday 12 April, from 8 to 11, with trial swims and a booking form.");
  await box.getByRole("button", { name: "Write the page" }).click();
  await expect(box.getByRole("status").filter({ hasText: "3 sections on “Open day”" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Switch page\. Open: Open day/ })).toBeVisible();
  await expect(pageSections(page)).toHaveCount(3);
  await expect(box.getByRole("listitem")).toHaveText(["Hero", "The morning", "Book"]);

  // What it used, as the provider counted it, and what that comes to at
  // Claude Opus 5.5's list price: 1,234 × $4 + 567 × $20 a million tokens.
  await expect(box.locator(".as-used")).toHaveText("Used 1,234 tokens in and 567 out, on your key.");
  await expect(box.locator(".as-cost")).toHaveText("≈ $0.016 at Claude Opus 5.5's list price ($4 in, $20 out per million tokens; prices of 20 Oct 2026).");
  await expect(box.locator(".drawer-foot > p")).toHaveText([
    "Since you connected this key: 1 request, 1,234 tokens in and 567 out, ≈ $0.016.",
    "An estimate from the providers' list prices. The provider's bill is what counts: taxes, discounts and regional uplift are not included.",
  ]);

  const history = page.getByRole("complementary", { name: "History", exact: true });
  await page.locator(".topbar").getByRole("button", { name: "History", exact: true }).click();
  // The newest step first, as History lists them.
  await expect(history.locator(".hist-what")).toHaveText([
    "Assistant added section Book",
    "Assistant added section The morning",
    "Assistant added section Hero",
    "Assistant changed the page description",
  ]);

  // The key went to Anthropic, on each call, and in no request's body.
  const message = asked.find((call) => call.url.endsWith("/v1/messages"))!;
  expect(message.headers["x-api-key"]).toBe(ANTHROPIC_KEY);
  expect(message.body).toMatchObject({ model: "claude-opus-5-5", thinking: { type: "adaptive" }, output_config: { format: { type: "json_schema" } } });
  expect(JSON.stringify(message.body)).not.toContain(ANTHROPIC_KEY);
  // Nothing the browser keeps holds it.
  expect(await keptByTheBrowser(page)).not.toContain(ANTHROPIC_KEY);

  await page.reload();
  await expect(page.getByRole("button", { name: /^Switch page\. Open:/ })).toBeVisible();
  const again = await assistant(page);
  await expect(again.getByLabel("Your Anthropic key")).toBeVisible();
  await expect(again.getByText(/key …/)).toHaveCount(0);
  // The total went with the key.
  await expect(again.getByText(/Since you connected this key/)).toHaveCount(0);
});

test("stats, steps and pricing land as blocks of their own; a plan's button whose address the brief does not give keeps its words, leads to the top of the page, and is said", async ({ page, request }) => {
  await anthropic(page, ANTHROPIC_KEY, WIDGETS_PLAN);
  await startOn(page, request, "Before the widgets");
  const box = await assistant(page);
  await box.getByLabel("Your Anthropic key").fill(ANTHROPIC_KEY);
  await box.getByRole("button", { name: "Connect Anthropic" }).click();
  await expect(box.getByText("key …a1b2")).toBeVisible();
  await box.getByLabel("What is the page for?").fill("Membership of the swimming club: 120 members, swimming since 1987. Swimmer €20 a month, Family €45 a month for two adults and their children. Come along any Saturday at eight.");
  await box.getByRole("button", { name: "Write the page" }).click();
  await expect(box.getByRole("status").filter({ hasText: "3 sections on “Membership”" })).toBeVisible();
  await expect(box.getByRole("listitem")).toHaveText(["Club", "How to join", "Plans"]);

  const canvas = page.locator(".canvas");
  await expect(canvas.locator("[data-block-type='stats'] dd")).toHaveText(["120", "1987"]);
  await expect(canvas.locator("[data-block-type='stats'] dt")).toHaveText(["Members", "Swimming since"]);
  await expect(canvas.locator("[data-block-type='steps'] li > h3")).toHaveText(["Come along", "Swim with a coach", "Join"]);
  const pricing = canvas.locator("[data-block-type='pricing']");
  await expect(pricing.locator("li.sw-plan > h3")).toHaveText(["Swimmer", "Family"]);
  await expect(pricing.locator(".sw-plan-price strong")).toHaveText(["€20", "€45"]);
  await expect(pricing.locator("li.sw-plan[data-featured] > .sw-plan-badge")).toHaveText("For families");
  const buttons = pricing.locator(".sw-plan-action > a.sw-btn");
  await expect(buttons).toHaveText(["Join", "Join"]);
  await expect(buttons.nth(0)).toHaveAttribute("href", "#how-to-join");
  await expect(buttons.nth(1)).toHaveAttribute("href", "#");

  await box.getByText("One thing was left out").click();
  await expect(box.getByText("Left out the link of the button “Join” of the plan “Family”: it would lead to an address the brief does not give.")).toBeVisible();
});

test("OpenAI: the same page, asked with a strict schema; models it cannot use are not offered", async ({ page, request }) => {
  const asked = await openai(page);
  await startOn(page, request, "Before OpenAI");
  const box = await assistant(page);
  await box.getByRole("radio", { name: "OpenAI" }).click();
  await box.getByLabel("Your OpenAI key").fill(OPENAI_KEY);
  await box.getByRole("button", { name: "Connect OpenAI" }).click();
  await expect(box.getByText("key …c3d4")).toBeVisible();
  await expect(box.getByLabel("Model").locator("option")).toHaveText(["gpt-5"]);
  await box.getByLabel("What is the page for?").fill("An open day at the club.");
  await box.getByRole("button", { name: "Write the page" }).click();
  await expect(box.getByRole("status").filter({ hasText: "3 sections on “Open day”" })).toBeVisible();
  const completion = asked.find((call) => call.url.endsWith("/v1/chat/completions"))!;
  expect(completion.headers.authorization).toBe(`Bearer ${OPENAI_KEY}`);
  expect(completion.body).toMatchObject({ model: "gpt-5", stream: true, response_format: { type: "json_schema", json_schema: { name: "page_plan", strict: true } } });
  // 400 × $1.25 + 300 cached × $0.125 + 200 written to the cache × $1.25
  // (gpt-5's page gives a dash for cache writes) + 400 × $10 a million
  // tokens: under a cent.
  await expect(box.locator(".as-used")).toHaveText("Used 900 tokens in, 300 of them cached and 200 written to the cache, and 400 out, on your key.");
  await expect(box.locator(".as-cost")).toHaveText("Under $0.01 ($0.0048) at gpt-5's list price ($1.25 in, $0.125 cached, $1.25 written to the cache, $10 out per million tokens; prices of 20 Oct 2026).");
  await expect(box.locator(".as-total")).toHaveText("Since you connected this key: 1 request, 900 tokens in, 300 of them cached and 200 written to the cache, and 400 out, under $0.01 ($0.0048).");
});

test.describe("a refused key", () => {
  // The browser's own line for the provider's 401, which the test asks for.
  test.use({ allowConsole: /status of 401/ });

  test("a key its provider refuses is said and not kept; Forget key forgets one kept", async ({ page, request }) => {
  await anthropic(page);
  await startOn(page, request, "Keys");
  const box = await assistant(page);
  await box.getByLabel("Your Anthropic key").fill("sk-ant-wrong");
  await box.getByRole("button", { name: "Connect Anthropic" }).click();
  await expect(box.getByText("Anthropic did not accept this key. Check it was copied whole, or make a new one.")).toBeVisible();
  await expect(box.getByLabel("Your Anthropic key")).toHaveAttribute("aria-invalid", "true");
  await box.getByLabel("Your Anthropic key").fill(ANTHROPIC_KEY);
  await box.getByRole("button", { name: "Connect Anthropic" }).click();
  await box.getByRole("button", { name: "Forget key" }).click();
  await expect(box.getByLabel("Your Anthropic key")).toBeVisible();
  await expect(box.getByLabel("Your Anthropic key")).toHaveValue("");
  });
});

test("with no key, the sample written by hand builds its page the same way, section by section", async ({ page, request }) => {
  await startOn(page, request, "Before the sample");
  const box = await assistant(page);
  await box.getByRole("button", { name: "Build the sample page" }).click();
  await expect(box.getByRole("status").filter({ hasText: "4 sections on “Open day”" })).toBeVisible({ timeout: 20_000 });
  await expect(box.getByText("A sample written by hand: no model was asked.")).toBeVisible();
  await expect(pageSections(page)).toHaveCount(4);
});

test("the Assistant's drawer passes axe, asking for a key, with one kept, and after a page, with what it used and the total", async ({ page, request }) => {
  await anthropic(page);
  await startOn(page, request, "Axe");
  const box = await assistant(page);
  expect((await axe(page, { include: ".drawer-assistant" })).serious).toEqual([]);
  await box.getByLabel("Your Anthropic key").fill(ANTHROPIC_KEY);
  await box.getByRole("button", { name: "Connect Anthropic" }).click();
  await expect(box.getByText("key …a1b2")).toBeVisible();
  expect((await axe(page, { include: ".drawer-assistant" })).serious).toEqual([]);
  await box.getByLabel("What is the page for?").fill("An open day at the club.");
  await box.getByRole("button", { name: "Write the page" }).click();
  await expect(box.locator(".as-total")).toBeVisible();
  expect((await axe(page, { include: ".drawer-assistant" })).serious).toEqual([]);
});

async function connected(page: Page) {
  const box = await assistant(page);
  await box.getByLabel("Your Anthropic key").fill(ANTHROPIC_KEY);
  await box.getByRole("button", { name: "Connect Anthropic" }).click();
  await expect(box.getByText("key …a1b2")).toBeVisible();
  await box.getByRole("button", { name: "Close Assistant" }).click();
}

test("a heading written again is shown first, then taken as one step of the Assistant's; with no key, the panel says where one is connected", async ({ page, request }) => {
  await anthropic(page);
  await startOn(page, request, "Rewrite");
  await block(page, "h1").click();
  const tool = page.getByRole("region", { name: "Write it again" });
  await expect(tool.getByRole("button", { name: "Assistant" })).toBeVisible();
  await connected(page);
  await block(page, "h1").click();
  await tool.getByRole("button", { name: "Shorter" }).click();
  await expect(tool.getByLabel("The heading written again")).toHaveText("Swim at first light");
  await expect(tool.locator(".as-spent")).toHaveText("Used 1,234 tokens in and 567 out, on your key: ≈ $0.016 at Claude Opus 5.5's list price.");
  // Nothing has changed yet.
  await expect(block(page, "h1").getByRole("heading")).toHaveText("Start");
  await tool.getByRole("button", { name: "Use it" }).click();
  await expect(block(page, "h1").getByRole("heading")).toHaveText("Swim at first light");
  // The drawer's total holds it.
  await expect((await assistant(page)).locator(".as-total")).toHaveText("Since you connected this key: 1 request, 1,234 tokens in and 567 out, ≈ $0.016.");
  const history = await drawer(page, "History");
  await expect(history.locator(".hist-what").first()).toHaveText(/^Assistant changed/);
});

test("an image of the library is described from the picture itself, shown first, then taken as its alt text", async ({ page, request }) => {
  const asked = await anthropic(page);
  await startOn(page, request, "Describe");
  await connected(page);
  await block(page, "h1").click();
  await drawer(page, "Insert");
  await page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Image" }).click();
  const library = page.getByRole("dialog", { name: "Media library" });
  const name = `${unique("halves")}.png`;
  await library.getByLabel("Images to upload").setInputFiles({ name, mimeType: "image/png", buffer: png(64, 48, (x) => (x < 32 ? [30, 110, 90] : [230, 200, 140])) });
  await expect(library.getByRole("radio", { name: `${name}, no alt text` })).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  await library.getByRole("textbox", { name: /^Alt text/ }).fill("Two colours");
  await library.getByRole("button", { name: "Add image" }).click();
  await expect(library).toHaveCount(0);

  const tool = page.getByRole("region", { name: "Describe the image" });
  await tool.getByRole("button", { name: "Write its alt text" }).click();
  await expect(tool.getByLabel("The alt text proposed")).toHaveText("A small green and sand picture, split down the middle");
  await tool.getByRole("button", { name: "Use it" }).click();
  await expect(page.locator(".canvas").getByRole("img", { name: "A small green and sand picture, split down the middle" })).toBeVisible();

  // The picture went with the question, made into a JPEG, with the words beside it.
  const question = asked.filter((call) => call.url.endsWith("/v1/messages")).at(-1)!.body as { messages: Array<{ content: Array<{ type: string; source?: { media_type: string; data: string }; text?: string }> }> };
  const parts = question.messages[0]!.content;
  expect(parts[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg" } });
  expect(parts[0]!.source!.data.length).toBeGreaterThan(100);
  expect(parts[1]!.text).toContain("Next to the image: Start");
});
