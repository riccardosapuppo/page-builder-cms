// Starts, for one test run, a CMS and an editor development server of its
// own, and stops them, leaving nothing behind.
//
// - The CMS runs in the e2e environment (cms/config/environments/e2e.rb)
//   on three SQLite databases (primary, cache, queue) and an Active
//   Storage root, all in a folder made for the run under cms/tmp, as
//   tools/check-production.ts does for production. Nothing it writes
//   touches the development or test databases or storage/.
// - The editor's Vite server runs with its proxy pointed at that CMS.
// - Each waits for the server to answer for itself (rule 53): the CMS's
//   /up and an API read on the empty database; the editor's index page and,
//   through its proxy, the same API read. Then the system is asked who
//   listens on the port, which must be the process started here and no
//   other (rule 57): a server left running by someone else answers like
//   ours would.
// - Stopping kills the whole tree (taskkill /T /F on Windows, the process
//   group elsewhere: ../../../tools/lib/processes.ts), shows the port
//   closed, and only then deletes the folder: Windows does not delete an
//   SQLite file a live process holds open.
import { spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { listeners, startTree, stopTree } from "../../../tools/lib/processes.ts";
import { builderRoot, repoRoot } from "../../build/paths.ts";

const cmsRoot = join(repoRoot, "cms");
const READY_WITHIN_MS = 120_000;

export interface Server {
  url: string;
  port: number;
  // The folder the run writes to, deleted by stop().
  folder: string;
  // Stops the server tree, checks the port is closed and the folder gone,
  // and says what it did. Throws if either is not so.
  stop(): Promise<string[]>;
}

function holders(port: number): string {
  return listeners(port).map((l) => `${l.address} (process ${l.pid})`).join(", ");
}

function assertFree(port: number, what: string): void {
  const taken = holders(port);
  if (taken) throw new Error(`port ${port}, for ${what}, is already taken by ${taken}: nothing was started`);
}

function tail(file: string, lines = 30): string {
  if (!existsSync(file)) return "(no log)";
  return readFileSync(file, "utf8").split(/\r?\n/).slice(-lines).join("\n");
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

// Polls until check() is true, the child exits, or the time is up.
async function waitFor(child: ChildProcess, what: string, log: string, check: () => Promise<boolean>): Promise<void> {
  const until = Date.now() + READY_WITHIN_MS;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`${what} exited with ${child.exitCode} before it was ready:\n${tail(log)}`);
    if (await check().catch(() => false)) return;
    await pause(500);
  }
  throw new Error(`${what} was not ready within ${READY_WITHIN_MS / 1000} s:\n${tail(log)}`);
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  return { status: response.status, body: await response.json() };
}

// The empty database's answer to GET /api/pages: a run that met another
// server's data would see pages here.
async function emptyPageList(url: string): Promise<boolean> {
  const { status, body } = await getJson(`${url}/api/pages`);
  return status === 200 && JSON.stringify(body) === JSON.stringify({ pages: [] });
}

function assertOwnListener(port: number, child: ChildProcess, what: string): void {
  const owners = listeners(port);
  const ours = owners.length === 1 && owners[0]!.pid === String(child.pid) && owners[0]!.address === `127.0.0.1:${port}`;
  if (!ours) throw new Error(`${what} answered, but port ${port} is held by ${holders(port) || "nobody"}, not by process ${child.pid} on 127.0.0.1 alone`);
}

async function stopServer(child: ChildProcess, port: number, folder: string, what: string): Promise<string[]> {
  const done = [`${what}: ${await stopTree(child)}`];
  const still = holders(port);
  if (still) throw new Error(`${what} stopped, but port ${port} is still held by ${still}`);
  done.push(`${what}: nothing listens on ${port}`);
  rmSync(folder, { recursive: true, force: true });
  if (existsSync(folder)) throw new Error(`${what}: ${folder} could not be deleted`);
  done.push(`${what}: ${folder} deleted`);
  return done;
}

// The environment of a run's CMS, whose databases and storage are in the
// folder cms/tmp/<run>.
function cmsEnv(run: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RAILS_ENV: "e2e",
    SECRET_KEY_BASE_DUMMY: "1",
    RAILS_LOG_LEVEL: process.env.RAILS_LOG_LEVEL ?? "warn",
    // Relative to cms/: the folder made for this run.
    DATABASE_URL: `sqlite3:tmp/${run}/e2e.sqlite3`,
    CACHE_DATABASE_URL: `sqlite3:tmp/${run}/e2e_cache.sqlite3`,
    QUEUE_DATABASE_URL: `sqlite3:tmp/${run}/e2e_queue.sqlite3`,
    CMS_STORAGE_ROOT: join(cmsRoot, "tmp", run, "storage"),
  };
  // What bin/rails would otherwise take from this shell.
  delete env.BINDING;
  delete env.PORT;
  return env;
}

// Puts the example site of cms/db/seeds.rb into a running CMS of the
// run's own, as `ruby bin/rails db:seed` does for a person: its pages and
// the images of its media library. For the editor's screenshots, which
// show the design's example page; the tests make the pages they need.
export function seedCms(cms: Server): string {
  const run = basename(cms.folder);
  const seed = spawnSync("ruby", ["bin/rails", "db:seed"], { cwd: cmsRoot, env: cmsEnv(run), encoding: "utf8" });
  if (seed.status !== 0) throw new Error(`the CMS could not be seeded (exit ${seed.status}):\n${seed.stdout ?? ""}${seed.stderr ?? ""}${seed.error?.message ?? ""}`);
  return seed.stdout;
}

// A CMS of the run's own, on 127.0.0.1:<port>, on an empty database.
export async function startCms(port: number): Promise<Server> {
  assertFree(port, "the CMS");
  const run = `e2e-${port}-${process.pid}`;
  const folder = join(cmsRoot, "tmp", run);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const env = cmsEnv(run);

  const setup = spawnSync("ruby", ["bin/rails", "db:create", "db:schema:load"], { cwd: cmsRoot, env, encoding: "utf8" });
  if (setup.status !== 0) {
    rmSync(folder, { recursive: true, force: true });
    throw new Error(`the CMS's databases could not be made (exit ${setup.status}):\n${setup.stdout ?? ""}${setup.stderr ?? ""}${setup.error?.message ?? ""}`);
  }

  const log = join(folder, "server.log");
  const fd = openSync(log, "w");
  const child = startTree("ruby", ["bin/rails", "server", "-p", String(port), "-P", join(folder, "server.pid")], {
    cwd: cmsRoot,
    env,
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitFor(child, "the CMS", log, async () => {
      const up = await fetch(`${url}/up`, { signal: AbortSignal.timeout(10_000) });
      await up.arrayBuffer();
      return up.status === 200 && (await emptyPageList(url));
    });
    assertOwnListener(port, child, "the CMS");
  } catch (error) {
    await stopServer(child, port, folder, "the CMS").catch(() => []);
    throw error;
  }
  return { url, port, folder, stop: () => stopServer(child, port, folder, "the CMS") };
}

// The editor's development server on 127.0.0.1:<port>, its proxy pointed
// at the CMS given; or, given a folder `vite build` wrote, `vite preview`
// serving that build the same way.
export async function startBuilder(port: number, cmsUrl: string, options: { preview?: string } = {}): Promise<Server> {
  assertFree(port, "the editor");
  const folder = mkdtempSync(join(tmpdir(), "pbc-e2e-builder-"));
  const log = join(folder, "vite.log");
  const fd = openSync(log, "w");
  const vite = join(builderRoot, "node_modules", "vite", "bin", "vite.js");
  const args = options.preview ? ["preview", "--outDir", options.preview] : ["--clearScreen", "false"];
  const child = startTree(process.execPath, [vite, ...args], {
    cwd: builderRoot,
    env: { ...process.env, BUILDER_PORT: String(port), CMS_URL: cmsUrl },
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);
  const url = `http://127.0.0.1:${port}`;
  try {
    await waitFor(child, "the editor's server", log, async () => {
      const index = await fetch(`${url}/`, { signal: AbortSignal.timeout(10_000) });
      const html = await index.text();
      return index.status === 200
        && html.includes('<meta name="application-name" content="Page Builder CMS">')
        && (await emptyPageList(url));
    });
    assertOwnListener(port, child, "the editor's server");
  } catch (error) {
    await stopServer(child, port, folder, "the editor's server").catch(() => []);
    throw error;
  }
  return { url, port, folder, stop: () => stopServer(child, port, folder, "the editor's server") };
}
