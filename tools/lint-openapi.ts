// npm run lint:openapi
//
// Lints cms/openapi.yaml with Redocly CLI, a linter written by someone
// else, with its built-in recommended rules. It follows the $refs into
// schema/block-document.schema.json, so a broken reference or a malformed
// keyword in the shared schema fails here too.
//
// Redocly CLI sends usage data unless REDOCLY_TELEMETRY is "off", and checks
// for a newer version on every start; both are switched off here, for every
// run, rather than left to whoever calls it. Any argument is passed on, so
// `npm run lint:openapi -- other.yaml` lints another file.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(dirname(createRequire(import.meta.url).resolve("@redocly/cli/package.json")), "bin", "cli.js");
const files = process.argv.length > 2 ? process.argv.slice(2) : [join(root, "cms", "openapi.yaml")];

const run = spawnSync(process.execPath, [cli, "lint", ...files], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, REDOCLY_TELEMETRY: "off", REDOCLY_SUPPRESS_UPDATE_NOTICE: "true" },
});

if (run.error) {
  console.error(`lint:openapi: could not start Redocly CLI: ${run.error.message}`);
  process.exit(2);
}
process.exit(run.status ?? 1);
