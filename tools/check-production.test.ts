// node --test tools/check-production.test.ts (Ruby on the PATH)
//
// How the production check tells a fault of the CMS from a machine it
// cannot run on, on two planted cases. Neither needs the CMS's gems or a
// browser: the first stops before Bundler loads, the second before
// anything starts.
// - A fault planted into every Ruby process the check starts (RUBYOPT
//   requires a file that raises in assets:precompile): a failure, exit 1,
//   never "could not run" (exit 2), which `npm run check` reports as NOT
//   RUN and does not count as failed.
// - The check's port held by another process: could not run, exit 2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PRODUCTION_CHECK_PORT || "3902";

function check(env: NodeJS.ProcessEnv): { code: number | null; output: string } {
  const ran = spawnSync(process.execPath, ["tools/check-production.ts"], { cwd: root, env: { ...process.env, PRODUCTION_CHECK_PORT: port, ...env }, encoding: "utf8", timeout: 240_000 });
  return { code: ran.status, output: `${ran.stdout ?? ""}${ran.stderr ?? ""}` };
}

test("planted: assets:precompile fails; the check fails (exit 1), it does not say it could not run", () => {
  const folder = mkdtempSync(join(tmpdir(), "pbc-production-plant-"));
  try {
    const plant = join(folder, "plant.rb");
    writeFileSync(plant, 'raise "planted: a fault that breaks the CMS" if ARGV.include?("assets:precompile")\n');
    const { code, output } = check({ RUBYOPT: `-r${plant.replace(/\\/g, "/")}` });
    assert.match(output, /planted: a fault that breaks the CMS/);
    assert.match(output, /FAIL the check ran to its end/);
    assert.match(output, /^RESULT: \d+ of \d+ checks failed$/m);
    assert.doesNotMatch(output, /could not run/);
    assert.equal(code, 1, output);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("the check's port held by another process: could not run (exit 2), nothing started", async () => {
  const holder = createServer();
  await new Promise<void>((done, fail) => {
    holder.once("error", fail);
    holder.listen(Number(port), "127.0.0.1", done);
  });
  try {
    const { code, output } = check({});
    assert.match(output, new RegExp(`port ${port} is already taken .*: nothing was started`));
    assert.equal(code, 2, output);
  } finally {
    await new Promise((done) => holder.close(done));
  }
});
