// The first look at the API in cms/README.md ("A first look at the API"),
// run as it is written: its POSIX block through a POSIX shell with the real
// curl, its Windows PowerShell block through powershell.exe, against the
// CMS this run started and seeded with the example site, as `npm start`
// prepares a database. Only two things in a block are changed: the CMS's
// address (the README's 3900 becomes the run's port) and the address the
// page is made at, so each run makes a page of its own.
//
// What is held: each step is answered with the status it should have (the
// POSIX block records them: a curl of the test's stands in front of the
// real one and notes the status of every call), the page the first step
// made is listed, and the page the third step published is that page and
// not another one. The README's own example once published page 1, which
// on a seeded database is the example home page; the test makes the same
// mistake on purpose (a literal id of another page) and must see it fail.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { beforeAll, describe, expect, inject, test } from "vitest";
import { repoRoot } from "../build/paths.ts";
import { seedCms } from "../e2e/harness/servers.ts";

const cms = inject("cmsUrl");
const folder = inject("cmsFolder");
const readme = readFileSync(join(repoRoot, "cms", "README.md"), "utf8");

const README_ADDRESS = "http://127.0.0.1:3900";
const README_SLUG = '"slug":"winter"';
const run = Date.now().toString(36);

// ------------------------------------------------------------ the README

// The two blocks that follow the paragraph that opens the first look.
function firstLook(text: string): { sh: string; powershell: string } {
  const start = text.indexOf("A first look at the API");
  if (start < 0) throw new Error('cms/README.md has no paragraph that opens "A first look at the API"');
  const after = text.slice(start);
  const next = after.search(/^## /m);
  const section = next < 0 ? after : after.slice(0, next);
  const blocks = new Map<string, string>();
  for (const found of section.matchAll(/^```(\w+)\n([\s\S]*?)^```$/gm)) blocks.set(found[1]!, found[2]!);
  const sh = blocks.get("sh");
  const powershell = blocks.get("powershell");
  if (sh === undefined || powershell === undefined) throw new Error('the first look has to hold a block tagged sh and one tagged powershell');
  return { sh, powershell };
}

// A block aimed at this run's CMS, its page made at `slug`.
function aimed(block: string, slug: string): string {
  expect(block.split(README_ADDRESS).length, "the README's address is in every step").toBeGreaterThan(4);
  expect(block.split(README_SLUG).length - 1, "the README makes one page, at one address").toBe(1);
  return block.replaceAll(README_ADDRESS, cms).replace(README_SLUG, `"slug":"${slug}"`);
}

// ------------------------------------------------------- the CMS's state

interface Listed {
  id: number;
  slug: string;
  published: { slug: string; versionNumber: number } | null;
}

async function pagesOfTheCms(): Promise<Listed[]> {
  const response = await fetch(`${cms}/api/pages`, { headers: { accept: "application/json" } });
  expect(response.status).toBe(200);
  return ((await response.json()) as { pages: Listed[] }).pages;
}

// The page made at `slug` is there, and it is the one that went live, under
// its own address.
async function expectPublished(slug: string): Promise<Listed> {
  const made = (await pagesOfTheCms()).filter((page) => page.slug === slug);
  expect(made.map((page) => page.slug), `the page made at ${slug}`).toEqual([slug]);
  expect(made[0]!.published?.slug, `the page made at ${slug} is the one published`).toBe(slug);
  return made[0]!;
}

// ------------------------------------------------------------- a POSIX shell

// Git for Windows' own shell on Windows, where `bash` on the PATH may be
// the launcher of another system; `sh` anywhere else.
function posix(): { sh: string; path: string } {
  if (process.platform !== "win32") return { sh: "sh", path: process.env.PATH ?? "" };
  const found = spawnSync("where", ["git"], { encoding: "utf8" }).stdout.split(/\r?\n/).filter(Boolean);
  for (const git of found) {
    let at = dirname(git);
    for (let up = 0; up < 4; up += 1, at = dirname(at)) {
      const sh = join(at, "usr", "bin", "sh.exe");
      if (existsSync(sh)) return { sh, path: [join(at, "usr", "bin"), join(at, "mingw64", "bin"), process.env.PATH ?? ""].join(delimiter) };
    }
  }
  throw new Error("no POSIX shell: Git for Windows' usr/bin/sh.exe was not found above git on the PATH");
}

interface Call {
  args: string[];
  status: number;
  body: string;
}

// The standing-in curl: runs the real one, keeps the arguments, the headers
// (for the status) and the body of each call in the folder the run names,
// and prints the body as curl would.
const SHIM = `#!/bin/sh
n=1
while [ -e "$CURL_NOTES/args-$n" ]; do n=$((n + 1)); done
printf '%s\\n' "$@" > "$CURL_NOTES/args-$n"
"$REAL_CURL" -D "$CURL_NOTES/headers-$n" "$@" > "$CURL_NOTES/body-$n"
code=$?
cat "$CURL_NOTES/body-$n"
exit $code
`;

function runPosix(block: string): { calls: Call[]; output: string } {
  const shell = posix();
  const work = mkdtempSync(join(tmpdir(), "pbc-readme-curl-"));
  try {
    const real = spawnSync(shell.sh, ["-c", "command -v curl"], { encoding: "utf8", env: { ...process.env, PATH: shell.path } });
    const realCurl = real.stdout.trim();
    if (real.status !== 0 || realCurl === "") throw new Error(`no curl for the POSIX shell: ${real.stderr}`);
    const bin = join(work, "bin");
    const notes = join(work, "notes");
    mkdirSync(bin);
    mkdirSync(notes);
    writeFileSync(join(bin, "curl"), SHIM);
    chmodSync(join(bin, "curl"), 0o755);
    writeFileSync(join(work, "steps.sh"), block);
    const done = spawnSync(shell.sh, ["steps.sh"], {
      cwd: work,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, PATH: [bin, shell.path].join(delimiter), REAL_CURL: realCurl, CURL_NOTES: notes.replaceAll("\\", "/") },
    });
    if (done.status !== 0) throw new Error(`the POSIX block exited ${done.status}:\n${done.stdout}${done.stderr}`);
    const calls: Call[] = [];
    for (let n = 1; existsSync(join(notes, `args-${n}`)); n += 1) {
      const headers = readFileSync(join(notes, `headers-${n}`), "utf8");
      calls.push({
        args: readFileSync(join(notes, `args-${n}`), "utf8").split("\n").filter(Boolean),
        status: Number(/^HTTP\/\S+ (\d{3})/.exec(headers)?.[1]),
        body: readFileSync(join(notes, `body-${n}`), "utf8"),
      });
    }
    expect(readdirSync(notes).length, "every call left its notes").toBe(calls.length * 3);
    return { calls, output: done.stdout };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// What the four steps must have been answered, and the third one's page.
function expectFourSteps(calls: Call[], slug: string): void {
  expect(calls.map((call) => call.status), "the status of each step").toEqual([201, 200, 200, 200]);
  const made = JSON.parse(calls[0]!.body) as { page: { id: number; slug: string } };
  expect(made.page.slug).toBe(slug);
  expect((JSON.parse(calls[1]!.body) as { pages: Array<{ id: number }> }).pages.map((page) => page.id), "the list holds the page just made").toContain(made.page.id);
  expect(calls[2]!.args, "the third step publishes the page the first one made").toContain(`${cms}/api/pages/${made.page.id}/publish`);
  expect((JSON.parse(calls[2]!.body) as { published: { slug: string } }).published.slug).toBe(slug);
  expect(Object.keys(JSON.parse(calls[3]!.body) as object), "the site style").toEqual(expect.arrayContaining(["palette", "typeScale", "choices"]));
}

// ------------------------------------------------------------ PowerShell

function runPowerShell(block: string): { output: string } {
  const script = `$ErrorActionPreference = 'Stop'\n${block}`;
  const done = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { encoding: "utf8", timeout: 120_000 });
  if (done.status !== 0) throw new Error(`the PowerShell block exited ${done.status}:\n${done.stdout}${done.stderr}`);
  return { output: done.stdout };
}

// ---------------------------------------------------------------- the tests

beforeAll(() => {
  // The database `npm start` prepares: the example site's three pages, the
  // first of them the home page.
  expect(seedCms({ folder })).toContain("Seeding the example site, Slack Water:");
}, 120_000);

describe("cms/README.md's first look at the API", () => {
  const { sh, powershell } = firstLook(readme);

  test("the POSIX block, run as written through a POSIX shell with curl, gets each step its status and publishes the page it made", async () => {
    const slug = `winter-${run}-sh`;
    const { calls } = runPosix(aimed(sh, slug));
    expectFourSteps(calls, slug);
    await expectPublished(slug);
  }, 90_000);

  test.skipIf(process.platform !== "win32")("the PowerShell block, run as written in Windows PowerShell, publishes the page it made", async () => {
    const slug = `winter-${run}-ps`;
    const { output } = runPowerShell(aimed(powershell, slug));
    expect(output).toContain(slug);
    await expectPublished(slug);
  }, 150_000);

  test("a block that publishes page 1 as the README once did, whatever page 1 is, is caught: the page made is not the one published", async () => {
    // The seeded database's first page is the example home page.
    const first = (await pagesOfTheCms()).find((page) => page.slug === "home");
    expect(first, "the seed's home page").toBeDefined();
    const slug = `winter-${run}-literal`;
    const wrong = aimed(sh, slug).replace(/^id=.*$/m, `id=${first!.id}`);
    expect(wrong, "the plant replaced the line that reads the id").not.toBe(aimed(sh, slug));
    const { calls } = runPosix(wrong);
    expect(calls[2]!.status, "the publish itself goes through").toBe(200);
    expect(() => expectFourSteps(calls, slug)).toThrow();
    await expect(expectPublished(slug)).rejects.toThrow();
  }, 90_000);

  test("a step that is answered badly is caught: an address the CMS does not have gets its 404", () => {
    const slug = `winter-${run}-wrong`;
    const wrong = aimed(sh, slug).replace("/api/site-style", "/api/site-styles");
    const { calls } = runPosix(wrong);
    expect(calls.at(-1)!.status).toBe(404);
    expect(() => expectFourSteps(calls, slug)).toThrow();
  }, 90_000);

  test("the first look is found only where the README holds its two blocks", () => {
    expect(() => firstLook("# Nothing here\n")).toThrow(/has no paragraph/);
    expect(() => firstLook("A first look at the API:\n\n```sh\ncurl\n```\n")).toThrow(/powershell/);
  });
});
