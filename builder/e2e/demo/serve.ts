// npm run serve:demo, from builder/: the demo as npm run build:demo left it
// in dist-demo/, served as GitHub Pages serves it
// (../harness/pages-server.ts), at http://127.0.0.1:4903/page-builder-cms/,
// or at the root with DEMO_BASE=/, as a host of its own serves it
// (E2E_DEMO_PORT moves the port). Ctrl+C stops it.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEMO_BASE, DEMO_OUT_DIR } from "../../build/demo.ts";
import { builderRoot } from "../../build/paths.ts";
import { demoPort } from "../harness/ports.ts";
import { startPagesServer } from "../harness/pages-server.ts";

const built = join(builderRoot, DEMO_OUT_DIR);
if (!existsSync(join(built, "index.html"))) {
  console.error(`There is no demo in ${DEMO_OUT_DIR}/ to serve: npm run build:demo first.`);
  process.exit(1);
}
const server = await startPagesServer(demoPort(), { [DEMO_BASE]: built });
console.log(`The demo answers on ${server.url}${DEMO_BASE}, served from ${DEMO_OUT_DIR}/ under ${DEMO_BASE}. Ctrl+C stops it.`);
const stop = () => {
  void server.stop().then((lines) => {
    for (const line of lines) console.log(line);
    process.exit(0);
  });
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
