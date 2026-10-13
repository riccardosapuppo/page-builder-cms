// The global setup of the demo's story: the demo's build in dist-demo/,
// served as GitHub Pages serves it (../harness/pages-server.ts), under its
// base (DEMO_BASE, ../../build/demo.ts), stopped by
// the function it returns, which Playwright runs as the global teardown
// whether the tests passed or not. A build older than the editor's source
// would test what is not there any more: npm run e2e:demo builds it first.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEMO_BASE, DEMO_OUT_DIR } from "../../build/demo.ts";
import { builderRoot } from "../../build/paths.ts";
import { demoPort } from "../harness/ports.ts";
import { startPagesServer } from "../harness/pages-server.ts";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const built = join(builderRoot, DEMO_OUT_DIR);
  if (!existsSync(join(built, "index.html"))) throw new Error(`There is no demo in ${DEMO_OUT_DIR}/: npm run e2e:demo builds it before the story, npm run build:demo alone.`);
  const server = await startPagesServer(demoPort(), { [DEMO_BASE]: built });
  console.log(`demo: ${DEMO_OUT_DIR}/ answers on ${server.url}${DEMO_BASE}, as a static host serves it`);
  return async () => {
    for (const line of await server.stop()) console.log(`demo: ${line}`);
  };
}
