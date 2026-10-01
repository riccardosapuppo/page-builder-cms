// node tools/probes/lazy-iframe-in-details.ts
//
// Does an <iframe loading="lazy"> inside a closed <details> stay unloaded in
// Chromium until the visitor opens it? The published page runs no script
// (Content-Security-Policy script-src 'none'), so this is the only way it has
// to show a video or a map "on click": if the frame loads while the details
// is closed, the provider sees every visitor, and the page must fall back to
// a plain link instead.
//
// Every request is answered by Playwright's router, inside the browser: the
// page and the "provider" are made up here, nothing reaches the network, and
// no server is started. Each case records which frame addresses the browser
// asked for. The cases around the question are controls: a lazy frame in
// view with no details (it must load, or the router is blind), a lazy frame
// far below the fold (it must wait, or "lazy" does nothing here), and an
// eager frame inside a closed details (does the details alone hold it?).
//
// Runs Chromium headless, both builds Playwright 1.62.1 has in its cache: the
// headless shell (the default) and the full browser in its new headless mode.
// Exits 1 if the answer differs between them or a control fails.
import { chromium, type Browser, type Page } from "playwright";

const PAGE = "http://127.0.0.1:3900/probe";
const PROVIDER = "https://frames.probe.test";
const CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  `frame-src ${PROVIDER}`,
].join("; ");

type Case = {
  name: string;
  body: string;
  // What the visitor does after the page has loaded and settled.
  act?: (page: Page) => Promise<void>;
  // The frame addresses that must have been requested at the end, in any order.
  expect: string[];
  control: boolean;
};

const frame = (id: string, lazy = true) =>
  `<iframe ${lazy ? 'loading="lazy" ' : ""}src="${PROVIDER}/${id}" title="${id}" width="560" height="315"></iframe>`;
// Chromium starts a lazy frame well before it scrolls into view: a first run
// with a 3000 px spacer loaded the "far below" control at once. 12000 px is
// beyond its distance threshold; 3000 px around the details case is not, so
// that case also shows the details holding a frame the distance alone would
// have loaded.
const spacer = '<div style="height:3000px">tall content</div>';
const farSpacer = '<div style="height:12000px">tall content</div>';

const cases: Case[] = [
  { name: "control: lazy frame in view, no details", body: frame("in-view"), expect: ["in-view"], control: true },
  { name: "control: lazy frame far below the fold, no details", body: farSpacer + frame("below"), expect: [], control: true },
  { name: "control: lazy frame 3000 px below the fold, no details", body: spacer + frame("near"), expect: ["near"], control: true },
  {
    name: "control: lazy frame far below the fold, scrolled to",
    body: farSpacer + frame("below-scrolled"),
    act: async (page) => {
      await page.locator("iframe").scrollIntoViewIfNeeded();
    },
    expect: ["below-scrolled"],
    control: true,
  },
  {
    name: "eager frame inside a closed details",
    body: `<details><summary>Watch</summary>${frame("eager-closed", false)}</details>`,
    expect: ["eager-closed"],
    control: false,
  },
  {
    name: "lazy frame inside a closed details, in view",
    body: `<details><summary>Watch</summary>${frame("lazy-closed")}</details>`,
    expect: [],
    control: false,
  },
  {
    name: "lazy frame inside a closed details, page scrolled past it and back",
    body: `${spacer}<details id="d"><summary>Watch</summary>${frame("lazy-closed-scrolled")}</details>${spacer}`,
    act: async (page) => {
      await page.locator("summary").scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(300);
      await page.locator("summary").scrollIntoViewIfNeeded();
    },
    expect: [],
    control: false,
  },
  {
    name: "lazy frame inside a details, opened with a click",
    body: `<details><summary>Watch</summary>${frame("lazy-clicked")}</details>`,
    act: async (page) => {
      await page.locator("summary").click();
    },
    expect: ["lazy-clicked"],
    control: false,
  },
  {
    name: "lazy frame inside a details, opened from the keyboard",
    body: `<details><summary>Watch</summary>${frame("lazy-keyboard")}</details>`,
    act: async (page) => {
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
    },
    expect: ["lazy-keyboard"],
    control: false,
  },
];

async function runCase(browser: Browser, c: Case): Promise<string[]> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const asked: string[] = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url === PAGE) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": CSP },
        body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe</title></head><body>${c.body}</body></html>`,
      });
    } else if (url.startsWith(`${PROVIDER}/`)) {
      asked.push(url.slice(PROVIDER.length + 1));
      await route.fulfill({ status: 200, headers: { "content-type": "text/html" }, body: "<p>frame</p>" });
    } else {
      await route.abort();
    }
  });
  await page.goto(PAGE, { waitUntil: "load" });
  // Lazy loading decides after layout, from an intersection check: give it
  // time to act, here and after each visitor action.
  await page.waitForTimeout(1500);
  if (c.act) {
    await c.act(page);
    await page.waitForTimeout(1500);
  }
  await page.close();
  return asked;
}

const builds = [
  { name: "headless shell", options: {} },
  { name: "full Chromium, new headless", options: { channel: "chromium" } },
] as const;

let failures = 0;
const answers = new Map<string, string[]>();
for (const build of builds) {
  const browser = await chromium.launch(build.options);
  console.log(`== ${build.name}: Chromium ${browser.version()}`);
  try {
    for (const c of cases) {
      const asked = await runCase(browser, c);
      const ok = asked.length === c.expect.length && c.expect.every((id) => asked.includes(id));
      const verdict = ok ? "as expected" : c.control ? "CONTROL FAILED" : "NOT as expected";
      if (!ok) failures += 1;
      console.log(`${ok ? "ok  " : "FAIL"} ${c.name}: frames requested [${asked.join(", ")}], expected [${c.expect.join(", ")}] (${verdict})`);
      const key = c.name;
      const seen = answers.get(key);
      const now = asked.slice().sort().join(",");
      if (seen && seen[0] !== now) {
        failures += 1;
        console.log(`FAIL ${c.name}: the two builds disagree ([${seen[0]}] against [${now}])`);
      }
      answers.set(key, [now]);
    }
  } finally {
    await browser.close();
  }
}

console.log(failures === 0 ? "RESULT: a lazy frame inside a closed details is not requested until the details is opened" : `RESULT: ${failures} unexpected result(s)`);
process.exit(failures === 0 ? 0 : 1);
