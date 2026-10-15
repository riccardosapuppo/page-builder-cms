// The storage battery (src/storage/contract.ts) on the browser's adapter,
// unchanged: every case runs in Node against adapters that live in pages
// of a real Chromium, on its real IndexedDB (./remote.ts). The editor's
// tab is one page; another tab, when a case opens one, is a second page of
// the same browser context, on the same database, as two tabs of one
// browser are. The cases share that one database, as they share one CMS
// on Rails.
//
// A case needing what the browser's storage does not have (a publish at a
// time, a visitor's form: no server) is skipped, visibly, with its reason;
// the first test names which, so a capability declared absent by mistake
// fails it rather than skipping more cases quietly. The cases of the
// site's header and footer run, the first of them on the database as this
// run's new browser context has it, before any case saves them.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readSiteTheme } from "../../build/site-file.ts";
import type { Capabilities } from "../../src/storage/adapter.ts";
import { STORAGE_CONTRACT, type ContractEnv, type Expect } from "../../src/storage/contract.ts";
import { remoteAdapter, storagePage } from "./remote.ts";

// The header's and footer's starters the storage makes them from:
// config/parts', which the editor's build reads for it.
const starters = readSiteTheme().parts as ContractEnv["starters"];

// What the browser's storage cannot do, and so the cases it skips.
const SKIPPED: Readonly<Record<string, string>> = {
  "a publish set for a time waits on the page, listed, with the draft it was set from kept as a scheduled version": "schedule",
  "a second schedule replaces the first; a cancel settles one, and cancelling one no longer pending says what became of it": "schedule",
  "a time already past or more than a year away, and a revision already live, are refused at their field; a revision moved past is a conflict": "schedule",
  "at its time, a scheduled publish puts live the draft as it was when set, not as it is then": "schedule",
  "a form sent from the live page is kept with the version and the fields it was sent with, listed newest first and counted by form": "responses",
  "the responses come a part at a time, newest first, and next continues them to the end": "responses",
  "a response deleted is gone from the list and cannot be read, deleting it again is not found, and a response is found only under its own page": "responses",
};

let context: BrowserContext;
let first: Page;
let second: Page;
let capabilities: Capabilities;
let names = 0;
const run = Date.now().toString(36);

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  first = await storagePage(await context.newPage());
  second = await storagePage(await context.newPage());
  capabilities = await first.evaluate(() => window.storagePage!.open("capabilities"));
});

test.afterAll(async () => {
  await context.close();
});

function env(): ContractEnv {
  return {
    adapter: remoteAdapter(first, capabilities),
    openTab: () => remoteAdapter(second, capabilities),
    expect: expect as unknown as Expect,
    unique: (prefix) => `${prefix}-${run}-${++names}`,
    readBytes: async (url) => Uint8Array.from(await first.evaluate((address) => window.storagePage!.bytes(address), url)),
    sendForm: () => Promise.reject(new Error("the browser's storage keeps no form answers: no case that needs them runs here")),
    starters,
  };
}

test("the battery holds its cases, and the browser's adapter skips only those of what it cannot do", () => {
  expect(STORAGE_CONTRACT.length).toBeGreaterThanOrEqual(50);
  expect(new Set(STORAGE_CONTRACT.map((c) => c.name)).size).toBe(STORAGE_CONTRACT.length);
  const skipped = STORAGE_CONTRACT.filter((c) => c.needs.some((operation) => !capabilities[operation])).map((c) => c.name);
  expect(skipped.sort()).toEqual(Object.keys(SKIPPED).sort());
  expect(capabilities).toEqual({ publish: true, schedule: false, responses: false, imageVariants: false, livePages: false, collections: true });
});

for (const contract of STORAGE_CONTRACT) {
  test(contract.name, async () => {
    const missing = contract.needs.filter((operation) => !capabilities[operation]);
    test.skip(missing.length > 0, `the browser's storage has no ${missing.join(", ")}`);
    await contract.run(env());
  });
}
