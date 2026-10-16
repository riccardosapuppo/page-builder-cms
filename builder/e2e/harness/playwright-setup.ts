// Playwright's global setup: the tests' fake Stripe, then a CMS and an
// editor server of the run's own (servers.ts), the CMS's checkout going
// to the fake; all stopped by the function it returns, which Playwright
// runs as the global teardown, whether the tests passed or not.
import { builderPort, cmsPort } from "./ports.ts";
import { startBuilder, startCms, startFakeStripe, type Server } from "./servers.ts";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const stripe = await startFakeStripe();
  console.log(`e2e: the fake Stripe answers on ${stripe.url}`);
  const started: Server[] = [stripe];
  const stopAll = async () => {
    for (const server of started.reverse()) {
      for (const line of await server.stop()) console.log(`e2e: ${line}`);
    }
  };
  try {
    const cms = await startCms(cmsPort(), { stripe });
    started.push(cms);
    console.log(`e2e: the CMS answers on ${cms.url} (e2e environment, data in ${cms.folder}), its checkout going to the fake Stripe`);
    const builder = await startBuilder(builderPort(), cms.url);
    started.push(builder);
    console.log(`e2e: the editor answers on ${builder.url}, its proxy pointed at ${cms.url}`);
    // The URLs, for tests that also ask the CMS directly, and for a visitor
    // who pays on the fake's page; and the CMS's folder, for tests that
    // read what its databases keep (helpers/cms-store.ts).
    process.env.E2E_CMS_URL = cms.url;
    process.env.E2E_BUILDER_URL = builder.url;
    process.env.E2E_CMS_FOLDER = cms.folder;
    process.env.E2E_STRIPE_URL = stripe.url;
  } catch (error) {
    await stopAll();
    throw error;
  }
  return stopAll;
}
