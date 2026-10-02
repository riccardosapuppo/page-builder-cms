// @vitest-environment jsdom
//
// The storage battery (contract.ts) on the Rails adapter, against a CMS
// this run started for itself (e2e/harness/vitest-rails.ts): its own
// databases and Active Storage root, deleted at the end of the run.
//
// jsdom supplies what @rails/activestorage's DirectUpload uses in a browser
// (XMLHttpRequest, FileReader, File), with the document on the CMS's
// origin (vite.config.ts), so its requests are same-origin as the editor's
// are through its development server. JSON calls use Node's fetch, which,
// like curl, sends no Origin: the CMS's rule on other sites' writes is the
// probe's and the CMS's own tests' to show.
import { describe, expect, inject, test } from "vitest";
import { STORAGE_CONTRACT, type ContractEnv } from "./contract.ts";
import { createRailsAdapter } from "./rails.ts";

const cms = inject("cmsUrl");

const adapter = () => createRailsAdapter({ apiBase: `${cms}/api` });
let names = 0;
const run = Date.now().toString(36);

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
  };
}

describe("the Rails adapter keeps the storage contract", () => {
  test("the document is on the CMS's origin, so an upload's requests are same-origin", () => {
    expect(window.location.origin).toBe(new URL(cms).origin);
  });

  for (const contract of STORAGE_CONTRACT) {
    const missing = contract.needs.filter((operation) => !adapter().capabilities[operation]);
    if (missing.length > 0) test.skip(`${contract.name} (this adapter has no ${missing.join(", ")})`, () => {});
    else test(contract.name, () => contract.run(env()));
  }
});
