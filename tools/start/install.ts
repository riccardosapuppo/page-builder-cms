// The one routine that installs what the project needs to run: the CMS's
// gems into cms/vendor/bundle, and the editor's packages into
// builder/node_modules. npm start runs it before it starts anything;
// npm run setup runs it on its own. Nothing is installed anywhere else.
//
// Where Bundler writes the gems' launchers (rails, rake, puma...) is the
// part that needs care. RubyInstaller, installed for the whole machine,
// sets BUNDLE_SYSTEM_BINDIR inside every Ruby process to the user's
// AppData/Local/Microsoft/WindowsApps, a folder on the PATH, unless it is
// already set; a plain `bundle install` puts its launchers there even with
// the gems in vendor/bundle. So the routine
// - writes the gems' folder and the launchers' folder into cms/.bundle/config
//   (Bundler's local settings, ignored by git), and
// - sets the same two values in the environment of every Ruby process the
//   tools start,
// because the two can disagree about which wins (install.test.ts plants a
// different value in each and asks Bundler), and then
// - asks Bundler where it will install the gems and write the launchers,
//   and refuses to go on unless both answers lie inside cms/vendor/bundle.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { builderRoot, cmsRoot, lastLines, npmCommand, run, windows } from "../lib/commands.ts";

// Relative to cms/, as cms/README.md writes it.
export const GEMS_FOLDER = "vendor/bundle";

export interface Bundler {
  // The environment for every Ruby process: BUNDLE_PATH and
  // BUNDLE_SYSTEM_BINDIR set, as in cms/.bundle/config.
  env: NodeJS.ProcessEnv;
  // Where the launchers go: cms/vendor/bundle/ruby/<version>/bin.
  bindir: string;
}

// Paths as Ruby prints them (forward slashes) and as Node joins them
// (backslashes on Windows), compared as the file system does.
function normPath(p: string): string {
  const slashed = p.replace(/\\/g, "/").replace(/\/+$/, "");
  return windows ? slashed.toLowerCase() : slashed;
}

export function samePath(a: string, b: string): boolean {
  return normPath(a) === normPath(b);
}

// Whether a path lies inside a folder, or is it, compared the same way.
export function inside(path: string, folder: string): boolean {
  const child = normPath(path);
  const parent = normPath(folder);
  return child === parent || child.startsWith(`${parent}/`);
}

// One Ruby expression's printed value, in cms/, with the environment given.
export function askRuby(expression: string, env: NodeJS.ProcessEnv, cwd = cmsRoot): string {
  const ran = run("ruby", ["-rbundler", "-e", `print(${expression})`], { cwd, env });
  if (ran.error) throw new Error(`Ruby could not be started to ask ${expression}: ${ran.error.message}`);
  if (ran.status !== 0) throw new Error(`Ruby could not answer ${expression} (exit ${ran.status}):\n${lastLines(ran.stdout + ran.stderr)}`);
  return ran.stdout.trim();
}

function bundle(args: string[], env: NodeJS.ProcessEnv, app: string): void {
  const ran = run("ruby", ["-S", "bundle", ...args], { cwd: app, env });
  if (ran.status !== 0) throw new Error(`bundle ${args.join(" ")} failed (exit ${ran.status}):\n${lastLines(ran.stdout + ran.stderr)}`);
}

// Writes the two settings in both places and checks Bundler's answers. The
// application folder is cms/; the tests give one of their own, and may
// stand in for Ruby's answers (ask) to plant a wrong one.
//
// - The application's own settings file is the one written and read:
//   BUNDLE_APP_CONFIG, which can send Bundler's "local" settings to a
//   folder elsewhere, is pointed at the application's .bundle for every
//   Ruby process the tools start, so nothing outside it is rewritten.
// - The gems' folder is written first, so an older local setting that
//   sends the gems elsewhere (local settings beat the environment) is
//   replaced before Bundler is asked anything.
// - Then Bundler is asked where the gems go and where the launchers go,
//   and both answers must lie inside the application's vendor/bundle; any
//   other answer stops the routine, with nothing installed.
export function configureBundler(log: (line: string) => void, app = cmsRoot, ask: typeof askRuby = askRuby): Bundler {
  const gems = join(app, GEMS_FOLDER);
  const withPath: NodeJS.ProcessEnv = { ...process.env, BUNDLE_APP_CONFIG: join(app, ".bundle"), BUNDLE_PATH: gems };
  bundle(["config", "set", "--local", "path", GEMS_FOLDER], withPath, app);
  // Ask the tool where it will write, never deduce it.
  const bundlePath = ask("Bundler.bundle_path", withPath, app);
  if (!inside(bundlePath, gems)) {
    throw new Error(`Bundler says it would install the gems into ${bundlePath}, not inside ${gems} as .bundle/config and the environment say: nothing was installed.`);
  }
  const bindir = `${bundlePath}/bin`;
  bundle(["config", "set", "--local", "system_bindir", bindir], withPath, app);
  const env: NodeJS.ProcessEnv = { ...withPath, BUNDLE_SYSTEM_BINDIR: bindir };
  const answer = ask("Bundler.system_bindir", env, app);
  if (!samePath(answer, bindir) || !inside(answer, gems)) {
    throw new Error(`Bundler says it would write the gems' launchers into ${answer}, not into ${bindir} as .bundle/config and the environment say: nothing was installed.`);
  }
  log(`gems: in ${GEMS_FOLDER}, launchers in ${bindir} (.bundle/config and the environment; Bundler agrees)`);
  return { env, bindir };
}

// bundle check, and bundle install only when it is not satisfied. The
// install runs frozen: on a fresh machine it must install the lockfile as
// it is, never rewrite it.
export function installGems(bundler: Bundler, log: (line: string) => void): void {
  const check = run("ruby", ["-S", "bundle", "check"], { cwd: cmsRoot, env: bundler.env });
  if (check.status === 0) {
    log("gems: all installed (bundle check)");
    return;
  }
  log(`gems: not all installed, so bundle install, into cms/${GEMS_FOLDER} (this takes minutes the first time)`);
  const install = spawnSync("ruby", ["-S", "bundle", "install"], { cwd: cmsRoot, env: { ...bundler.env, BUNDLE_FROZEN: "true" }, stdio: "inherit" });
  if (install.status !== 0) throw new Error(`bundle install failed (exit ${install.status}): its output is above. Nothing was started.`);
  const again = run("ruby", ["-S", "bundle", "check"], { cwd: cmsRoot, env: bundler.env });
  if (again.status !== 0) throw new Error(`bundle install finished but bundle check is still not satisfied:\n${lastLines(again.stdout + again.stderr)}`);
  log("gems: installed (bundle check)");
}

interface LockEntry {
  version?: string;
  optional?: boolean;
  devOptional?: boolean;
  link?: boolean;
}

// The packages of a folder's package-lock.json that are missing from its
// node_modules, or there at another version. Optional packages are
// platform-specific (a native binding for another system) and are left
// out when absent.
export function missingPackages(folder: string): string[] {
  const lockFile = join(folder, "package-lock.json");
  const lock = JSON.parse(readFileSync(lockFile, "utf8")) as { packages?: Record<string, LockEntry> };
  const missing: string[] = [];
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (key === "" || entry.link) continue;
    const manifest = join(folder, key, "package.json");
    if (!existsSync(manifest)) {
      if (!entry.optional && !entry.devOptional) missing.push(`${key.replace(/^node_modules\//, "")} (absent)`);
      continue;
    }
    const version = (JSON.parse(readFileSync(manifest, "utf8")) as { version?: string }).version;
    if (entry.version && version !== entry.version) missing.push(`${key.replace(/^node_modules\//, "")} (${version}, locked ${entry.version})`);
  }
  return missing;
}

// npm ci in builder/ when its node_modules is not what its lockfile says.
export function installPackages(log: (line: string) => void): void {
  const missing = missingPackages(builderRoot);
  if (missing.length === 0) {
    log("editor packages: all installed, as builder/package-lock.json locks them");
    return;
  }
  log(`editor packages: ${missing.length} missing or at another version (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", ..." : ""}), so npm ci in builder/`);
  const [command, first] = npmCommand();
  const ci = spawnSync(command, [...first, "ci"], { cwd: builderRoot, stdio: "inherit", shell: command === "npm" && windows });
  if (ci.status !== 0) throw new Error(`npm ci in builder/ failed (exit ${ci.status}): its output is above. Nothing was started.`);
  const still = missingPackages(builderRoot);
  if (still.length) throw new Error(`npm ci finished but builder/node_modules still lacks ${still.slice(0, 5).join(", ")}`);
  log("editor packages: installed (npm ci)");
}

export function install(log: (line: string) => void): Bundler {
  const bundler = configureBundler(log);
  installGems(bundler, log);
  installPackages(log);
  return bundler;
}
