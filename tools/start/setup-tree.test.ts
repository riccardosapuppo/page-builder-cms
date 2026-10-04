// node --test tools/start/setup-tree.test.ts (Ruby on the PATH, the CMS's
// gems installed: npm run setup)
//
// npm run setup, and so npm start, leave the working tree as they found
// it. db:prepare dumps the schema after it runs a migration (a development
// database older than the code, after a pull brought a migration), and
// Ruby on Windows writes a text file with CRLF line endings: a reader's
// npm start left cms/db/schema.rb modified, every line ending changed and
// nothing else (cms/lib/tasks/schema_dump.rake now writes it with LF).
//
// The setup runs here as a reader runs it, on a development database of
// its own (DATABASE_URL) one migration behind, so that it migrates and
// dumps. The dump goes (SCHEMA) to a copy of the schema in a git
// repository of the test's own, checked in as a clone of this repository
// has it, with the repository's .gitattributes: so git judges that copy
// as it would the real file, and a run never rewrites the tree it is run
// in, where someone may be writing a migration. All of it lives in a
// folder under cms/tmp, deleted at the end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { cmsRoot, lastLines, repoRoot, run } from "../lib/commands.ts";

const gems = run("ruby", ["-S", "bundle", "check"], { cwd: cmsRoot });
const skip = gems.error ? "Ruby is not on the PATH" : gems.status !== 0 ? "the CMS's gems are not installed: npm run setup installs them" : false;

function git(cwd: string, args: string[]): string {
  const ran = run("git", args, { cwd });
  assert.equal(ran.status, 0, `git ${args.join(" ")} failed:\n${ran.stdout}${ran.stderr}`);
  return ran.stdout;
}

function rails(args: string[], env: NodeJS.ProcessEnv): string {
  const ran = run("ruby", ["bin/rails", ...args], { cwd: cmsRoot, env });
  assert.equal(ran.status, 0, `bin/rails ${args.join(" ")} failed (exit ${ran.status}):\n${lastLines(ran.stdout + ran.stderr)}`);
  return ran.stdout + ran.stderr;
}

test("npm run setup, with a migration to run, leaves the schema it dumps byte for byte as checked out, and git status as it was", { skip }, (t) => {
  const folder = join(cmsRoot, "tmp", `setup-tree-${process.pid}-${Date.now().toString(36)}`);
  const clone = join(folder, "clone");
  const schema = join(clone, "db", "schema.rb");
  try {
    // The schema as a checkout writes it: the tree's own, with LF.
    mkdirSync(join(clone, "db"), { recursive: true });
    copyFileSync(join(repoRoot, ".gitattributes"), join(clone, ".gitattributes"));
    writeFileSync(schema, readFileSync(join(cmsRoot, "db", "schema.rb"), "utf8").replace(/\r\n/g, "\n"));
    git(clone, ["init", "--quiet"]);
    git(clone, ["add", "--", ".gitattributes", "db/schema.rb"]);
    const checkedIn = git(clone, ["status", "--porcelain"]);
    assert.deepEqual(checkedIn.trim().split(/\r?\n/), ["A  .gitattributes", "A  db/schema.rb"]);
    const before = readFileSync(schema);

    // A development database of the test's own, one migration behind: the
    // schema loaded, then the last migration taken back (its own dump sent
    // elsewhere). The cache's and the queue's too, should development
    // have them, so none of the reader's own is opened.
    const url = (name: string) => `sqlite3:${relative(cmsRoot, join(folder, name)).replace(/\\/g, "/")}`;
    const database = {
      ...process.env,
      RAILS_ENV: "development",
      SKIP_TEST_DATABASE: "1",
      DATABASE_URL: url("development.sqlite3"),
      CACHE_DATABASE_URL: url("development_cache.sqlite3"),
      QUEUE_DATABASE_URL: url("development_queue.sqlite3"),
    };
    // Each database from its own schema file, read and not written.
    rails(["db:create", "db:schema:load"], database);
    // With more than one database, Rails takes a migration back from one
    // named database only: the primary, whose schema the setup dumps.
    const rollback = { ...database, SCHEMA: join(folder, "rolled-back.rb") };
    const plain = run("ruby", ["bin/rails", "db:rollback"], { cwd: cmsRoot, env: rollback });
    const back = plain.status === 0 ? plain.stdout + plain.stderr
      : /db:rollback:primary/.test(plain.stdout + plain.stderr) ? rails(["db:rollback:primary"], rollback)
        : assert.fail(`bin/rails db:rollback failed (exit ${plain.status}):\n${lastLines(plain.stdout + plain.stderr)}`);
    const migration = /== (\d+) \w+: reverted/.exec(back)?.[1];
    assert.ok(migration, `db:rollback reverted no migration:\n${lastLines(back)}`);
    const writtenAt = statSync(schema).mtimeMs;

    // The setup, as a reader runs it.
    const setup = run(process.execPath, [join(repoRoot, "tools", "start.cjs"), "--setup"], { cwd: repoRoot, env: { ...database, SCHEMA: schema } });
    const said = setup.stdout + setup.stderr;
    assert.equal(setup.status, 0, `npm run setup failed (exit ${setup.status}):\n${lastLines(said, 40)}`);
    // It ran the migration, and so wrote the schema: the check below has
    // a dump to look at.
    assert.match(said, new RegExp(`== ${migration} \\w+: migrated`), `the setup did not run migration ${migration}:\n${lastLines(said, 40)}`);
    assert.notEqual(statSync(schema).mtimeMs, writtenAt, "the setup did not write the schema");

    const after = readFileSync(schema);
    const lines = after.toString("utf8").split("\n").length;
    const crlf = after.toString("utf8").split("\r\n").length - 1;
    const status = git(clone, ["status", "--porcelain"]);
    t.diagnostic(`schema dumped after migration ${migration}: ${after.length} bytes, ${lines} lines, ${crlf} ending in CRLF; git status: ${status.trim().split(/\r?\n/).join(", ")}`);
    // All three said at once, so a failure shows each of them.
    const wrong = [
      crlf > 0 ? `the dump ends ${crlf} lines with CRLF` : null,
      after.equals(before) ? null : `the dump is not the schema as checked out, byte for byte (${after.length} bytes, not ${before.length})`,
      status === checkedIn ? null : `git status changed: ${status.trim().split(/\r?\n/).join(", ")}`,
    ].filter((line) => line !== null);
    assert.deepEqual(wrong, []);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
