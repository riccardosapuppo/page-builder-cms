// node --test tools/check-production.test.ts (Ruby on the PATH)
//
// How the production check tells a fault of the CMS from a machine it
// cannot run on, on two planted cases, and how it and measure:server clear
// a build left in cms/public/assets. None needs the CMS's gems or a
// browser: the runs stop before Bundler loads, or before anything starts.
// - A fault planted into every Ruby process the check starts (RUBYOPT
//   requires a file that raises in assets:precompile): a failure, exit 1,
//   never "could not run" (exit 2), which `npm run check` reports as NOT
//   RUN and does not count as failed.
// - The check's port held by another process: could not run, exit 2.
// - A build planted in cms/public/assets, as a run stopped before its end
//   leaves one, then the check and measure:server each run with the fault
//   above: each removes the build before it precompiles, and says so.
//   measure:server's case is in this file because Node's runner runs test
//   files side by side, and every test here runs a tool that empties that
//   folder; it runs on the same port (PRODUCTION_CHECK_PORT, or 3902), and
//   MEASURE_QUIET_MAX=101 lets it past its wait for a quiet machine after
//   two readings, whatever the load.
// - A folder in cms/tmp as a run of the same tool on the same port stopped
//   before its end leaves one, its databases marked as production's, then
//   each tool runs with the fault above: each deletes the folder before it
//   makes its own, and says so (tools/lib/runs-left-behind.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLEARED } from "./lib/build-left-behind.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PRODUCTION_CHECK_PORT || "3902";

function tool(script: string, env: NodeJS.ProcessEnv): { code: number | null; output: string } {
  const ran = spawnSync(process.execPath, [script], { cwd: root, env: { ...process.env, PRODUCTION_CHECK_PORT: port, MEASURE_SERVER_PORT: port, ...env }, encoding: "utf8", timeout: 240_000 });
  return { code: ran.status, output: `${ran.stdout ?? ""}${ran.stderr ?? ""}` };
}

const check = (env: NodeJS.ProcessEnv) => tool("tools/check-production.ts", env);

// A Ruby file that raises in assets:precompile, required by every Ruby
// process a tool starts.
function withPlantedFault(body: (env: NodeJS.ProcessEnv) => void): void {
  const folder = mkdtempSync(join(tmpdir(), "pbc-production-plant-"));
  try {
    const plant = join(folder, "plant.rb");
    writeFileSync(plant, 'raise "planted: a fault that breaks the CMS" if ARGV.include?("assets:precompile")\n');
    body({ RUBYOPT: `-r${plant.replace(/\\/g, "/")}` });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

// A build in cms/public/assets as assets:precompile leaves it: the
// manifest and a fingerprinted stylesheet. Returns the stylesheet's path.
function plantBuild(): string {
  const assets = join(root, "cms", "public", "assets");
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, ".manifest.json"), '{"tokens.css":{"digested_path":"tokens-5ta1eb11.css","integrity":null}}');
  const file = join(assets, "tokens-5ta1eb11.css");
  writeFileSync(file, "/* planted: a build a run stopped before its end left behind */\r\n");
  return file;
}

test("planted: assets:precompile fails; the check fails (exit 1), it does not say it could not run", () => {
  withPlantedFault((env) => {
    const { code, output } = check(env);
    assert.match(output, /planted: a fault that breaks the CMS/);
    assert.match(output, /FAIL the check ran to its end/);
    assert.match(output, /^RESULT: \d+ of \d+ checks failed$/m);
    assert.doesNotMatch(output, /could not run/);
    assert.equal(code, 1, output);
  });
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

for (const [script, stopped] of [["tools/check-production.ts", "the check stopped"], ["tools/measure-server.ts", "the measurement stopped"]] as const) {
  test(`planted: a build left in cms/public/assets; ${script} removes it before it precompiles, and says so`, () => {
    withPlantedFault((env) => {
      const planted = plantBuild();
      try {
        const { code, output } = tool(script, { ...env, MEASURE_QUIET_MAX: "101" });
        assert.ok(output.includes(`ok   ${CLEARED}: one was left there, and is removed`), output);
        // It went on to the precompile, which the planted fault stops.
        assert.match(output, new RegExp(`${stopped}: assets:precompile failed`));
        assert.equal(existsSync(planted), false, output);
        assert.equal(code, 1, output);
      } finally {
        rmSync(join(root, "cms", "public", "assets"), { recursive: true, force: true });
      }
    });
  });
}

for (const [script, named, stopped] of [["tools/check-production.ts", "production-check", "the check stopped"], ["tools/measure-server.ts", "measure-server", "the measurement stopped"]] as const) {
  test(`planted: a folder a run stopped before its end left in cms/tmp; ${script} deletes it before it makes its own, and says so`, () => {
    withPlantedFault((env) => {
      // Named for a process id, which Windows can give this run again.
      const left = join(root, "cms", "tmp", `${named}-${port}-1`);
      mkdirSync(left, { recursive: true });
      writeFileSync(join(left, "production.sqlite3"), "");
      try {
        const { code, output } = tool(script, { ...env, MEASURE_QUIET_MAX: "101" });
        assert.ok(output.includes(`deleted what an earlier run left: cms/tmp/${named}-${port}-1`), output);
        // It went on to the precompile, which the planted fault stops.
        assert.match(output, new RegExp(`${stopped}: assets:precompile failed`));
        assert.equal(existsSync(left), false, output);
        assert.equal(code, 1, output);
      } finally {
        rmSync(left, { recursive: true, force: true });
        rmSync(join(root, "cms", "public", "assets"), { recursive: true, force: true });
      }
    });
  });
}
