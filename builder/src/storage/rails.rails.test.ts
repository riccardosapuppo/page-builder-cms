// @vitest-environment jsdom
//
// The storage battery (contract.ts) on the Rails adapter, against a CMS
// this run started for itself (e2e/harness/vitest-rails.ts): its own
// databases and Active Storage root, deleted at the end of the run. The
// site's header and footer are made, each with its starter as its draft,
// by the first look at the pages of any file of the run; the example
// site's seed, which the README's test runs, publishes them as they are,
// and no file changes them.
//
// jsdom supplies what @rails/activestorage's DirectUpload uses in a browser
// (XMLHttpRequest, FileReader, File), with the document on the CMS's
// origin (vite.config.ts), so its requests are same-origin as the editor's
// are through its development server. JSON calls use Node's fetch, which,
// like curl, sends no Origin: the CMS's rule on other sites' writes is the
// probe's and the CMS's own tests' to show.
//
// A visitor's form is sent as a browser sends it from the live page: form
// encoded, with the page's Origin, which the CMS requires of every form.
// Each comes from an address of its own, in the range kept for
// documentation, through the forwarding header the CMS reads from
// 127.0.0.1 as from a proxy: the battery sends more forms than one
// address may in ten minutes.
//
// A visitor's checkout is made the same way, at the cart's addresses, the
// cart's cookie carried from answer to answer as a browser keeps it; the
// CMS sends the visitor on to the tests' fake Stripe (vitest-rails.ts),
// whose page the visitor pays at when the case says so, as at Stripe's.
import { describe, expect, inject, test } from "vitest";
import { readSiteTheme } from "../../build/site-file.ts";
import type { CartLine } from "../shared/shop.ts";
import { STORAGE_CONTRACT, type ContractEnv } from "./contract.ts";
import { createRailsAdapter } from "./rails.ts";

const cms = inject("cmsUrl");
const stripe = inject("stripeUrl");
// The header's and footer's starters the CMS makes them from:
// config/parts', read from the files as the CMS reads them.
const starters = readSiteTheme().parts as ContractEnv["starters"];

const adapter = () => createRailsAdapter({ apiBase: `${cms}/api` });
let names = 0;
let visitors = 0;
let shoppers = 0;
const run = Date.now().toString(36);

async function sendForm(live: string, formId: string, answers: Readonly<Record<string, string>>): Promise<void> {
  const fields = [`form=${encodeURIComponent(formId)}`, "website="];
  for (const [name, answer] of Object.entries(answers)) fields.push(`${encodeURIComponent(`answers[${name}]`)}=${encodeURIComponent(answer)}`);
  visitors += 1;
  const response = await fetch(new URL(live, cms), {
    method: "POST",
    body: fields.join("&"),
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: new URL(cms).origin,
      "X-Forwarded-For": `198.51.100.${(visitors % 254) + 1}`,
    },
  });
  // 303 to the confirmation once kept; a refusal draws the page again.
  if (response.status !== 303) throw new Error(`the form sent to ${live} was answered ${response.status}, not 303`);
}

// Each product put in the cart, then the checkout: 303 to the fake
// Stripe's page, where a visitor who pays leaves it. With the shop off
// no route takes the cart's writes, a 404, and no order is made.
async function checkout(lines: readonly CartLine[], { paid = false }: { paid?: boolean } = {}): Promise<boolean> {
  shoppers += 1;
  let cookie: string | null = null;
  const send = async (path: string, body: string) => {
    const response = await fetch(new URL(path, cms), {
      method: "POST",
      body,
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: new URL(cms).origin,
        "X-Forwarded-For": `203.0.113.${(shoppers % 254) + 1}`,
        ...(cookie === null ? {} : { Cookie: cookie }),
      },
    });
    const set = response.headers.getSetCookie().find((line) => line.startsWith("cart="));
    if (set) cookie = set.split(";")[0]!;
    return response;
  };
  for (const line of lines) {
    const put = await send("/cart/items", `entry=${line.entryId}&quantity=${line.quantity}`);
    if (put.status === 404) return false;
    if (put.status !== 303) throw new Error(`product ${line.entryId} put in the cart was answered ${put.status}, not 303`);
  }
  const done = await send("/cart/checkout", "");
  if (done.status === 404) return false;
  const page = done.headers.get("location") ?? "";
  if (done.status !== 303 || !page.startsWith(`${stripe}/c/pay/`)) throw new Error(`the checkout was answered ${done.status}, to ${page || "nowhere"}, not 303 to the fake Stripe's page`);
  if (paid) {
    const paying = await fetch(`${stripe}/_fake/sessions/${page.slice(`${stripe}/c/pay/`.length)}/pay`, {
      method: "POST",
      body: "email=ann%40example.org",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!paying.ok) throw new Error(`the fake Stripe answered ${paying.status} to the payment`);
  }
  return true;
}

function env(): ContractEnv {
  return {
    adapter: adapter(),
    openTab: adapter,
    expect,
    unique: (prefix) => `${prefix}-${run}-${++names}`,
    async readBytes(url) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
    sendForm,
    starters,
    checkout,
  };
}

describe("the Rails adapter keeps the storage contract", () => {
  test("the document is on the CMS's origin, so an upload's requests are same-origin", () => {
    expect(window.location.origin).toBe(new URL(cms).origin);
  });

  test("the battery holds its cases, and the Rails adapter skips none of them", () => {
    // An emptied or shortened battery would leave this file green with
    // fewer tests; a capability declared absent by mistake, with skips.
    expect(STORAGE_CONTRACT.length).toBeGreaterThanOrEqual(50);
    expect(new Set(STORAGE_CONTRACT.map((c) => c.name)).size).toBe(STORAGE_CONTRACT.length);
    const skipped = STORAGE_CONTRACT.filter((c) => c.needs.some((operation) => !adapter().capabilities[operation]));
    expect(skipped.map((c) => c.name)).toEqual([]);
  });

  for (const contract of STORAGE_CONTRACT) {
    const missing = contract.needs.filter((operation) => !adapter().capabilities[operation]);
    if (missing.length > 0) test.skip(`${contract.name} (this adapter has no ${missing.join(", ")})`, () => {});
    else test(contract.name, () => contract.run(env()));
  }
});
