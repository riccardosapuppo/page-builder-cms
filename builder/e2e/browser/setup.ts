// The global setup of the browser storage's tests: the editor's
// development server of the run's own, keeping its pages in the browser
// (no CMS), stopped by the function it returns, which Playwright runs as
// the global teardown whether the tests passed or not.
import { browserEditorPort } from "../harness/ports.ts";
import { startBuilder } from "../harness/servers.ts";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const editor = await startBuilder(browserEditorPort(), null, { storage: "browser" });
  console.log(`browser storage: the editor answers on ${editor.url}, keeping its pages in the browser`);
  process.env.E2E_BROWSER_URL = editor.url;
  return async () => {
    for (const line of await editor.stop()) console.log(`browser storage: ${line}`);
  };
}
