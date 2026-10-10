// The site's header and footer, changed from the editor, on the run's CMS,
// as the person editing and a visitor meet them. The person changes the
// site's name, adds a link of the menu to a section of a page, chosen
// among the addresses the link field offers, takes the header's button
// away and saves; a visitor's browser (helpers/visitor.ts, its HTTP cache
// on), which kept the published page and got a 304 for it before the save
// and while the change was only typed, gets the page with the new header
// and footer at its next visit, the CMS drawing again only the page around
// the blocks, which it reads back from Solid Cache (counted in its
// database, helpers/cms-store.ts). On a phone 375 wide the new header
// still fits. A footer of words that cannot break (an e-mail address, a
// web address, a long compound word), which the panel takes, stays inside
// a window of 375 and of 320, and inside the editor's phone view. A short
// menu in Hebrew, Greek or Cyrillic keeps its links in the bar at 1024 and
// 1440, as one in Latin letters of its length does. Then the panel by the
// keyboard alone, with axe; a save another tab made first;
// and a refusal from the storage, said at its value. The tests of a run
// share one CMS, so each puts the header and footer back as it found
// them.
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { fragments } from "./helpers/cms-store.ts";
import { cms, column, device, expect, heading, makePage, open, section, test } from "./helpers/site.ts";
import { visitor } from "./helpers/visitor.ts";

test.use({ viewport: { width: 1440, height: 900 } });

interface SiteValues {
  name: string;
  menu: Array<{ label: string; href: string }>;
  action: { label: string; href: string } | null;
  footer: { lead: string; text: string };
}

async function siteNow(request: APIRequestContext): Promise<SiteValues & { revision: number }> {
  const answer = await request.get(`${cms()}/api/site`);
  expect(answer.status()).toBe(200);
  const { name, menu, action, footer, revision } = (await answer.json()) as SiteValues & { revision: number };
  return { name, menu, action, footer, revision };
}

// The header and footer as a test found them, put back from whatever
// revision they are at.
async function putBack(request: APIRequestContext, found: SiteValues): Promise<void> {
  const { revision } = await siteNow(request);
  const put = await request.put(`${cms()}/api/site`, { data: { revision, name: found.name, menu: found.menu, action: found.action, footer: found.footer } });
  expect(put.status(), await put.text()).toBe(200);
}

// A page whose second section has an anchor: where the new link leads.
async function tidePage(request: APIRequestContext) {
  const tides = { ...section("tides", "Tides", [column("c2", [heading("h2", "Today's tides")])]), props: { label: "Tides", anchor: "tides" } };
  return makePage(request, "Tide table", [section("intro", "Intro", [column("c1", [heading("h1", "Swim with the tide")])]), tides]);
}

// How a header fits where it is drawn: its brand and Menu inside the page
// root (a published page's window, the canvas's frame), not over each
// other; how many rows it takes; and how far the window scrolls sideways.
async function headerFit(page: Page, header: string) {
  return page.locator(header).evaluate((element) => {
    const root = element.closest(".site")!.getBoundingClientRect();
    const brand = element.querySelector(".sw-brand")!.getBoundingClientRect();
    const menu = element.querySelector(".sw-menu-button")!.getBoundingClientRect();
    const within = (box: DOMRect) => box.left >= root.left - 0.5 && box.right <= root.right + 0.5;
    const apart = brand.right <= menu.left || brand.bottom <= menu.top;
    return {
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      inside: within(brand) && within(menu),
      apart,
      rows: brand.bottom <= menu.top ? 2 : 1,
      height: Math.round(element.querySelector(".sw-header-row")!.getBoundingClientRect().height),
    };
  });
}

// How a footer fits where it is drawn: how far the window and the page root
// (a published page's window, the canvas's frame) scroll sideways, and
// whether the footer's words stay inside the root.
async function footerFit(page: Page, footer: string) {
  return page.locator(footer).evaluate((element) => {
    const site = element.closest(".site")!;
    const root = site.getBoundingClientRect();
    const words = element.querySelector("p")!.getBoundingClientRect();
    return {
      window: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      site: site.scrollWidth - site.clientWidth,
      inside: words.left >= root.left - 0.5 && words.right <= root.right + 0.5,
    };
  });
}

async function openPanel(page: Page) {
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("tab", { name: "Page" }).click();
  await sidebar.getByRole("button", { name: "Header and footer" }).click();
  const panel = page.getByRole("complementary", { name: "Header and footer" });
  await expect(panel.getByLabel("Site name")).toBeFocused();
  return panel;
}

test("the name changed, a link added to a page's section, the button taken away, saved: the published page shows them at the next visit, drawn again around its cached blocks, and a phone's header still fits", async ({ page, request, browser }) => {
  const found = await siteNow(request);
  const { id, slug } = await tidePage(request);
  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
  const live = `${cms()}/${slug}`;
  const reader = await visitor(browser);
  try {
    // Visit, then revisit: the browser keeps the page and the CMS, asked
    // with its ETag, sends no page.
    const first = await reader.visit(live);
    expect(first.status).toBe(200);
    await expect(reader.tab.locator("header .sw-brand")).toHaveText(found.name);
    let before = await fragments();
    const again = await reader.visit(live);
    expect([again.status, again.sent]).toEqual([304, first.etag]);
    expect(await fragments() - before).toBe(0);

    await open(page, id);
    const panel = await openPanel(page);
    const canvasHeader = page.locator('.canvas [data-theme-part="header"]');

    // The name, on the canvas as it is typed.
    await panel.getByLabel("Site name").fill("Northshore Swimmers");
    await expect(canvasHeader.locator(".sw-brand")).toHaveText("Northshore Swimmers");
    await expect(panel.getByRole("status").filter({ hasText: "Not saved yet" })).toBeVisible();

    // A new link, its words first, then its address chosen among those the
    // field offers: the page's section, named with the page's address.
    await panel.getByRole("button", { name: "Add a link" }).click();
    const added = panel.getByRole("group", { name: `Link ${found.menu.length + 1}` });
    await expect(added.getByLabel("Text")).toBeFocused();
    await page.keyboard.type("Tides");
    const address = added.getByLabel("Link");
    const offered = panel.locator(`datalist option[value="/${slug}#tides"]`);
    await expect(offered).toHaveText("Tide table, Tides section");
    expect(await address.getAttribute("list")).toBe(await panel.locator("datalist").getAttribute("id"));
    await address.fill((await offered.getAttribute("value"))!);
    await expect(canvasHeader.locator(".sw-nav-links a").last()).toHaveText("Tides");

    // The button, taken away.
    await panel.getByRole("button", { name: "Remove the button" }).click();
    await expect(panel.getByRole("button", { name: "Add a button" })).toBeFocused();
    await expect(canvasHeader.locator(".sw-btn")).toHaveCount(0);

    // Typed but not saved: the visitor still gets its copy.
    const typed = await reader.visit(live);
    expect([typed.status, typed.sent]).toEqual([304, first.etag]);

    await panel.getByRole("button", { name: "Save" }).click();
    await expect(panel.getByRole("status").filter({ hasText: "Saved for every page" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save" })).toBeFocused();
    const stored = await siteNow(request);
    expect(stored).toMatchObject({ name: "Northshore Swimmers", action: null, menu: [...found.menu, { label: "Tides", href: `/${slug}#tides` }], footer: found.footer });

    // The visitor's next visit, still with the old ETag, gets the new
    // header: the CMS draws the page around its blocks again, once, and
    // reads the blocks back from the cache.
    before = await fragments();
    const after = await reader.visit(live);
    expect([after.status, after.sent]).toEqual([200, first.etag]);
    expect(after.etag).not.toBe(first.etag);
    expect(await fragments() - before, "the page's own fragment; its six blocks reused").toBe(1);
    const header = reader.tab.locator("header");
    await expect(header.locator(".sw-brand")).toHaveText("Northshore Swimmers");
    await expect(header.locator(".sw-nav-links a")).toHaveText([...found.menu.map((l) => l.label), "Tides"]);
    expect(await header.locator(".sw-nav-links a").last().getAttribute("href")).toBe(`/${slug}#tides`);
    await expect(header.locator(".sw-btn")).toHaveCount(0);
    await expect(reader.tab.locator("footer p")).toHaveText(`${found.footer.lead} ${found.footer.text}`);
    await expect(reader.tab.getByRole("heading", { name: "Today's tides" })).toBeVisible();
    const kept = await reader.visit(live);
    expect([kept.status, kept.sent]).toEqual([304, after.etag]);
    expect(reader.problems).toEqual([]);

    // On a phone 375 wide the new header fits the window: the links folded
    // into Menu, the name and Menu whole inside it, apart, and the page not
    // wider than the window. A name this long puts Menu on a row of its
    // own under it: site.css lets the row wrap rather than leave the
    // window, and the panel says so beside the name.
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: "en-US", timezoneId: "UTC" });
    try {
      const tab = await phone.newPage();
      await tab.goto(live);
      await expect(tab.locator("header .sw-nav-links")).toBeHidden();
      await expect(tab.locator("header .sw-menu-button")).toBeVisible();
      const fit = await headerFit(tab, "header");
      expect(fit).toMatchObject({ sideways: 0, inside: true, apart: true });
      console.log(`header and footer: at 375 the header holds ${fit.rows} row(s), ${fit.height} px tall`);
    } finally {
      await phone.close();
    }

    // The editor's phone preview draws the same header the same way.
    await device(page, "Phone").click();
    const drawn = await headerFit(page, '.canvas [data-theme-part="header"]');
    expect(drawn).toMatchObject({ inside: true, apart: true });
  } finally {
    await reader.close();
    await putBack(request, found);
  }
});

// The panel takes any words up to the footer's limits, so a footer can hold
// one that has no place to break. The footer is a flex row, whose item is as
// wide as its longest word unless it may break inside it: without that, the
// address held the page wider than the window by up to 166 px at 320.
test("a footer of words that cannot break stays inside the window: published at 375 and 320, and in the editor's phone view", async ({ page, request, browser }) => {
  const found = await siteNow(request);
  const { id, slug } = await tidePage(request);
  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
  const footers = [
    { lead: "Write to", text: "membership@slackwaterswimmingclub.example" },
    { lead: "Tide tables:", text: "https://www.tidetablesforthenorthbay.example/slackwater?days=7" },
    { lead: "Schwimmvereinsmitgliedschaftsbedingungen.", text: "Gezeitentabellenhinweis." },
  ];
  try {
    for (const footer of footers) {
      const { revision } = await siteNow(request);
      const put = await request.put(`${cms()}/api/site`, { data: { revision, name: found.name, menu: found.menu, action: found.action, footer } });
      expect(put.status(), await put.text()).toBe(200);
      for (const width of [375, 320]) {
        const phone = await browser.newContext({ viewport: { width, height: 812 }, locale: "en-US", timezoneId: "UTC" });
        try {
          const tab = await phone.newPage();
          await tab.goto(`${cms()}/${slug}`);
          await tab.evaluate(() => document.fonts.ready);
          await expect(tab.locator("footer.sw-footer p")).toHaveText(`${footer.lead} ${footer.text}`);
          expect(await footerFit(tab, "footer.sw-footer"), `"${footer.text}" published, ${width} wide`).toEqual({ window: 0, site: 0, inside: true });
        } finally {
          await phone.close();
        }
      }
      await open(page, id);
      await device(page, "Phone").click();
      await expect(page.locator('.canvas [data-theme-part="footer"] p')).toHaveText(`${footer.lead} ${footer.text}`);
      expect(await footerFit(page, '.canvas [data-theme-part="footer"]'), `"${footer.text}" in the editor's phone view`).toEqual({ window: 0, site: 0, inside: true });
    }
  } finally {
    await putBack(request, found);
  }
});

// A short menu in another alphabet is no longer than the same words in
// Latin letters: its links stay in the bar where the design keeps them. The
// server counted every letter outside the face at 1.5 em, and folded the
// links of a short Hebrew header below 1200 and of a Greek one at every
// width, behind Menu on a wide screen where they fit; each letter is now
// counted at what the browser's fallback fonts draw it at. Nothing here
// asks how a visitor's own fonts draw them, only where the page puts the
// links: that follows the file's widths, the same on every machine.
test("short menus in Hebrew, Greek and Cyrillic keep their links in the bar at 1024 and at 1440, on the published page and in the editor", async ({ page, request, browser }) => {
  const found = await siteNow(request);
  const { id, slug } = await tidePage(request);
  expect((await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} })).status()).toBe(200);
  const link = (label: string, k: number) => ({ label, href: `/#part-${k + 1}` });
  const headers: Array<{ script: string; name: string; menu: SiteValues["menu"]; action: SiteValues["action"] }> = [
    { script: "Hebrew", name: "מים שקטים", menu: ["שחייה", "גלריה", "עלינו", "שאלות"].map(link), action: { label: "הצטרפו", href: "/#join" } },
    { script: "Greek", name: "Ήρεμα νερά", menu: ["Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις"].map(link), action: { label: "Γραφτείτε", href: "/#join" } },
    { script: "Cyrillic", name: "Тихая вода", menu: ["Заплывы", "Галерея", "Встречи", "Вопросы"].map(link), action: { label: "Вступить", href: "/#join" } },
  ];
  try {
    for (const { script, name, menu, action } of headers) {
      const { revision } = await siteNow(request);
      const put = await request.put(`${cms()}/api/site`, { data: { revision, name, menu, action, footer: found.footer } });
      expect(put.status(), await put.text()).toBe(200);
      for (const width of [1024, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "en-US", timezoneId: "UTC" });
        try {
          const tab = await context.newPage();
          await tab.goto(`${cms()}/${slug}`);
          await expect(tab.locator("header .sw-brand")).toHaveText(name);
          await expect(tab.locator("header .sw-nav-links a"), `${script} at ${width}: the links in the bar`).toHaveText(menu.map((l) => l.label));
          await expect(tab.locator("header .sw-nav-links"), `${script} at ${width}`).toBeVisible();
          await expect(tab.locator("header .sw-menu"), `${script} at ${width}: no Menu beside them`).toBeHidden();
          const sideways = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(sideways, `${script} at ${width}: the page scrolls sideways`).toBe(0);
        } finally {
          await context.close();
        }
      }
      // The editor's desktop view draws the same header with the same links.
      await open(page, id);
      const canvasHeader = page.locator('.canvas [data-theme-part="header"]');
      await expect(canvasHeader.locator(".sw-brand")).toHaveText(name);
      await expect(canvasHeader.locator(".sw-nav-links"), `${script} in the editor`).toBeVisible();
      await expect(canvasHeader.locator(".sw-menu"), `${script} in the editor: no Menu beside them`).toBeHidden();
    }
  } finally {
    await putBack(request, found);
  }
});

test("the panel by the keyboard alone: in from the Page tab, a link added, moved and another removed, each with the focus where the person is, saved; and axe finds nothing serious", { tag: "@a11y" }, async ({ page, request }) => {
  const found = await siteNow(request);
  const { id } = await tidePage(request);
  try {
    await open(page, id);
    const sidebar = page.getByRole("complementary", { name: "Settings" });
    await sidebar.getByRole("tab", { name: "Page" }).click();
    const entry = sidebar.getByRole("button", { name: "Header and footer" });
    await entry.focus();
    await page.keyboard.press("Enter");
    const panel = page.getByRole("complementary", { name: "Header and footer" });
    await expect(panel.getByLabel("Site name")).toBeFocused();
    const report = await axe(page, { include: ".sidebar" });
    for (const line of report.other) console.log(`header and footer panel: ${line}`);
    expect(report.passes, "axe ran its rules").toBeGreaterThan(5);
    expect(report.serious).toEqual([]);

    // Add a link: Tab to Add a link, Enter; the focus in its words.
    const reach = async (target: Locator, key: "Tab" | "Shift+Tab") => {
      for (let presses = 0; presses < 60 && !(await target.evaluate((e) => e === document.activeElement)); presses += 1) await page.keyboard.press(key);
      await expect(target).toBeFocused();
    };
    await reach(panel.getByRole("button", { name: "Add a link" }), "Tab");
    await page.keyboard.press("Enter");
    const last = found.menu.length + 1;
    await expect(panel.getByRole("group", { name: `Link ${last}` }).getByLabel("Text")).toBeFocused();
    await page.keyboard.type("Contact");
    await page.keyboard.press("Tab");
    await page.keyboard.type("/contact");

    // Up one place by its named button, by Shift+Tab and Enter: the focus
    // stays on the button of the link it moved.
    await reach(panel.getByRole("button", { name: "Move Contact up" }), "Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("group", { name: `Link ${last - 1}` }).getByLabel("Text")).toHaveValue("Contact");
    await expect(panel.getByRole("button", { name: "Move Contact up" })).toBeFocused();
    await expect(panel.locator(".tray-body > [role=status]")).toHaveText(`Contact moved up: link ${last - 1} of ${last}.`);

    // The first link removed: the focus on the words of the one that took
    // its place.
    const firstRemove = panel.getByRole("button", { name: `Remove ${found.menu[0]!.label}` });
    await firstRemove.focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("group", { name: "Link 1" }).getByLabel("Text")).toBeFocused();
    await expect(panel.getByRole("group", { name: "Link 1" }).getByLabel("Text")).toHaveValue(found.menu[1]!.label);

    const again = await axe(page, { include: ".sidebar" });
    expect(again.serious, "with a link added and one taken away").toEqual([]);

    // Saved from the keyboard.
    await panel.getByRole("button", { name: "Save" }).focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("status").filter({ hasText: "Saved for every page" })).toBeVisible();
    expect((await siteNow(request)).menu.map((l) => l.label)).toEqual([...found.menu.slice(1, -1).map((l) => l.label), "Contact", found.menu.at(-1)!.label]);

    // Back to the Page tab, the focus on the way in.
    await panel.getByRole("button", { name: "Back to Page" }).focus();
    await page.keyboard.press("Enter");
    await expect(entry).toBeFocused();
  } finally {
    await putBack(request, found);
  }
});

test.describe("another tab first", () => {
  // The CMS's 409, which Chromium lists in the console.
  test.use({ allowConsole: /status of 409 \(Conflict\)/ });

  test("a save another tab made first stops this one until the person chooses, and Keep mine saves this tab's values over it", async ({ page, request }) => {
    const found = await siteNow(request);
    const { id } = await tidePage(request);
    try {
      await open(page, id);
      const panel = await openPanel(page);
      await panel.getByLabel("Site name").fill("Mine");
      // Another tab saves the footer meanwhile.
      const elsewhere = await request.put(`${cms()}/api/site`, { data: { revision: found.revision, name: found.name, menu: found.menu, action: found.action, footer: { lead: "Theirs.", text: found.footer.text } } });
      expect(elsewhere.status()).toBe(200);
      await panel.getByRole("button", { name: "Save" }).click();
      const conflict = panel.getByRole("alert");
      await expect(conflict).toContainText("Changed in another tab.");
      await expect(conflict.getByRole("button", { name: "Reload" })).toBeFocused();
      // It looks as the page's own conflict does (design/layout/shots-extra/
      // conflict.png): the amber tint, an edge in the warning colour and the
      // warning icon in it, not the grey of a note. Colours are read from the
      // tokens, as the browser resolves them.
      const look = await conflict.evaluate((box) => {
        const colour = (token: string) => {
          const probe = document.createElement("i");
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const value = getComputedStyle(probe).color;
          probe.remove();
          return value;
        };
        const icon = box.querySelector("svg");
        return {
          background: getComputedStyle(box).backgroundColor,
          edge: getComputedStyle(box).boxShadow,
          icon: icon ? getComputedStyle(icon).color : null,
          tint: colour("--warn-tint"),
          warn: colour("--warn"),
        };
      });
      expect(look.background).toBe(look.tint);
      expect(look.edge).toContain(look.warn);
      expect(look.icon).toBe(look.warn);
      const report = await axe(page, { include: ".sidebar" });
      expect(report.serious, "axe on the conflict: graphite words and buttons on the amber tint").toEqual([]);
      expect((await siteNow(request)).footer.lead, "nothing saved until the person chooses").toBe("Theirs.");
      await conflict.getByRole("button", { name: "Keep mine" }).click();
      await expect(panel.getByRole("status").filter({ hasText: "Saved for every page" })).toBeVisible();
      // Keep mine sends this tab's values whole: its footer too.
      expect(await siteNow(request)).toMatchObject({ name: "Mine", footer: found.footer });
    } finally {
      await putBack(request, found);
    }
  });
});

test("a refusal from the storage is said at the value it names, which takes the focus, and nothing is saved", async ({ page, request }) => {
  const found = await siteNow(request);
  const { id } = await tidePage(request);
  await open(page, id);
  // The CMS refuses the next save for the first link's address, as it
  // would a value this editor's own check let through.
  await page.route("**/api/site", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "invalid_request", message: "The request is not valid.", errors: [{ pointer: "/menu/0/href", keyword: "pattern", blockPointer: null, message: "does not match the pattern" }] }) });
  });
  const panel = await openPanel(page);
  await panel.getByLabel("Site name").fill("Refused");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByRole("alert")).toHaveText("Not saved: every page keeps the header and footer it had. Put right what is marked below.");
  const link = panel.getByRole("group", { name: "Link 1" }).getByLabel("Link");
  await expect(link).toBeFocused();
  await expect(link).toHaveAttribute("aria-invalid", "true");
  await expect(panel.getByRole("group", { name: "Link 1" })).toContainText("Use a full address (https://…), a path on this site (/…), #anchor, mailto: or tel:.");
  expect(await siteNow(request)).toMatchObject({ name: found.name, revision: found.revision });
});
