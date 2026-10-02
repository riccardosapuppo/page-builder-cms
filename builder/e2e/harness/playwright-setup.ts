// Playwright's global setup: a CMS and an editor server of the run's own
// (servers.ts), stopped by the function it returns, which Playwright runs
// as the global teardown, whether the tests passed or not.
import { builderPort, cmsPort } from "./ports.ts";
import { startBuilder, startCms } from "./servers.ts";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const cms = await startCms(cmsPort());
  console.log(`e2e: the CMS answers on ${cms.url} (e2e environment, data in ${cms.folder})`);
  let builder;
  try {
    builder = await startBuilder(builderPort(), cms.url);
  } catch (error) {
    for (const line of await cms.stop()) console.log(`e2e: ${line}`);
    throw error;
  }
  console.log(`e2e: the editor answers on ${builder.url}, its proxy pointed at ${cms.url}`);
  // Both URLs, for tests that also ask the CMS directly.
  process.env.E2E_CMS_URL = cms.url;
  process.env.E2E_BUILDER_URL = builder.url;

  return async () => {
    for (const server of [builder, cms]) {
      for (const line of await server.stop()) console.log(`e2e: ${line}`);
    }
  };
}
