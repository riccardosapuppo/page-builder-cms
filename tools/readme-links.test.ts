// node --test tools/readme-links.test.ts
//
// What the README promises, held to the repository. Its first line is the
// repository's one-sentence description, word for word; the link to the
// browser demo is there under its name; every link and every picture of it,
// and of every other Markdown file the repository tracks (the design's own
// notes apart), leads to a file, a folder or a heading that exists; every
// picture the script makes is shown; every command it gives exists; and
// every decision note is linked from the README and from the notes' own
// index. The reader is shown each fault first, on small repositories
// spoiled one way at a time, and the counts of what it found are asserted,
// so that a README that lost its links would not pass by having none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { repoRoot } from "./lib/commands.ts";
import { commandsIn, problems as commandProblems } from "./lib/readme-commands.ts";
import { headingsOf, picturesIn, problems, slug, targetsIn, type Repo } from "./lib/readme-links.ts";
import { IMAGES } from "./lib/shot-images.ts";

const SENTENCE = "A page builder and CMS: Rails 8 stores, versions, caches and publishes the pages; a React and TypeScript editor builds them.";

function repoAt(root: string): Repo {
  return {
    exists: (path) => existsSync(join(root, path)),
    isDirectory: (path) => existsSync(join(root, path)) && statSync(join(root, path)).isDirectory(),
    read: (path) => readFileSync(join(root, path), "utf8"),
  };
}

// A small repository: a README beside a folder with a note and a picture.
function scratch(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pbc-readme-links-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

// The samples name Markdown files that do not exist, and are put together
// here, so that this file, read with the rest by references.test.ts, cites
// no document the repository does not hold.
const md = (text: string): string => text.replaceAll("<md>", `.m${"d"}`);

test("a link's target is read outside code, with no title, and a picture is told from a link", () => {
  const text = md([
    "See [the note](docs/a<md>#one \"a title\") and ![the picture](docs/p.png).",
    "In code, `[not a link](nowhere<md>)` and a link [with `code` in its text](docs/b<md>).",
    "```",
    "[nor this](nowhere<md>)",
    "```",
  ].join("\n"));
  assert.deepEqual(targetsIn(text), [md("docs/a<md>#one"), "docs/p.png", md("docs/b<md>")]);
  assert.deepEqual(picturesIn(text), ["docs/p.png"]);
  assert.deepEqual(targetsIn("no links here, only [brackets] and (parentheses)"), []);
});

test("a heading's address is lower case with hyphens, a repeat is numbered, and a heading in a code block is no heading", () => {
  assert.equal(slug("Adding a widget"), "adding-a-widget");
  assert.equal(slug("`npm start`, and why"), "npm-start-and-why");
  const text = ["# Top", "## Same", "text", "## Same", "```", "## Not one", "```", "### Last ###"].join("\n");
  assert.deepEqual([...headingsOf(text)], ["top", "same", "same-1", "last"]);
});

test("a link that leads nowhere, and each way it can, is named; a link that leads somewhere is not", () => {
  const root = scratch({
    "README.md": "# Top\n",
    [md("docs/note<md>")]: "# Title\n\n## The second part\n",
    "docs/picture.png": "x",
  });
  try {
    const repo = repoAt(root);
    const check = (text: string, file = "README.md"): string[] => problems(md(text), file, repo);
    assert.deepEqual(check("[a](docs/note<md>) [b](docs/note<md>#the-second-part) [c](docs/) ![d](docs/picture.png) [e](https://example.org/x#y) [f](#top)"), []);
    assert.deepEqual(check("[a](docs/gone<md>)"), [md("README.md: docs/gone<md> does not exist")]);
    assert.deepEqual(check("![a](docs/gone.png)"), ["README.md: docs/gone.png does not exist"]);
    assert.deepEqual(check("[a](docs/note<md>#the-third-part)"), [md("README.md: docs/note<md> has no heading for #the-third-part")]);
    assert.deepEqual(check("[a](docs/#top)"), ["README.md: docs/#top names a heading in a folder"]);
    assert.deepEqual(check("[a](../outside<md>)"), [md("README.md: ../outside<md> leaves the repository")]);
    assert.deepEqual(check("[a](#nothing-here)", md("docs/note<md>")), [md("docs/note<md>: docs/note<md> has no heading for #nothing-here")]);
    // From a folder, a link is read from that folder.
    assert.deepEqual(check("[a](note<md>) [b](picture.png) [c](../README.md)", md("docs/other<md>")), []);
    assert.deepEqual(check("[a](docs/note<md>)", md("docs/other<md>")), [md("docs/other<md>: docs/note<md> does not exist")]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The README, and the repository it is read in.
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const repo = repoAt(repoRoot);

test("the README's first line is the repository's description, word for word", () => {
  assert.equal(readme.split(/\r?\n/)[0], SENTENCE);
  const description = (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { description: string }).description;
  assert.equal(description, SENTENCE);
});

test("the README links the browser demo under its name, and shows each picture the script makes", () => {
  assert.match(readme, /\[Try the editor in your browser\]\(https:\/\/builder\.riccardosapuppo\.com\/\)/);
  const shown = picturesIn(readme);
  for (const spec of IMAGES.filter((one) => one.readme !== false)) assert.ok(shown.includes(`docs/images/${spec.file}`), `the README does not show docs/images/${spec.file} as a picture`);
  // The GIF comes first: under the first line, before anything else is said.
  assert.equal(readme.indexOf("docs/images/publish.gif") < readme.indexOf("\n## "), true, "the GIF of the publication is not before the first section");
});

test("every link and picture of the README leads to what it names", () => {
  const targets = targetsIn(readme);
  assert.ok(targets.length >= 25, `only ${targets.length} links and pictures found in the README`);
  assert.deepEqual(problems(readme, "README.md", repo), []);
  // Able to fail: the same README with one folder renamed, and one heading.
  assert.ok(readme.includes("(#adding-a-widget)"), "the README does not link its section on adding a widget");
  assert.ok(problems(readme.replaceAll("docs/decisions/", "docs/decisionz/"), "README.md", repo).length > 0);
  assert.ok(problems(readme.replace("(#adding-a-widget)", "(#adding-a-gadget)"), "README.md", repo).length > 0);
});

test("every Markdown file the repository tracks, the design's notes apart, has links that lead to what they name", () => {
  const files = execFileSync("git", ["ls-files", "-z", "*.md"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter((file) => file !== "" && !file.startsWith("design/"));
  assert.ok(files.length >= 20, `git listed only ${files.length} Markdown files`);
  const found = files.flatMap((file) => problems(readFileSync(join(repoRoot, file), "utf8"), file, repo));
  assert.deepEqual(found, []);
});

test("every command the README gives exists in package.json, and the reader found the commands there are", () => {
  const commands = commandsIn(readme);
  assert.ok(commands.length >= 15, `only ${commands.length} commands found in the README: ${commands.join(" | ")}`);
  assert.ok(commands.includes("npm start"), "the README does not give npm start");
  assert.deepEqual(commandProblems(commands, repoRoot), []);
});

test("every decision note is linked from the README and from the notes' own index", () => {
  const notes = readdirSync(join(repoRoot, "docs", "decisions")).filter((name) => name.endsWith(".md") && name !== "README.md");
  assert.ok(notes.length >= 10, `only ${notes.length} decision notes`);
  const index = readFileSync(join(repoRoot, "docs", "decisions", "README.md"), "utf8");
  for (const note of notes) {
    assert.ok(targetsIn(readme).includes(`docs/decisions/${note}`), `the README does not link docs/decisions/${note}`);
    assert.ok(targetsIn(index).includes(note), `docs/decisions/README.md does not link ${note}`);
  }
  // Able to fail: the index of a note that is not listed.
  assert.equal(targetsIn(index.replaceAll(notes[0]!, md("elsewhere<md>"))).includes(notes[0]!), false);
});
