# tools/

The repository's own tools: TypeScript that Node 24 runs as it is (`npm run
typecheck`, from the root, checks them), and the tests of their own,
`npm run test:tools`. They start the project, check it, measure it and
photograph it.

| Command, from the root | What it is | Where |
| --- | --- | --- |
| `npm start`, `npm run setup` | Starts the CMS and the editor together, or only prepares them. | `start.cjs`, [`start/`](start/) |
| `npm run check` | Runs every check of the repository, one after another. | `check.ts`, [`check/`](check/) |
| `npm run check:production` | The CMS booted in production on 127.0.0.1, over HTTP and in a browser. | `check-production.ts`, `lib/visitor-checks.ts` |
| `npm run measure:server`, `measure:builder`, `measure:bundle` | The measurements of the README's [Measurements](../README.md#measurements). | `measure.cjs`, `measure-*.ts`, `lib/measure*.ts` |
| `npm run shots` | Makes the pictures of the README, from a CMS and an editor started for the run ([docs/images/README.md](../docs/images/README.md)). | `shots.ts`, `lib/gif.ts`, `lib/shot-images.ts` |
| `npm run lint:openapi` | Lints the API's description with Redocly. | `lint-openapi.ts` |
| `npm run seed:images` | Renders the example site's pictures from the design's SVGs. | `seed-images.ts` |
| `npm run contract:large` | Writes the render contract's 500-block fixture. | `gen-contract-500.ts` |
| `npm run shots:site`, `npm run check:type-scales` | Photographs a running site; measures its headings under each type-scale choice. | `site-shots.ts`, `type-scales.ts` |
| `probes/` | The probe of a risky assumption, run before the code that relies on it. | `probes/` |

## npm start

`start.cjs` is JavaScript of the oldest kind, which any Node can read: it
checks the running version against `engines` in `package.json` and, when
it is too old, says so in one sentence and stops before anything is
installed or started. Only then does it load the TypeScript of `start/`.

What it does, in order:

1. **Checks the machine** and says, one sentence per problem, everything
   that is missing: Ruby, Bundler, the Node version, a port held by another
   program, named with its process.
2. **Installs** the gems and the editor's packages, when they are not
   there yet, by one routine (below).
3. **Prepares the development databases**, `db:prepare`: the pages, the
   cache and the queue, and the example site loaded into a new one.
4. **Starts the CMS** on http://127.0.0.1:3900, with Solid Queue inside it
   so that a publish set for a time happens while it runs, **and the
   editor** on http://127.0.0.1:4900, every line they print marked `[cms]`
   or `[editor]`.
5. **Waits until each answers for itself**, and opens the editor in the
   browser.

Ctrl+C stops both, and so does either one stopping by itself.

- The ports are the project's own, so they do not collide with the 3000 and
  5173 most projects start on; `CMS_PORT` and `BUILDER_PORT` move them.
  Both servers listen on 127.0.0.1 only: the API has no authentication
  ([the decision](../docs/decisions/no-authentication-one-address.md)).
- The browser stays closed with `npm start -- --no-open`, with `NO_OPEN=1`,
  in CI, and when the output is not a terminal.
- `npm run setup` installs and prepares the database, and starts nothing.
- `npm start -- --smoke` starts, checks that both answer, stops, and says
  what changed outside the repository. It reads, among its seven looks,
  the editor's entry module as Vite compiles it: a module with a syntax
  error answers 500 there.
- `npm run check:start-interrupt` stops a running start once with a real
  Ctrl+C and once by killing the editor's server, and checks that nothing
  is left running either time.
- `npm run check:setup-tree` runs the setup on a development database of
  its own, one migration behind, so that it migrates and dumps the schema,
  and checks that the schema it wrote and git status are what they were:
  Ruby on Windows wrote the dump with CRLF line endings, and
  `cms/db/schema.rb` came back modified with nothing else changed
  (`cms/lib/tasks/schema_dump.rake` turns the dump back to LF). On 4
  October 2026, on Windows, it printed `pass 1` after 29 s; without the
  rake file, it failed on 149 lines ending in CRLF and `AM db/schema.rb`.

On 8 October 2026, on Windows, `npm start -- --smoke` printed `smoke: 7
checks passed`, and `npm run check:start-interrupt` printed `RESULT: 11
checks passed`.

### What it does not touch

This is measured, not promised. `npm start -- --smoke` lists, before it
installs anything and after it has stopped, the folders where a launcher
would land on the PATH (the user's WindowsApps on Windows, Ruby's own
`bin`, RubyGems' user `bin`, npm's global folder) and the system's
registered services, and fails if any of them changed. On 8 October 2026,
on this machine, with everything already installed, it found WindowsApps
with 27 entries before and after, the same ones; Ruby's own `bin` with 32,
the same; RubyGems' `bin` absent before and after; npm's global folder with
13 entries, the same; Bundler's download cache, 688 files and 25.6 MB, and
npm's, 1,499 files and 216.5 MB, unchanged; and the 737 services and
drivers registered in Windows' registry, the same before and after. CI's
smoke runs make the same comparison around a first install, on Linux and on
Windows.

### The install routine

The gems' launchers (`rails`, `rake`, `puma` and twenty more, each with
its `.bat` on Windows) go into `cms/vendor/bundle/ruby/<version>/bin`.
RubyInstaller, installed for all users, points Bundler at the user's
`AppData/Local/Microsoft/WindowsApps`, a folder on the PATH, unless told
otherwise. So the install routine writes the gems' folder, then the
launchers' folder inside `cms/vendor/bundle`, both into `cms/.bundle/config`
and into the environment of every Ruby process it starts (with
`BUNDLE_APP_CONFIG` pointed at `cms/.bundle`, so no settings file elsewhere
is read or rewritten), then asks Bundler where it will install the gems and
write the launchers, and stops unless both answers lie inside
`cms/vendor/bundle`. With a different folder in each place, Bundler 2.6.9
takes `.bundle/config`; [install.test.ts](start/install.test.ts) plants the
two and asks it, and also plants an older local setting and a
`BUNDLE_APP_CONFIG` that send the gems elsewhere, and answers from outside
that make the routine stop.

## npm run check

`npm run check` runs every check of the repository, one after another, and
reads each one's counts from what its reporter wrote: Vitest's and
Playwright's JSON, minitest's summary, the TAP of Node's test runner, the
summary lines of the other tools. A suite fails when anything in it failed,
when its count is zero, or when it is under the floor written for it in
[check/suites.ts](check/suites.ts). A suite that cannot run here (no Ruby,
no Chromium, a port taken, bundler-audit without its advisory database) is
listed at the end as not run, and the run exits 2, never 0. The run also
fails if `cms/public/assets` is left over from a production build, which
development would serve in place of the stylesheets being edited.
`npm run check -- --list` names the suites; `--only` and `--skip` take
those names.

The ports each suite starts on have their own variables (`CMS_PORT`,
`BUILDER_PORT`, `PRODUCTION_CHECK_PORT`, `E2E_CMS_PORT`, `E2E_BUILDER_PORT`,
`E2E_BROWSER_PORT`, `E2E_DEMO_PORT`), so a run can sit beside another that
holds the defaults. The README's [Checking it](../README.md#checking-it)
has the counts of a run.

A floor left below the count of a run lets a deleted test pass unnoticed: a
tools test skipped on purpose failed the check with 74, fewer than the 75
it had then. A floor that is above the count fails too, which is why a
file deleted on purpose lowers its floor in the same commit.

The Vitest projects are made to hold on a busy machine without hiding a
failure. Each runs alone, with at most half the processors as workers (up
to four; `CHECK_MAX_WORKERS` sets it) and 30 seconds per test instead of
Vitest's 5: a test that hangs still fails. When the only trouble in a run
is workers that could not start within Vitest's fixed 60 seconds, the
project runs again with one worker; a test that failed is never run again,
and workers that cannot start even one at a time make the suite "not run",
not passed. On 2 October 2026, on the editor's unit project (56 files, 428
tests):
- with the first two workers planted to take 70 seconds to start, Vitest
  alone exited 1 on two "Failed to start forks worker" errors, and its
  summary counted 54 files and 402 tests, the two files simply missing;
  `npm run check` saw the errors, ran the project again with one worker,
  and passed on all 56 files and 428 tests;
- with the same plant and `DOC_PROPERTY_RUNS=0`, which fails eight tests,
  it reported the eight failures and did not run the project again;
- held to one processor beside two busy loops, Vitest's own settings failed
  a canvas test that took 14.7 seconds against its 5, and the check's
  passed all 428 tests (each run about 600 seconds).

## npm run test:tools

The tools' own tests, Node's runner over `tools/**/*.test.ts`. Among them:
how `npm start` and the check read, from netstat, ss or lsof, who listens
on a port, each on a sample of that system's output that holds lines to
skip next to the ones to find; npm start's parts; the check's readers; the
CI file; and what ties the README to the repository: that no tracked file
cites a document the repository does not hold, or a rule by its number
([references.test.ts](references.test.ts)); that the README's links,
pictures and commands lead to what they name, its first line is the
repository's description and every decision note is linked
([readme-links.test.ts](readme-links.test.ts)); that its Measurements give
a command and a date for each number
([readme-measurements.test.ts](readme-measurements.test.ts)); and that its
section on adding a widget names a commit, with the file counts, that is in
this history ([readme-widget.test.ts](readme-widget.test.ts)). Each of
these was shown failing on a planted fault.

## The CI file

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs the same
checks on Linux, and on Windows where the code takes another path there,
each job with a time limit:

- Rails tests on Ruby 3.3 and 3.4;
- the schema's two validators and its lint, the contract fixture and the
  API description;
- RuboCop, Brakeman and bundler-audit;
- the CMS in production, over HTTP and in a browser;
- the editor's checks on Node 22.13.0 (the lowest it declares) and 24;
- the render contract's two halves;
- the editor against a CMS of its own in a browser, on the browser's own
  storage, its accessibility tests, and how its page is served;
- the repository's tools on Linux and Windows;
- `npm start`'s refusal of Node 22.13.0 and 18 before any install;
- `npm start` in smoke mode on Linux and Windows, from nothing, with its
  real Ctrl+C and `check:setup-tree`;
- the browser demo, built for GitHub Pages and tried in Chromium, and its
  deploy to Pages, which runs only from main and only while the repository
  is public.

It first ran on 2 October 2026, on the checks of stage 1, and every job
passed on Linux, among them the Rails tests in forked workers, whose
OpenAPI counts the main process added up, and the production check, which
found who listened and stopped the server's process group. On 4 October it
ran on stages 2 to 3 bis: 12 of its 15 jobs passed. Three failed on two
faults only Linux has: the tools' tests read a process's name from the
kernel, which for Node 24 is its main thread's, and a browser test compared
two screenshots byte for byte, which Linux's font smoothing told apart. On
5 October, on stage 4, two jobs failed on one fault only Linux has: Solid
Queue forks its supervisor and its workers inside Puma, they share Puma's
listening socket, and the checks that ask who holds the port took a child
of the server for a stranger. They now accept any process of the group the
server leads, on its one address. The run of commit `1168e7a`, the last of
stage 5, passed all 15 jobs, the browser job in 17 minutes 52 seconds.
The jobs added since, the browser demo's and its deploy, have not run on
GitHub yet. Nothing has run on macOS.
