// The pricing block in Chromium, in the editor and on the published page:
// its tile in Insert's Content group and in the "+"'s picker, each adding
// three plans that read as they come, the middle one featured; a plan
// written in the block's Plans group (its name, its features one a line,
// its button's link chosen among the site's pages, featured by its switch
// with a badge), drawn on the canvas and kept by the CMS, and a link the
// page refuses refused on its field; and published, plain HTML with no
// script, one list of plans, each a card of its name, a heading, its
// price, its features and its button, a link to its address: three across
// on a desktop, as tall as one another with their buttons at their feet,
// and one under the other on a phone; the featured plan ringed in the
// theme's primary, its badge on its top edge filled with it, its words in
// the colour that reads on it (on the block's own Accent, the site's
// Text); on a primary band, the ring in paper and a ring of paper around
// the badge. A link a button may not have is refused by the CMS too, so
// no page it serves holds one: that such a link draws no link is the
// render contract's to show (contract/fixtures/traps-text.json,
// t-pricing-links) and the server's view test's.
import type { Locator } from "@playwright/test";
import { block } from "./helpers/canvas.ts";
import { cms, column, draftOf, drawer, expect, heading, makePage, open, openGroup, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// A new pricing block's plans: each button goes where a new button block's
// goes, the top of the page.
const PLANS = [
  {
    name: "Basic", price: "€9", period: "a month", text: "What most people need to start.",
    features: ["The thing that matters most", "Another one", "Help by email"],
    button: { label: "Choose Basic", href: "#" }, featured: false, badge: "",
  },
  {
    name: "Plus", price: "€19", period: "a month", text: "For those who use it every day.",
    features: ["Everything in Basic", "One more thing that matters", "Help the same day"],
    button: { label: "Choose Plus", href: "#" }, featured: true, badge: "Most chosen",
  },
  {
    name: "Team", price: "€49", period: "a month", text: "For a group working together.",
    features: ["Everything in Plus", "Up to ten people", "A call to set it up"],
    button: { label: "Choose Team", href: "#" }, featured: false, badge: "",
  },
];

test("the pricing's tile is in Insert's Content group and in the picker, and each adds three plans, the middle one featured", async ({ page, request }) => {
  const { id } = await makePage(request, "Pricing tiles", [section("s", "Club", [column("c1", [heading("h", "Membership")])])]);
  await open(page, id);
  await block(page, "h").click();
  const insert = await drawer(page, "Insert");
  await insert.getByRole("group", { name: "Content" }).getByRole("button", { name: "Pricing", exact: true }).click();
  await saved(page);
  await page.getByRole("button", { name: "Close Insert" }).click();

  await block(page, "h").click();
  await page.keyboard.press("+");
  const picker = page.getByRole("dialog", { name: "Add a block after Heading" });
  await picker.getByRole("button", { name: "Pricing", exact: true }).click();
  await expect(picker).toHaveCount(0);
  await saved(page);

  const widgets = (await draftOf(request, id)).document.sections[0]!.children[0]!.children;
  expect(widgets.map((w) => w.type)).toEqual(["heading", "pricing", "pricing"]);
  for (const pricing of widgets.slice(1)) expect(pricing.props).toEqual({ plans: PLANS });
});

test("a plan written in the Plans group is drawn on the canvas and kept by the CMS: its name, its features, its button's link chosen, featured with a badge; a link the page refuses is refused on its field", async ({ page, request }) => {
  const join = await makePage(request, "Pricing join", [section("j", "Join", [column("jc", [heading("jh", "Join the club")])])]);
  const { id } = await makePage(request, "Pricing written", [section("s", "Club", [column("c", [widget("pr", "pricing", { plans: PLANS })])])]);
  await open(page, id);
  await block(page, "pr").click();
  await openGroup(page, "Plans");
  const settings = page.getByRole("complementary", { name: "Settings" });
  const name = settings.getByRole("textbox", { name: "Name 3", exact: true });
  await name.fill("Club");
  await name.blur();
  // The features, one a line: the blank one left out, the spaces cut.
  const features = settings.getByRole("textbox", { name: "Features 3", exact: true });
  await features.fill("Everything in Plus\n\nUp to twenty people\n  A coach once a month  ");
  await features.blur();
  // The link, chosen among the site's pages the field offers.
  const link = settings.getByRole("combobox", { name: "Button link 3", exact: true });
  const offered = await link.evaluate((input) => [...((input as HTMLInputElement).list?.options ?? [])].map((option) => option.value));
  expect(offered).toContain(`/${join.slug}`);
  await link.fill(`/${join.slug}`);
  await link.blur();
  // Featured by its switch (its input lies under its track: the keyboard
  // turns it), then its badge written.
  await settings.getByRole("switch", { name: "Featured 3", exact: true }).focus();
  await page.keyboard.press("Space");
  const badge = settings.getByRole("textbox", { name: "Badge 3", exact: true });
  await badge.fill("For groups");
  await badge.blur();

  const card = block(page, "pr").locator("li.sw-plan").nth(2);
  await expect(block(page, "pr").locator("li.sw-plan > h3")).toHaveText(["Basic", "Plus", "Club"]);
  await expect(card.locator(".sw-plan-features > li")).toHaveText(["Everything in Plus", "Up to twenty people", "A coach once a month"]);
  await expect(card.locator(".sw-plan-action > a.sw-btn")).toHaveAttribute("href", `/${join.slug}`);
  await expect(card).toHaveAttribute("data-featured", "true");
  await expect(card.locator(".sw-plan-badge")).toHaveText("For groups");
  await saved(page);

  const pricing = (await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!;
  expect(pricing.props).toEqual({
    plans: [PLANS[0], PLANS[1], {
      ...PLANS[2], name: "Club", features: ["Everything in Plus", "Up to twenty people", "A coach once a month"],
      button: { label: "Choose Team", href: `/${join.slug}` }, featured: true, badge: "For groups",
    }],
  });
  await drawer(page, "History");
  await expect(page.getByRole("complementary", { name: "History" }).getByRole("listitem").filter({ hasText: "Changed plan 3 in Pricing in Club" }).first()).toBeVisible();

  // A link no button may have: refused on its field, the plan keeping its own.
  const first = settings.getByRole("combobox", { name: "Button link 1", exact: true });
  await first.fill("javascript:alert(1)");
  await first.blur();
  await expect(first).toHaveAttribute("aria-invalid", "true");
  await expect(settings.getByText("Use a full address (https://…), a path on this site (/…), #anchor, mailto: or tel:.")).toBeVisible();
  await expect(block(page, "pr").locator("li.sw-plan").nth(0).locator("a.sw-btn")).toHaveAttribute("href", "#");
  expect((await draftOf(request, id)).document.sections[0]!.children[0]!.children[0]!.props).toEqual(pricing.props);
});

// Each card as the page draws it: where it stands, how tall, its ring, and
// its button's foot.
async function cards(root: Locator) {
  return root.locator(":scope > ul > li.sw-plan").evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    const button = item.querySelector(".sw-plan-action")?.getBoundingClientRect() ?? null;
    const style = getComputedStyle(item);
    return {
      top: Math.round(box.top), left: Math.round(box.left), height: Math.round(box.height), bottom: box.bottom,
      buttonBottom: button === null ? null : button.bottom, padding: parseFloat(style.paddingBottom),
      ring: style.boxShadow, border: style.borderTopColor,
    };
  }));
}

// The badge of the featured plan as the page draws it, and the card it
// stands on.
async function badgeOf(root: Locator) {
  return root.locator("li.sw-plan[data-featured] > .sw-plan-badge").evaluate((badge) => {
    const box = badge.getBoundingClientRect();
    const card = badge.parentElement!.getBoundingClientRect();
    const style = getComputedStyle(badge);
    return { middle: box.top + box.height / 2, cardTop: card.top, left: box.left, cardLeft: card.left, fill: style.backgroundColor, words: style.color, ring: style.boxShadow };
  });
}

// A colour of the theme's, as the page computes it.
async function tone(root: Locator, color: string): Promise<string> {
  return root.evaluate((element, value) => {
    const span = element.appendChild(document.createElement("span"));
    span.style.color = value;
    const computed = getComputedStyle(span).color;
    span.remove();
    return computed;
  }, color);
}

test("published, the plans are one list the CMS serves with no script, each card its name, price, features and button, a link to its address; three across on a desktop and as tall as one another, one under the other on a phone; the featured plan ringed, its badge on its top edge", async ({ page, request }) => {
  const join = await makePage(request, "Pricing joined", [section("j", "Join", [column("jc", [heading("jh", "Join the club")])])]);
  expect((await request.post(`${cms()}/api/pages/${join.id}/publish`, { data: {} })).status()).toBe(200);
  const hrefs = [`/${join.slug}`, "mailto:club@example.org?subject=Plus", "tel:+44-20-7946-0958"];
  const plans = PLANS.map((plan, index) => ({ ...plan, button: { ...plan.button, href: hrefs[index]! } }));
  const primary = { ...section("band", "Band", [column("bc", [widget("band-pricing", "pricing", { plans })])]), style: { base: { background: "primary" } } };
  const accent = { ...widget("accent-pricing", "pricing", { plans }), style: { base: { color: "accent" } } };
  const made = await makePage(request, "Pricing served", [section("s", "Club", [column("c", [widget("club-pricing", "pricing", { plans }), accent])]), primary]);
  // A link no button may have never reaches a page the CMS serves: the CMS
  // refuses to keep it, at the plan's link, as at a button block's.
  const refusedPlans = plans.map((plan, index) => (index === 0 ? { ...plan, button: { ...plan.button, href: "javascript:alert(1)" } } : plan));
  const refused = await request.put(`${cms()}/api/pages/${made.id}/draft`, {
    data: {
      revision: (await draftOf(request, made.id)).revision, saveId: `refused-${made.slug.slice(-50)}`,
      document: { schemaVersion: 1, title: "Pricing served", sections: [section("s", "Club", [column("c", [widget("club-pricing", "pricing", { plans: refusedPlans })])])] },
    },
  });
  expect(refused.status()).toBe(422);
  const { errors } = (await refused.json()) as { errors: Array<{ pointer: string; keyword: string }> };
  expect(errors).toContainEqual(expect.objectContaining({ pointer: "/document/sections/0/children/0/children/0/props/plans/0/button/href", keyword: "pattern" }));
  expect((await request.post(`${cms()}/api/pages/${made.id}/publish`, { data: {} })).status()).toBe(200);
  await page.goto(`${cms()}/${made.slug}`);
  await expect(page.locator("script")).toHaveCount(0);

  const root = page.locator('[data-block-id="club-pricing"]');
  // One list, each plan an item: its name a heading, its price and period,
  // its text, its features a list, its button a link to its address.
  await expect(root.locator(":scope > ul > li > h3")).toHaveText(PLANS.map((plan) => plan.name));
  await expect(root.locator(".sw-plan-price")).toHaveText(PLANS.map((plan) => `${plan.price} ${plan.period}`));
  await expect(root.locator("li.sw-plan").nth(1).locator(".sw-plan-features > li")).toHaveText(PLANS[1]!.features);
  const links = root.locator(".sw-plan-action > a.sw-btn");
  await expect(links).toHaveText(PLANS.map((plan) => plan.button.label));
  expect(await links.evaluateAll((all) => all.map((a) => a.getAttribute("href")))).toEqual(hrefs);
  // The page holds no address the URL policy would refuse.
  expect(await page.locator("a[href]").evaluateAll((all) => all.filter((a) => /^\s*(javascript|data|vbscript):/i.test(a.getAttribute("href") ?? "")).length)).toBe(0);

  // Three across on a desktop, as tall as one another, each button at its
  // card's foot.
  const drawn = await cards(root);
  expect(new Set(drawn.map((card) => card.top)).size).toBe(1);
  expect(new Set(drawn.map((card) => card.height)).size).toBe(1);
  expect(drawn[0]!.left).toBeLessThan(drawn[1]!.left);
  expect(drawn[1]!.left).toBeLessThan(drawn[2]!.left);
  for (const card of drawn) expect(Math.abs(card.bottom - card.padding - 1 - card.buttonBottom!)).toBeLessThan(1);

  // The featured plan ringed in the theme's primary, the others not; its
  // badge on its top edge, filled with the primary, its words the site's
  // Background, no ring around it on a light band.
  const [paper, ink, red, orange] = [await tone(root, "var(--sw-background)"), await tone(root, "var(--sw-text)"), await tone(root, "var(--sw-primary)"), await tone(root, "var(--sw-accent)")];
  expect(drawn.map((card) => card.ring)).toEqual(["none", `${red} 0px 0px 0px 1px`, "none"]);
  expect(drawn[1]!.border).toBe(red);
  const badge = await badgeOf(root);
  expect(Math.abs(badge.middle - badge.cardTop)).toBeLessThan(1.5);
  expect(badge.left).toBeGreaterThan(badge.cardLeft);
  expect([badge.fill, badge.words, badge.ring]).toEqual([red, paper, "rgba(0, 0, 0, 0) 0px 0px 0px 1.5px inset"]);
  await expect(root.locator(".sw-plan-badge")).toHaveText(["Most chosen"]);

  // The block's own Accent: the ring and the badge in it, the badge's
  // words in the site's Text.
  const own = page.locator('[data-block-id="accent-pricing"]');
  expect((await cards(own))[1]!.ring).toBe(`${orange} 0px 0px 0px 1px`);
  expect((await badgeOf(own)).fill).toBe(orange);
  expect((await badgeOf(own)).words).toBe(ink);

  // On a primary band, with no colour of the block's own: the ring in
  // paper, and a ring of paper keeps the badge apart from the band.
  const band = page.locator('[data-block-id="band-pricing"]');
  expect((await cards(band))[1]!.ring).toBe(`${paper} 0px 0px 0px 1px`);
  expect(await badgeOf(band)).toMatchObject({ fill: red, words: paper, ring: `${paper} 0px 0px 0px 1.5px inset` });

  // On a phone, one under the other.
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await cards(root);
  expect(new Set(phone.map((card) => card.left)).size).toBe(1);
  expect(phone[0]!.top).toBeLessThan(phone[1]!.top);
  expect(phone[1]!.top).toBeLessThan(phone[2]!.top);

  // A plan's button leads where it says.
  await page.setViewportSize({ width: 1440, height: 900 });
  await links.first().click();
  await expect(page).toHaveURL(`${cms()}/${join.slug}`);
  await expect(page.getByRole("heading", { name: "Join the club" })).toBeVisible();
});
