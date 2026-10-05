// node --test tools/readme-widget.test.ts
//
// The README's "Adding a widget" is tied to the repository: the commit it
// links exists in this history with the subject, the file counts and the
// new widget folder it says, that widget is in the registry, and every file
// the widgets README names for adding a widget exists (tools/lib/
// readme-widget.ts). A hash that no longer leads anywhere, a count that
// drifted, or a file that was renamed is found here. It does not skip when
// the commit is missing: a shallow clone fails it, so CI's tools job
// checks out the whole history (and ci.test.ts holds it to that).
//
// The reader is shown each way a README can stop matching, on a repository
// made in memory, each failing with its own sentence, so that a README
// that stopped matching would not pass by finding nothing; and the real
// run is shown to have read the claims and the files it checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./lib/commands.ts";
import { claimsIn, namedFiles, problems, repoAt, type Repo } from "./lib/readme-widget.ts";
import { section } from "./lib/readme-commands.ts";

const FULL = "b664d0a95307c6692de58b1a9cbcbe51fd9b35a4";
const TITLE = "Add the form widget, the whole of what a new widget takes";

const README = [
  "# A project",
  "## Adding a widget",
  `What adding a widget takes is one commit: [\`b664d0a\`, "${TITLE}"](https://github.com/someone/project/commit/${FULL}).`,
  "`git show --stat b664d0a` lists its 6 files: 3 are the schema's corpus written again, and the other 3 are",
  "these places. [`builder/src/widgets/README.md`](builder/src/widgets/README.md#adding-a-widget) names each.",
  "## Next",
].join("\n");

const WIDGETS_README = ["# Widgets", "## Adding a widget", "The schema `schema/block.json`, the folder `<type>/`, the test `e2e/<type>.spec.ts`, `ITEM_NAMES`, `npm run corpus`.", "## Other"].join("\n");

const FILES = ["schema/corpus/a.json", "schema/corpus/b.json", "schema/corpus/c.json", "builder/src/widgets/form/definition.ts", "builder/src/widgets/form/render.tsx", "cms/app/views/blocks/_form.html.erb"];

interface Fake {
  commit?: boolean;
  ancestor?: boolean;
  subject?: string;
  files?: string[];
  added?: string[];
  stat?: string;
  tree?: Record<string, string>;
}

// A repository in memory, the commit's facts as the real git prints them.
function fake(how: Fake = {}): Repo {
  const tree: Record<string, string> = {
    "builder/src/widgets/registry.ts": 'import { form } from "./form/definition.ts";',
    "builder/src/widgets/README.md": WIDGETS_README,
    "schema/block.json": "{}",
    "builder/src/widgets/form/": "",
    "builder/e2e/form.spec.ts": "",
    ...how.tree,
  };
  const files = how.files ?? FILES;
  return {
    git: (args) => {
      const [command] = args;
      if (command === "cat-file") return { status: how.commit === false ? 128 : 0, stdout: "" };
      if (command === "merge-base") return { status: how.ancestor === false ? 1 : 0, stdout: "" };
      if (command === "log") return { status: 0, stdout: `${how.subject ?? TITLE}\n` };
      if (command === "show") return { status: 0, stdout: how.stat ?? ` ${files.length} files changed, 10 insertions(+), 1 deletion(-)\n` };
      if (command === "diff-tree") return { status: 0, stdout: (args.includes("--diff-filter=A") ? (how.added ?? files) : files).join("\n") + "\n" };
      return { status: 1, stdout: "" };
    },
    exists: (path) => path in tree || Object.keys(tree).some((name) => name.startsWith(`${path}/`)),
    read: (path) => tree[path] ?? "",
  };
}

const found = (repo: Repo, readme = README, widgets = WIDGETS_README): string[] => problems(readme, widgets, repo);

test("a README that matches its repository has no problem", () => {
  assert.deepEqual(found(fake()), []);
});

test("the claims and the named files are read out of the text, and a text without them is refused", () => {
  assert.deepEqual(claimsIn(section(README, "Adding a widget")!), { short: "b664d0a", title: TITLE, full: FULL, command: "b664d0a", total: 6, corpus: 3, others: 3 });
  assert.equal(claimsIn("no link here"), null);
  assert.deepEqual(namedFiles(section(WIDGETS_README, "Adding a widget")!, "form"), ["schema/block.json", "form/", "e2e/form.spec.ts"]);
  assert.match(found(fake(), "# A project\nnothing\n")[0] ?? "", /no section "Adding a widget"/);
  assert.match(found(fake(), "## Adding a widget\nno link\n")[0] ?? "", /links no commit/);
});

test("each way the README can stop matching its repository is named", () => {
  // The hash: a text that is not the start of the address, a command for
  // another commit, a commit the checkout has not got (a shallow clone),
  // one that is not in the history.
  assert.match(found(fake(), README.replace("`b664d0a`,", "`b664d0b`,"))[0] ?? "", /is not the start of the hash in its address/);
  assert.match(found(fake(), README.replace("git show --stat b664d0a", "git show --stat c664d0a"))[0] ?? "", /is not the start of the linked hash/);
  assert.match(found(fake({ commit: false }))[0] ?? "", /not in this repository: a shallow clone has not got it/);
  assert.match(found(fake({ ancestor: false }))[0] ?? "", /is not in the history of HEAD/);
  assert.match(found(fake({ subject: "Another subject" }))[0] ?? "", /subject is "Another subject", not "Add the form widget/);

  // The counts.
  assert.match(found(fake(), README.replace("its 6 files", "its 276 files"))[0] ?? "", /says the commit lists 276 files; it lists 6/);
  assert.match(found(fake(), README.replace("3 are the schema's corpus", "225 are the schema's corpus"))[0] ?? "", /says 225 of them are the schema's corpus; 3 are/);
  assert.match(found(fake(), README.replace("and the other 3 are", "and the other 51 are"))[0] ?? "", /says 51 are other places; 3 are/);
  assert.match(found(fake({ stat: " 7 files changed, 10 insertions(+)\n" }))[0] ?? "", /git show --stat says 7 files changed, and the commit's files are 6/);
  assert.match(found(fake(), README.replace(/lists its 6 files: 3 are the schema's corpus written again, and the other 3 are/, "lists its files"))[0] ?? "", /gives no counts/);

  // The widget.
  assert.match(found(fake({ added: ["builder/src/widgets/form/render.tsx"] }))[0] ?? "", /adds 0 widget definitions \(none\)/);
  assert.match(found(fake({ added: [...FILES, "builder/src/widgets/map/definition.ts"] }))[0] ?? "", /adds 2 widget definitions \(form, map\)/);
  assert.match(found(fake({ tree: { "builder/src/widgets/registry.ts": "" } }))[0] ?? "", /registry\.ts does not list the form widget/);

  // The files the widgets README names, and the link to it.
  assert.match(found(fake(), README, WIDGETS_README.replace("schema/block.json", "schema/gone.json"))[0] ?? "", /names schema\/gone\.json, which does not exist/);
  assert.match(found(fake(), README, WIDGETS_README.replace("e2e/<type>.spec.ts", "e2e/<type>.other.ts"))[0] ?? "", /names e2e\/form\.other\.ts, which does not exist/);
  assert.match(found(fake(), README.replace("#adding-a-widget", "#elsewhere"))[0] ?? "", /has no heading for #elsewhere/);
  assert.match(found(fake(), README.replace("builder/src/widgets/README.md#adding-a-widget", "elsewhere.md"))[0] ?? "", /does not link builder\/src\/widgets\/README\.md#<heading>/);
});

test("the README's section on adding a widget matches this repository, and the run read what it checks", () => {
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  const widgets = readFileSync(join(repoRoot, "builder", "src", "widgets", "README.md"), "utf8");
  const issues = problems(readme, widgets, repoAt(repoRoot));
  assert.deepEqual(issues, []);

  // Not by finding nothing: the claims are there, and many files were named.
  const claims = claimsIn(section(readme, "Adding a widget")!);
  assert.ok(claims && claims.total !== null && claims.total > 0 && claims.corpus !== null && claims.others !== null, "the section's claims were read");
  assert.equal(claims.total, claims.corpus! + claims.others!);
  const named = namedFiles(section(widgets, "Adding a widget")!, "form");
  assert.ok(named.length >= 25, `only ${named.length} files were named: ${named.join(", ")}`);
  for (const name of ["src/document/commands.ts", "e2e/form.spec.ts", "e2e/helpers/ax.ts", "e2e/widgets.spec.ts", "schema/block-document.schema.json", "cms/app/views/blocks/", "form/"]) assert.ok(named.includes(name), `${name} is among the files checked`);
});
