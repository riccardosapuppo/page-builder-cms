// The sidebar's groups in Chromium, against the run's CMS (design/layout/):
// a block's settings under groups named after what they hold, the closed
// ones saying their values; which groups are open kept in this browser for
// the person, per block type, across a reload and not in another browser's
// profile; a value the CMS refuses opening the group that holds its field;
// and the Page tab's own groups, saved to the CMS, with the site style one
// click below.
import { block } from "./helpers/canvas.ts";
import { column, draftOf, expect, heading, makePage, open, openGroup, outlineRow, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const notes = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Tide notes" }] }] };
const fixture = () => [
  { ...section("s1", "Hero", [column("c1", [heading("h", "Swim at dawn"), widget("t", "text", { doc: notes })])]), props: { label: "Hero", anchor: "join" } },
  section("s2", "Join", [column("c2", [widget("b", "button", { label: "Join", href: "#" })])]),
];

test("closed groups say their values, and which are open is kept in this browser, per block type, across a reload", async ({ page, request, browser, baseURL }) => {
  const { id } = await makePage(request, "Groups", fixture());
  await open(page, id);
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  const head = (name: string) => sidebar.getByRole("button", { name, exact: true });
  await block(page, "h").click();
  await expect(sidebar.locator(".grp-name")).toHaveText(["Text", "Size and color", "Alignment", "Shown on"]);
  await expect(head("Text")).toHaveAttribute("aria-expanded", "true");
  await expect(head("Size and color")).toHaveAccessibleDescription("Heading 2, theme color");
  await expect(head("Alignment")).toHaveAccessibleDescription("Left");
  await expect(head("Shown on")).toHaveAccessibleDescription("Every device");

  // The heading's Text closed, its Alignment open.
  await head("Text").click();
  await expect(head("Text")).toHaveAccessibleDescription("Swim at dawn");
  await openGroup(page, "Alignment");
  await expect(sidebar.getByRole("radiogroup", { name: "Alignment" })).toBeVisible();
  // A text is another type: its groups as they first are.
  await block(page, "t").click();
  await expect(head("Text")).toHaveAttribute("aria-expanded", "true");
  await expect(head("Alignment")).toHaveAttribute("aria-expanded", "false");

  // Kept in the browser, and read back after a reload.
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("page-builder-cms:open-groups"))) ?? "null")).toEqual({ heading: { content: false, alignment: true } });
  await page.reload();
  await expect(page.locator(".canvas .frame")).toBeVisible();
  await block(page, "h").click();
  await expect(head("Text")).toHaveAttribute("aria-expanded", "false");
  await expect(head("Alignment")).toHaveAttribute("aria-expanded", "true");

  // Another browser's profile has its own: there, the heading's groups as
  // they first are.
  const other = await browser.newContext({ ...(baseURL ? { baseURL } : {}), viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "UTC" });
  try {
    const second = await other.newPage();
    await open(second, id);
    await block(second, "h").click();
    const there = second.getByRole("complementary", { name: "Settings" });
    await expect(there.getByRole("button", { name: "Text", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(there.getByRole("button", { name: "Alignment", exact: true })).toHaveAttribute("aria-expanded", "false");
  } finally {
    await other.close();
  }
});

test("a value the CMS refuses opens the group that holds it, closed before, and shows the refusal on its field", async ({ page, request }) => {
  const { id } = await makePage(request, "Refused anchor", fixture());
  await open(page, id);
  await (await outlineRow(page, "Join")).click();
  await page.getByRole("button", { name: "Close Outline" }).click();
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  const nameAndLink = sidebar.getByRole("button", { name: "Name and link", exact: true });
  await expect(nameAndLink).toHaveAttribute("aria-expanded", "false");
  await expect(nameAndLink).toHaveAccessibleDescription("Join");

  // The editor's own rules refuse a second section with the anchor "join",
  // so the save is rewritten on its way to hold one, and the CMS's answer
  // comes back as it is.
  let rewritten = 0;
  await page.route("**/api/pages/*/draft", async (route) => {
    if (route.request().method() !== "PUT" || rewritten > 0) return route.continue();
    rewritten += 1;
    const body = JSON.parse(route.request().postData() ?? "{}") as { document: { sections: Array<{ props: Record<string, unknown> }> } };
    body.document.sections[1]!.props.anchor = "join";
    await route.fulfill({ response: await route.fetch({ postData: JSON.stringify(body) }) });
  });
  await openGroup(page, "Background");
  await sidebar.getByRole("radiogroup", { name: "Background" }).getByRole("radio", { name: "Soft, Shallows" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Not saved: a value was refused" })).toBeVisible();
  expect(rewritten).toBe(1);

  // Name and link opened for it; the refusal on the Anchor id field.
  await expect(nameAndLink).toHaveAttribute("aria-expanded", "true");
  const anchor = sidebar.getByRole("textbox", { name: "Anchor id" });
  await expect(anchor).toHaveAttribute("aria-invalid", "true");
  await expect(anchor).toHaveAccessibleDescription(/The anchor "join" is already used by another section\./);
  // Closed by hand, it says it holds a refusal, and the panel lists it.
  await nameAndLink.click();
  await expect(nameAndLink).toHaveAccessibleDescription("Join Refused");
  await expect(sidebar.getByText(/The server refused the last save of this section/)).toBeVisible();
});

test("the Page tab holds the page's title, address and description in its groups, saved to the CMS, and the site style one click below", async ({ page, request }) => {
  const { id } = await makePage(request, "Page settings", fixture());
  await open(page, id);
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await expect(sidebar.getByRole("tab", { name: "Page" })).toHaveAttribute("aria-selected", "true");
  await expect(sidebar.locator(".grp-name")).toHaveText(["Title and address", "Search results"]);
  const description = sidebar.getByRole("textbox", { name: "Description" });
  await description.fill("Dawn swims, from the slipway.");
  await description.blur();
  await saved(page);
  const draft = (await draftOf(request, id)) as unknown as { document: { description?: string } };
  expect(draft.document.description).toBe("Dawn swims, from the slipway.");
  const search = sidebar.getByRole("button", { name: "Search results", exact: true });
  await search.click();
  await expect(search).toHaveAccessibleDescription("Dawn swims, from the slipway.");

  // The site style, a level below, and back.
  await sidebar.getByRole("button", { name: "Site style", exact: true }).click();
  const style = page.getByRole("complementary", { name: "Site style" });
  await expect(style).toBeVisible();
  await style.getByRole("button", { name: "Back to Page" }).click();
  await expect(sidebar.getByRole("button", { name: "Site style", exact: true })).toBeFocused();
});
