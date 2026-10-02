// The editor's shell in Chromium, against the run's own CMS through the
// editor's proxy: a page opens on the canvas; Enter on a widget tile adds
// it where the selection is and the CMS keeps it; the device buttons
// narrow the page root and the page lays out by its own width; the
// navigator and the canvas select together; a 422 from the CMS shows on
// the field it names; an empty page and a new one invite a first section.
//
// Each test makes its own pages through the API, under addresses of its
// own, since the tests of a run share one CMS.
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

// A picture for the images these pages take "from another site": answered
// inside the browser, so nothing leaves the machine (a 1 by 1 PNG).
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const ELSEWHERE = "https://images.example.org/";

// Every test ends with no error on the page, none in its console (but the
// browser's own line for a request the CMS answered 422, which these tests
// ask for) and no request that went anywhere but the run's two servers.
const test = base.extend<{ quiet: void }>({
  quiet: [async ({ page, baseURL }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && !/status of 422/.test(message.text())) errors.push(message.text());
    });
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith(ELSEWHERE)) return route.fulfill({ body: PIXEL, contentType: "image/png" });
      if (url.startsWith(baseURL ?? "") || url.startsWith(cms())) return route.fallback();
      errors.push(`request outside the run's servers: ${url}`);
      return route.abort();
    });
    await use();
    expect(errors).toEqual([]);
  }, { auto: true }],
});

const cms = () => {
  const url = process.env.E2E_CMS_URL;
  if (!url) throw new Error("E2E_CMS_URL is not set: the run's global setup starts the CMS");
  return url;
};

let made = 0;
const unique = (base: string) => `${base}-${process.pid}-${Date.now().toString(36)}-${++made}`;

const widget = (id: string, type: string, props: Record<string, unknown>) => ({ id, type, props, children: [], style: { base: {} } });
const column = (id: string, children: unknown[]) => ({ id, type: "column", props: {}, children, style: { base: {} } });
const section = (id: string, label: string, children: unknown[]) => ({ id, type: "section", props: { label }, children, style: { base: {} } });

// A page with this document as its draft, made as the editor would: the
// page, then a save at the draft's revision.
async function makePage(request: APIRequestContext, title: string, sections: unknown[]): Promise<{ id: number; slug: string }> {
  const slug = unique(title.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const created = await request.post(`${cms()}/api/pages`, { data: { title, slug } });
  expect(created.status(), await created.text()).toBe(201);
  const { page } = (await created.json()) as { page: { id: number } };
  const draft = (await (await request.get(`${cms()}/api/pages/${page.id}/draft`)).json()) as { revision: number };
  const saved = await request.put(`${cms()}/api/pages/${page.id}/draft`, { data: { revision: draft.revision, saveId: `setup-${slug}`, document: { schemaVersion: 1, title, sections } } });
  expect(saved.status(), await saved.text()).toBe(200);
  return { id: page.id, slug };
}

async function draftOf(request: APIRequestContext, id: number): Promise<{ revision: number; document: { sections: Array<{ children: Array<{ children: Array<{ type: string; props: Record<string, unknown> }> }> }> } }> {
  return (await (await request.get(`${cms()}/api/pages/${id}/draft`)).json()) as never;
}

async function open(page: Page, id: number): Promise<void> {
  await page.goto(`/?page=${id}`);
  await expect(page.getByRole("tree", { name: "Navigator" })).toBeVisible();
}

const row = (page: Page, name: string) => page.getByRole("treeitem", { name, exact: true }).first().locator(":scope > .t-row");
const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

// The approved design's window: the canvas gives the page 832, wide
// enough for the page's desktop layout.
test.use({ viewport: { width: 1440, height: 900 } });

test("Enter on a widget tile adds it after the selected block, focused, and the CMS keeps it", async ({ page, request }) => {
  const { id } = await makePage(request, "Tiles", [section("s", "Tiles", [column("c", [widget("h", "heading", { level: 2, text: "Before the quote" }), widget("b", "button", { label: "After", href: "#" })])])]);
  await open(page, id);
  await page.locator('.canvas [data-block-id="h"]').click();
  await page.getByRole("tab", { name: "Add" }).click();
  const tile = page.getByRole("group", { name: "Content" }).getByRole("button", { name: "Quote" });
  await tile.focus();
  await page.keyboard.press("Enter");

  const blocks = page.locator('.canvas [data-block-id="c"] > [data-block-id]');
  await expect(blocks).toHaveCount(3);
  await expect(blocks.nth(1)).toHaveAttribute("data-block-type", "quote");
  await expect(blocks.nth(1)).toBeFocused();
  await expect(page.getByRole("toolbar", { name: "Quote" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Edit" })).toHaveAttribute("aria-selected", "true");
  await saved(page);
  const draft = await draftOf(request, id);
  expect(draft.document.sections[0]!.children[0]!.children.map((w) => w.type)).toEqual(["heading", "quote", "button"]);

  await page.reload();
  await expect(page.locator('.canvas [data-block-id="c"] > [data-block-type="quote"]')).toHaveCount(1);
});

test("the device buttons narrow the page root, and the page lays out by its own width", async ({ page, request }) => {
  const { id } = await makePage(request, "Widths", [section("s", "Two", [column("c1", [widget("t1", "heading", { level: 2, text: "Left" })]), column("c2", [widget("t2", "heading", { level: 2, text: "Right" })])])]);
  await open(page, id);
  const site = page.locator(".canvas .site");
  const left = page.locator('.canvas [data-block-id="c1"]');
  const right = page.locator('.canvas [data-block-id="c2"]');
  const layout = async () => {
    const [a, b, s] = [await left.boundingBox(), await right.boundingBox(), await site.boundingBox()];
    return { width: Math.round(s!.width), sideBySide: Math.abs(a!.y - b!.y) < 1 && b!.x > a!.x };
  };

  // 1440 wide: the canvas gives the page 832, past the 800 of the desktop layout.
  await expect(page.locator(".wrule-label")).toHaveText("Desktop, 832 wide");
  expect(await layout()).toEqual({ width: 832, sideBySide: true });

  await page.getByRole("button", { name: "Tablet" }).click();
  await expect(page.getByRole("button", { name: "Tablet" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".wrule-label")).toHaveText("Tablet, 768 wide");
  expect(await layout()).toEqual({ width: 768, sideBySide: false });

  await page.getByRole("button", { name: "Phone" }).click();
  await expect(page.locator(".wrule-label")).toHaveText("Phone, 390 wide");
  expect(await layout()).toEqual({ width: 390, sideBySide: false });
  // The window did not change: only the page root's container did.
  expect(page.viewportSize()).toEqual({ width: 1440, height: 900 });
});

test("the navigator and the canvas select the same block, both ways", async ({ page, request }) => {
  const { id } = await makePage(request, "Both ways", [section("s", "Story", [column("c", [widget("h", "heading", { level: 2, text: "Title" }), widget("q", "quote", { text: "Cold, then glad." })])])]);
  await open(page, id);

  await page.locator('.canvas [data-block-id="q"]').click();
  await expect(page.getByRole("treeitem", { name: "Quote: Cold, then glad." })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("treeitem", { name: "Story" })).toHaveAttribute("aria-expanded", "true");

  await row(page, "Column 1").click();
  await expect(page.locator('.canvas [data-block-id="c"]')).toHaveAttribute("data-editor-selected", "true");
  await expect(page.getByRole("toolbar", { name: "Column 1" })).toBeVisible();

  // The tree's keys move the selection, and the canvas with it.
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('.canvas [data-block-id="h"]')).toHaveAttribute("data-editor-selected", "true");
  await expect(page.getByRole("treeitem", { name: "Heading: Title" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Text" })).toHaveValue("Title");
});

test("a field's edit is saved, and the CMS's 422 on a value shows on that value's field", async ({ page, request }) => {
  const { id } = await makePage(request, "Refused", [section("s", "Pictures", [column("c", [widget("i", "image", { url: "https://images.example.org/bay.jpg", alt: "The bay" })])])]);
  await open(page, id);
  await page.locator('.canvas [data-block-id="i"]').click();

  // The editor offers only the library's images; to get the CMS's own
  // refusal of one it does not have, the next save is rewritten on its
  // way to name such an image, and the CMS's answer comes back as it is.
  let rewritten = 0;
  await page.route("**/api/pages/*/draft", async (route) => {
    if (route.request().method() !== "PUT" || rewritten > 0) return route.continue();
    rewritten += 1;
    const body = JSON.parse(route.request().postData() ?? "{}") as { document: { sections: Array<{ children: Array<{ children: Array<{ props: Record<string, unknown> }> }> }> } };
    const image = body.document.sections[0]!.children[0]!.children[0]!;
    image.props = { mediaId: "nosuchimage", alt: image.props.alt };
    const response = await route.fetch({ postData: JSON.stringify(body) });
    await route.fulfill({ response });
  });

  const alt = page.getByRole("textbox", { name: "Alt text" });
  await alt.fill("The bay at dawn");
  await alt.blur();
  await expect(page.getByRole("status").filter({ hasText: "Not saved: a value was refused" })).toBeVisible();
  const imageField = page.locator(".field").filter({ has: page.getByRole("button", { name: "Replace image" }) });
  await expect(imageField.locator(".error")).toHaveText("The media library has no item nosuchimage.");
  await expect(alt).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("treeitem", { name: "Image: The bay at dawn, refused by the server" })).toBeVisible();
  expect(rewritten).toBe(1);

  // The next edit goes as it is, is saved, and the error goes.
  await alt.fill("The bay at slack water");
  await alt.blur();
  await saved(page);
  await expect(imageField.locator(".error")).toHaveCount(0);
  const draft = await draftOf(request, id);
  expect(draft.document.sections[0]!.children[0]!.children[0]!.props).toEqual({ url: "https://images.example.org/bay.jpg", alt: "The bay at slack water" });
});

test("an address another page has is refused on the Address field", async ({ page, request }) => {
  const first = await makePage(request, "Taken", [section("s", "One", [column("c", [])])]);
  const second = await makePage(request, "Taker", [section("s", "Two", [column("c", [])])]);
  await open(page, second.id);
  const address = page.getByRole("textbox", { name: "Address" });
  await expect(address).toHaveValue(second.slug);
  await address.fill(first.slug);
  await address.press("Enter");
  await expect(address).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".field-error .error")).toContainText("address of another page");
  // The page kept its own.
  const answer = (await (await request.get(`${cms()}/api/pages/${second.id}`)).json()) as { page: { slug: string } };
  expect(answer.page.slug).toBe(second.slug);
});

test("a new page, made from the page switch, invites its first section, which the CMS keeps", async ({ page, request }) => {
  const { id } = await makePage(request, "Somewhere", [section("s", "Here", [column("c", [])])]);
  await open(page, id);
  const title = unique("Fresh page");
  await page.getByRole("button", { name: /^Switch page/ }).click();
  await page.getByRole("menuitem", { name: "New page…" }).click();
  await page.getByRole("dialog", { name: "New page" }).getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByRole("heading", { name: "Start this page with a section" })).toBeVisible();
  await expect(page.getByText("No sections yet.", { exact: false })).toBeVisible();
  const newId = Number(new URL(page.url()).searchParams.get("page"));
  expect(newId).not.toBe(id);

  await page.getByRole("group", { name: "Add a section" }).getByRole("button", { name: "2 columns" }).click();
  await expect(page.locator(".canvas .col-empty")).toHaveCount(2);
  await expect(page.getByRole("treeitem", { name: "Section 1" })).toHaveAttribute("aria-selected", "true");
  await saved(page);
  const draft = await draftOf(request, newId);
  expect(draft.document.sections).toHaveLength(1);
  expect(draft.document.sections[0]!.children).toHaveLength(2);
});
