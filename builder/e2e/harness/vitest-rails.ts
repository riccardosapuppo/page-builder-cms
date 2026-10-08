// Vitest's global setup for the suites that need a real CMS (the "rails"
// project, *.rails.test.ts): one CMS of the run's own, from servers.ts,
// stopped when the run ends. A test reads its address with
// inject("cmsUrl") and the folder its databases are in with
// inject("cmsFolder"), for the test that seeds it (typed in
// ../../test/provided-context.d.ts).
import type { TestProject } from "vitest/node";
import { cmsPort } from "./ports.ts";
import { startCms } from "./servers.ts";

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const cms = await startCms(cmsPort());
  console.log(`rails tests: the CMS answers on ${cms.url} (e2e environment, data in ${cms.folder})`);
  project.provide("cmsUrl", cms.url);
  project.provide("cmsFolder", cms.folder);
  return async () => {
    for (const line of await cms.stop()) console.log(`rails tests: ${line}`);
  };
}
