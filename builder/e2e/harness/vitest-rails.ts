// Vitest's global setup for the suites that need a real CMS (the "rails"
// project, *.rails.test.ts): one CMS of the run's own, from servers.ts,
// its shop's checkout going to the tests' fake Stripe, started first;
// both stopped when the run ends. A test reads the CMS's address with
// inject("cmsUrl"), the folder its databases are in with
// inject("cmsFolder"), for the test that seeds it, and the fake's address
// with inject("stripeUrl"), for a visitor who pays there (typed in
// ../../test/provided-context.d.ts).
import type { TestProject } from "vitest/node";
import { cmsPort } from "./ports.ts";
import { startCms, startFakeStripe } from "./servers.ts";

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const stripe = await startFakeStripe();
  console.log(`rails tests: the fake Stripe answers on ${stripe.url}`);
  let cms;
  try {
    cms = await startCms(cmsPort(), { stripe });
  } catch (error) {
    for (const line of await stripe.stop()) console.log(`rails tests: ${line}`);
    throw error;
  }
  console.log(`rails tests: the CMS answers on ${cms.url} (e2e environment, data in ${cms.folder})`);
  project.provide("cmsUrl", cms.url);
  project.provide("cmsFolder", cms.folder);
  project.provide("stripeUrl", stripe.url);
  return async () => {
    for (const server of [cms, stripe]) {
      for (const line of await server.stop()) console.log(`rails tests: ${line}`);
    }
  };
}
