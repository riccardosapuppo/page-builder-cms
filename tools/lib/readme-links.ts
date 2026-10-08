// The links and pictures of a Markdown file, and whether each one leads
// somewhere in this repository: the file or folder it names, and the
// heading it names inside a Markdown file. A README whose link points at a
// file that was renamed, or at a heading that was reworded, is found here,
// before a reader follows it. Addresses on other sites are not followed:
// they are not in the repository's hands, and a test that asked the network
// would pass or fail by the day.
import { posix } from "node:path";

export interface Repo {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  read(path: string): string;
}

// The text with its fenced blocks and its `code spans` blanked out, line by
// line and character by character, so that what is written as an example
// is not read as a link, and positions stay where they were.
function withoutCode(markdown: string): string {
  let fenced = false;
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return "";
      }
      return fenced ? "" : line.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
    })
    .join("\n");
}

// Every target of a `[text](target)` link or `![alt](target)` picture
// outside code, without an optional title after it.
export function targetsIn(markdown: string): string[] {
  const found: string[] = [];
  for (const match of withoutCode(markdown).matchAll(/!?\[(?:[^\]\\]|\\.)*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) found.push(match[1]!);
  return found;
}

// The pictures alone: the targets of `![alt](target)`.
export function picturesIn(markdown: string): string[] {
  const found: string[] = [];
  for (const match of withoutCode(markdown).matchAll(/!\[(?:[^\]\\]|\\.)*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) found.push(match[1]!);
  return found;
}

// A heading as an address names it: lower case, only letters, digits,
// hyphens and spaces kept, each space a hyphen.
export function slug(heading: string): string {
  return heading.trim().toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
}

// The addresses the headings of a Markdown text give, a repeated heading
// numbered as the host numbers it (-1, -2).
export function headingsOf(markdown: string): Set<string> {
  const seen = new Map<string, number>();
  const found = new Set<string>();
  let fenced = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (!heading) continue;
    const base = slug(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    found.add(count === 0 ? base : `${base}-${count}`);
  }
  return found;
}

// What is wrong with the links of `markdown`, a file of the repository at
// `file` (a path from the root, with "/"): one sentence each, nothing when
// every link and picture leads to what it names.
export function problems(markdown: string, file: string, repo: Repo): string[] {
  const out: string[] = [];
  const here = posix.dirname(file);
  for (const target of targetsIn(markdown)) {
    // https:, mailto: and the rest are other sites' business.
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const hash = target.indexOf("#");
    const path = hash === -1 ? target : target.slice(0, hash);
    const fragment = hash === -1 ? "" : target.slice(hash + 1);
    const resolved = path === "" ? file : posix.normalize(posix.join(here, path)).replace(/\/$/, "");
    if (resolved.startsWith("..")) {
      out.push(`${file}: ${target} leaves the repository`);
      continue;
    }
    if (!repo.exists(resolved)) {
      out.push(`${file}: ${target} does not exist`);
      continue;
    }
    if (fragment === "") continue;
    if (repo.isDirectory(resolved)) out.push(`${file}: ${target} names a heading in a folder`);
    else if (resolved.endsWith(".md") && !headingsOf(repo.read(resolved)).has(fragment)) out.push(`${file}: ${resolved} has no heading for #${fragment}`);
  }
  return out;
}
