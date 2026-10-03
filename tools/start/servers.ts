// The two servers npm start runs as its own children: the CMS (Rails, in
// development, on 127.0.0.1:<cms port>) and the editor's development server
// (Vite, on 127.0.0.1:<editor port>, its proxy pointed at that CMS).
//
// - Every line either prints is passed on with the name of the server in
//   front, and the last lines are kept for the sentence that says why one
//   stopped.
// - Ready means answering for itself: the CMS's /up and its page
//   list; the editor's own index and, through its proxy, the same page list
//   the CMS gave. Then the system is asked who listens on each port, which
//   must be the child started here, on 127.0.0.1 alone: a server
//   left running by someone else answers like ours would.
// - Stopping kills each child's whole tree (taskkill /T /F on Windows, the
//   process group elsewhere: ../lib/processes.ts) and then asks the system
//   again that nothing listens on its port.
import type { ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { builderRoot, cmsRoot } from "../lib/commands.ts";
import { describeListeners, listeners, startTree, stopTree } from "../lib/processes.ts";

export interface Server {
  name: string;
  what: string;
  port: number;
  url: string;
  child: ChildProcess;
  // The last lines it printed.
  tail: string[];
}

const TAIL = 40;

function relay(server: Server, stream: NodeJS.ReadableStream | null, print: (line: string) => void): void {
  if (!stream) return;
  let rest = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    const lines = (rest + chunk).split(/\r?\n/);
    rest = lines.pop() ?? "";
    for (const line of lines) {
      server.tail.push(line);
      if (server.tail.length > TAIL) server.tail.shift();
      print(`[${server.name}] ${line}`);
    }
  });
  stream.on("end", () => {
    if (rest) print(`[${server.name}] ${rest}`);
  });
}

function launch(name: string, what: string, port: number, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, print: (line: string) => void): Server {
  // On Windows the children share this console, so a Ctrl+C typed there
  // reaches them as well, and closing the window stops them too; elsewhere
  // they run in process groups of their own, which the stop signals.
  const child = startTree(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const server: Server = { name, what, port, url: `http://127.0.0.1:${port}`, child, tail: [] };
  relay(server, child.stdout, print);
  relay(server, child.stderr, print);
  return server;
}

// The CMS in development, on the development database. bin/rails makes
// 127.0.0.1 the default and config/puma.rb refuses anything else; the
// address is still given, so a BINDING left in the shell cannot move it.
export function startCms(port: number, rubyEnv: NodeJS.ProcessEnv, print: (line: string) => void): Server {
  const env: NodeJS.ProcessEnv = { ...rubyEnv, RAILS_ENV: "development" };
  delete env.BINDING;
  delete env.PORT;
  // A pid file of npm start's own, which a stop by taskkill leaves behind
  // (Puma has no time to remove it). Windows reuses process ids, and Rails
  // refuses to start while the id in the file belongs to a live process,
  // whatever that process is; the preflight has already seen the port
  // free, so a file left here is stale.
  const pidFile = cmsPidFile(port);
  rmSync(pidFile, { force: true });
  return launch("cms", "the CMS", port, "ruby", ["bin/rails", "server", "-b", "127.0.0.1", "-p", String(port), "-P", pidFile], cmsRoot, env, print);
}

export function cmsPidFile(port: number): string {
  return join(cmsRoot, "tmp", "pids", `start-${port}.pid`);
}

export function startEditor(port: number, cmsUrl: string, print: (line: string) => void): Server {
  const vite = join(builderRoot, "node_modules", "vite", "bin", "vite.js");
  return launch("editor", "the editor", port, process.execPath, [vite, "--clearScreen", "false"], builderRoot,
    { ...process.env, BUILDER_PORT: String(port), CMS_URL: cmsUrl }, print);
}

async function getText(url: string): Promise<{ status: number; text: string }> {
  const response = await fetch(url, { headers: { accept: "application/json, text/html" }, signal: AbortSignal.timeout(10_000) });
  return { status: response.status, text: await response.text() };
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

// Polls check() until it says yes, the child exits, or the time is up.
// Returns null when ready, otherwise why not.
export async function waitReady(server: Server, withinMs: number, check: () => Promise<boolean>): Promise<string | null> {
  const until = Date.now() + withinMs;
  while (Date.now() < until) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) {
      return `${server.what} stopped before it was ready (exit ${server.child.exitCode ?? server.child.signalCode})`;
    }
    if (await check().catch(() => false)) return null;
    await pause(500);
  }
  return `${server.what} did not answer within ${Math.round(withinMs / 1000)} s`;
}

// The CMS's page list, as both it and the editor's proxy must give it.
export async function pageList(base: string): Promise<string | null> {
  const { status, text } = await getText(`${base}/api/pages`);
  if (status !== 200) return null;
  const body = JSON.parse(text) as { pages?: unknown };
  return Array.isArray(body.pages) ? text : null;
}

export async function cmsReady(cms: Server): Promise<boolean> {
  const up = await getText(`${cms.url}/up`);
  return up.status === 200 && (await pageList(cms.url)) !== null;
}

export async function editorReady(editor: Server, cms: Server): Promise<boolean> {
  const index = await getText(`${editor.url}/`);
  if (index.status !== 200 || !index.text.includes('<meta name="application-name" content="Page Builder CMS">')) return false;
  const [direct, proxied] = [await pageList(cms.url), await pageList(editor.url)];
  return direct !== null && direct === proxied;
}

// null when the port is held by this server's process on 127.0.0.1 alone.
export function ownership(server: Server): string | null {
  const found = listeners(server.port);
  const ours = found.length === 1 && found[0]!.pid === String(server.child.pid) && found[0]!.address === `127.0.0.1:${server.port}`;
  return ours ? null : `${server.what} answered, but port ${server.port} is held by ${describeListeners(found) || "nobody"}, not by process ${server.child.pid} on 127.0.0.1 alone`;
}

// Stops the tree and says what it did; adds whether the port is closed.
export async function stop(server: Server): Promise<{ lines: string[]; closed: boolean }> {
  const lines = [`${server.what}: ${await stopTree(server.child)}`];
  let still = "";
  try {
    still = describeListeners(listeners(server.port));
  } catch (error) {
    still = (error as Error).message;
  }
  lines.push(still ? `${server.what}: port ${server.port} is still held by ${still}` : `${server.what}: nothing listens on ${server.port}`);
  if (!still && server.name === "cms") rmSync(cmsPidFile(server.port), { force: true });
  return { lines, closed: !still };
}
