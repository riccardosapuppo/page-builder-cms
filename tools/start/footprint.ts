// What npm start changes outside the repository, measured: the smoke run
// lists these places before it installs anything and again after it has
// stopped, and says what changed (rule 128: "what it does not touch" is a
// measurement, not a promise).
// - Folders where launchers land on the PATH: the user's WindowsApps on
//   Windows (where RubyInstaller points Bundler), RubyGems' bin folders,
//   npm's global one. A change there fails the run.
// - The system's services. A change there fails the run.
// - Download caches (Bundler's and npm's), which an install fills: their
//   growth is reported, not failed, and the README says where they are.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { run, runNpm, windows } from "../lib/commands.ts";
import { samePath } from "./install.ts";

export interface Place {
  label: string;
  path: string;
  kind: "launchers" | "cache";
}

export type Contents =
  | { kind: "absent" }
  | { kind: "launchers"; entries: string[] }
  | { kind: "cache"; files: number; bytes: number };

export interface Snapshot {
  places: Array<{ place: Place; contents: Contents }>;
  // null when this system has no way to list them here.
  services: string[] | null;
}

function rubyLines(script: string): string[] {
  const ran = run("ruby", ["-rbundler", "-e", script]);
  return ran.status === 0 ? ran.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
}

export function placesToWatch(): Place[] {
  const places: Place[] = [];
  if (windows && process.env.LOCALAPPDATA) {
    places.push({ label: "WindowsApps", path: join(process.env.LOCALAPPDATA, "Microsoft", "WindowsApps"), kind: "launchers" });
  }
  // Ruby's own bin, and where RubyGems puts launchers (the same folder,
  // or the user's when Ruby's is not writable).
  const [rubyBin, gemBin, userDir, bundlerCache] = rubyLines('puts RbConfig::CONFIG["bindir"], Gem.bindir, Gem.user_dir, Bundler.user_cache');
  const launchers = (label: string, path: string | undefined) => {
    if (path && !places.some((p) => samePath(p.path, path))) places.push({ label, path, kind: "launchers" });
  };
  launchers("Ruby's bin", rubyBin);
  launchers("RubyGems' bin", gemBin);
  launchers("RubyGems' user bin", userDir ? join(userDir, "bin") : undefined);
  const prefix = runNpm(["prefix", "-g"]).stdout.trim();
  launchers("npm's global bin", prefix ? (windows ? prefix : join(prefix, "bin")) : undefined);
  if (bundlerCache) places.push({ label: "Bundler's download cache", path: bundlerCache, kind: "cache" });
  const npmCache = runNpm(["config", "get", "cache"]).stdout.trim();
  if (npmCache) places.push({ label: "npm's download cache", path: npmCache, kind: "cache" });
  return places;
}

function measureCache(folder: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files += 1;
        bytes += statSync(full).size;
      }
    }
  };
  walk(folder);
  return { files, bytes };
}

function contentsOf(place: Place): Contents {
  if (!existsSync(place.path)) return { kind: "absent" };
  if (place.kind === "launchers") return { kind: "launchers", entries: readdirSync(place.path).sort() };
  return { kind: "cache", ...measureCache(place.path) };
}

// Windows: the keys under the registry's Services, where every service and
// driver is registered (sc query would do too, but labels its lines in
// Windows' language). Linux: systemd's unit files. An empty list is
// treated as not listed: every system has some.
export function listServices(): string[] | null {
  let names: string[] = [];
  if (windows) {
    const ran = run("reg", ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Services"]);
    if (ran.status === 0) names = [...ran.stdout.matchAll(/\\Services\\([^\\\r\n]+)\s*$/gm)].map((m) => m[1]!);
  } else {
    const ran = run("systemctl", ["list-unit-files", "--type=service", "--no-legend", "--no-pager"]);
    if (!ran.error && ran.status === 0) names = ran.stdout.split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0] ?? "").filter(Boolean);
  }
  return names.length ? names.sort() : null;
}

export function snapshot(places: Place[]): Snapshot {
  return { places: places.map((place) => ({ place, contents: contentsOf(place) })), services: listServices() };
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function setChange(before: string[], after: string[]): string {
  const added = after.filter((e) => !before.includes(e));
  const removed = before.filter((e) => !after.includes(e));
  return [added.length ? `added ${added.join(", ")}` : "", removed.length ? `removed ${removed.join(", ")}` : ""].filter(Boolean).join("; ");
}

// One line per place, and whether anything that must not change did.
export function compare(before: Snapshot, after: Snapshot): { lines: string[]; changed: boolean } {
  const lines: string[] = [];
  let changed = false;
  before.places.forEach(({ place, contents: was }, i) => {
    const now = after.places[i]!.contents;
    const where = `${place.label} (${place.path})`;
    if (was.kind === "absent" && now.kind === "absent") {
      lines.push(`${where}: absent before and after`);
    } else if (was.kind === "launchers" && now.kind === "launchers") {
      const change = setChange(was.entries, now.entries);
      if (change) changed = true;
      lines.push(`${where}: ${change ? `CHANGED: ${change}` : `${now.entries.length} entries before and after, the same`}`);
    } else if (was.kind === "cache" && now.kind === "cache") {
      const grew = now.files !== was.files || now.bytes !== was.bytes;
      lines.push(`${where}: ${grew ? `${was.files} files, ${mb(was.bytes)} before; ${now.files} files, ${mb(now.bytes)} after (a download cache: reported, not failed)` : `${now.files} files, ${mb(now.bytes)}, unchanged`}`);
    } else {
      if (place.kind === "launchers") changed = true;
      lines.push(`${where}: ${was.kind === "absent" ? "CREATED" : "REMOVED"}${place.kind === "cache" ? " (a download cache: reported, not failed)" : ""}`);
    }
  });
  if (before.services === null || after.services === null) {
    lines.push("services: not listed on this system");
  } else {
    const change = setChange(before.services, after.services);
    if (change) changed = true;
    lines.push(`services: ${change ? `CHANGED: ${change}` : `${after.services.length} before and after, the same`}`);
  }
  return { lines, changed };
}
