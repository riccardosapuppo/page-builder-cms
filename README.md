A page builder and CMS: Rails 8 stores, versions, caches and publishes the pages; a React and TypeScript editor builds them.

**Work in progress.** The project is being built in stages, and this README
describes only what is in the repository today. It will grow with the code.

A personal project of the author's, not work for a client.

## Before you start

There are two ways to use this repository, and they cost different
amounts.

**To run it**, with `npm start`, the machine needs:
- **Ruby 3.3 or later**, with Bundler, which ships with it. On Windows
  that is RubyInstaller with its DevKit, the MSYS2 toolchain that
  compiles the native parts of some gems: on the machine this was written
  on (Windows 10, Ruby 3.4.11 installed for all users) RubyInstaller's
  folder takes 1174 MB, 1030 MB of them MSYS2.
- **Node 24.** An older Node gets one sentence saying so, and nothing is
  installed or started: the repository's tools are TypeScript that Node
  runs as it is, which it does from version 24.
- **Ports 3900 and 4900** free on 127.0.0.1.

`npm start` installs the rest inside the repository:
- the CMS's gems into `cms/vendor/bundle`: 127 MB, RuboCop, Brakeman and
  the test gems included, which Bundler installs unless told not to;
- the editor's packages into `builder/node_modules`: 166 MB.

With everything installed and the database prepared, `npm start` was
ready, both servers answering, in 14.1, 14.2 and 14.4 seconds: three
runs of `npm start -- --smoke` on 3 October 2026, on a Windows 10
virtual machine with 8 logical processors and 12 GB of memory, its
processors 0 to 8% busy before and after each run.

A first install and first start, measured the same day on the same
machine, its processors 0 to 2% busy before and 1 to 5% after: a fresh
copy of the repository, with download caches of its own, empty
(`npm_config_cache`, `BUNDLE_USER_CACHE` and `GEM_SPEC_CACHE` pointed at
empty folders), and `npm start -- --smoke`, with Ruby 3.4.11 and Node
24.19.0 already there.
- **Downloaded:** 84.3 MB. The 99 gems' archives, 20.5 MB (Bundler keeps
  them in `cms/vendor/bundle/ruby/3.4.0/cache`); Bundler's index of the
  gems, 25.5 MB; the editor's 160 packages, 38.3 MB in npm's cache. The
  network adapters counted 88.6 MB received over the whole run.
- **Ready**, both servers answering, after 147.2 seconds: 115 for `bundle
  install`, which compiles the native extensions of 15 gems, 8 for `npm
  ci`, 14 for the database and its example site, 6 for the two servers
  to answer.

Megabytes here are bytes (`du -sb`) divided by 1,048,576; the installed
sizes above, by `du -sm`, are the disk space taken. CI's smoke runs
(below) install everything from nothing on Linux and Windows too.

**To develop** (the tests, `npm run check`), add:
- the root's tools, `npm ci` at the root: 56 MB (TypeScript, Redocly,
  Playwright's library, and semver and yaml for the tools' own tests);
- the schema's tools, `npm ci --prefix schema/tools`: 29 MB;
- Playwright's Chromium, for the browser tests and the production check:
  `npx playwright install chromium`, from `builder/`, puts build 1234 in
  the user's Playwright cache (`AppData/Local/ms-playwright` on Windows,
  `~/.cache/ms-playwright` on Linux): 703 MB here, 428 MB of them the full
  Chromium and 272 MB the headless shell;
- ports 3901 and 4901 for the test runs, and 3902 for the production
  check.

Sizes by `du -sm`, on 2 October 2026.

**What it does not touch** is measured, not promised. `npm start --
--smoke` lists, before it installs anything and after it has stopped,
the folders where a launcher would land on the PATH (the user's
WindowsApps on Windows, Ruby's own `bin`, RubyGems' user `bin`, npm's
global folder) and the system's registered services, and fails if any of
them changed. On 2 October 2026, on this machine, with everything already
installed, it found WindowsApps with 27 entries before and after, the
same ones; Ruby's own `bin` with 32, the same; RubyGems' `bin` and npm's
global folder absent before and after; and the 717 services and drivers
registered in Windows' registry, the same before and after. CI's smoke
runs make the same comparison around a first install.

The gems' launchers (`rails`, `rake`, `puma` and twenty more, each with
its `.bat` on Windows) go into `cms/vendor/bundle/ruby/<version>/bin`.
RubyInstaller, installed for all users, points Bundler at the user's
`AppData/Local/Microsoft/WindowsApps`, a folder on the PATH, unless told
otherwise. So npm start's install routine writes the gems' folder, then
the launchers' folder inside `cms/vendor/bundle`, both into
`cms/.bundle/config` and into the environment of every Ruby process it
starts (with `BUNDLE_APP_CONFIG` pointed at `cms/.bundle`, so no settings
file elsewhere is read or rewritten), then asks Bundler where it will
install the gems and write the launchers, and stops unless both answers
lie inside `cms/vendor/bundle`. With a different folder in each place,
Bundler 2.6.9 takes `.bundle/config`
([tools/start/install.test.ts](tools/start/install.test.ts) plants the
two and asks it; it also plants an older local setting and a
`BUNDLE_APP_CONFIG` that send the gems elsewhere, and answers from
outside that make the routine stop).

A first install fills two download caches outside the repository, as any
install does: Bundler's (`~/.bundle/cache`, 25.5 MB on this machine after
these gems were installed once) and npm's (the folder `npm config get
cache` names). npm start installs nothing globally and registers no
service.

**Putting the machine back.** Stop npm start with Ctrl+C: it stops the
CMS and the editor and shows both ports closed. Then delete the
repository's folder: the gems, the packages, the databases, the uploaded
images and the logs are all inside it. For the caches too, `npm cache
clean --force` empties npm's (for every project), and deleting
`~/.bundle/cache/compact_index` empties Bundler's index. After
developing, `npx playwright uninstall`, from `builder/`, removes the
browsers this Playwright installed.

If you have run `bundle install` before on a RubyInstaller installed for
all users, without pointing Bundler elsewhere, its launchers may be in
`AppData/Local/Microsoft/WindowsApps`: each is a file without an
extension whose third line is `# This file was generated by RubyGems.`,
with a `.bat` of the same name beside it that runs `@ruby.exe "%~dpn0" %*`.
In PowerShell, this lists them and nothing else:

```
Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WindowsApps" -File | Where-Object { (Get-Content $_.FullName -TotalCount 3 -ErrorAction SilentlyContinue) -contains '# This file was generated by RubyGems.' }
```

Delete those, and the `.bat` of each. On 2 October 2026 the same filter
listed 23 of the 46 files in `cms/vendor/bundle/ruby/3.4.0/bin`, the ones
without an extension, and 0 of the 17 in this machine's WindowsApps.

## Running it

```
git clone <the repository's address> page-builder-cms
cd page-builder-cms
npm start
```

`npm start` first checks the machine and says, one sentence per problem,
everything that is missing: Ruby, Bundler, the Node version, a port held
by another program, named with its process. Only then does it install
the gems and the editor's packages, when they are not there yet, prepare
the development databases (`db:prepare`: the pages, the cache and the
queue, and the example site loaded into a new one), start the CMS on
http://127.0.0.1:3900, with Solid Queue inside it so that a publish set
for a time happens while it runs, and the editor on
http://127.0.0.1:4900, with every line they print marked `[cms]` or
`[editor]`, wait until each answers for itself, and open the editor in
the browser. Ctrl+C stops both, and so does either one stopping by
itself.

- The ports are the project's own, so they do not collide with the 3000
  and 5173 most projects start on; `CMS_PORT` and `BUILDER_PORT` move
  them. Both servers listen on 127.0.0.1 only: the API has no
  authentication.
- The browser stays closed with `npm start -- --no-open`, with
  `NO_OPEN=1`, in CI, and when the output is not a terminal.
- `npm run setup` installs and prepares the database, and starts nothing.
- `npm start -- --smoke` starts, checks that both answer, stops, and says
  what changed outside the repository. `npm run check:start-interrupt`
  stops a running start once with a real Ctrl+C and once by killing the
  editor's server, and checks that nothing is left running either time.
  On 3 October 2026, on Windows, they printed `smoke: 7 checks passed`
  and `RESULT: 11 checks passed`. The smoke run reads, among its seven
  looks, the editor's entry module as Vite compiles it: a module with a
  syntax error answers 500 there. `npm run check:setup-tree` runs the
  setup on a development database of its own, one migration behind, so
  that it migrates and dumps the schema, and checks that the schema it
  wrote and git status are what they were: Ruby on Windows wrote the
  dump with CRLF line endings, and `cms/db/schema.rb` came back modified
  with nothing else changed (`cms/lib/tasks/schema_dump.rake` turns the
  dump back to LF). On 4 October 2026, on Windows, it printed `pass 1`
  after 29 s; without the rake file, it failed on 149 lines ending in
  CRLF and `AM db/schema.rb`.

## What is here now

- [`design/`](design/): the approved design mock, in static HTML, of the
  editor and of a published page, with the design tokens, the mark, the
  fonts and their licences, and screenshots of every state: the identity.
  [`design/layout/`](design/layout/) is the editor's layout, approved on
  3 October 2026, drawn the same way with its own notes and screenshots.
  Its own README says how to open them.
- [`schema/tokens.json`](schema/tokens.json): the design tokens (colours and
  their contrast pairs, spacing, type, radii, breakpoints), taken from the
  mock, with the palette slots of the site style and their curated tones.
  It is the copy the code reads.
- [`schema/`](schema/): the one schema of the page document, the corpus
  both validators are held to, the tools that compare them, and the icon
  box's icons (`icons.svg`).
- [`cms/`](cms/): the Rails 8.1 application. It stores pages, their draft
  and versions, publishes them, keeps the media library and the site
  style, answers the editor through a JSON API described in
  [`cms/openapi.yaml`](cms/openapi.yaml), and serves the published pages,
  rendered on the server in the design's theme, with a draft preview and a
  404 page. Since stage 4 a published page is cached in the browser (an
  ETag, and a 304 while nothing changed) and in Solid Cache (the whole page
  and each block, so a change redraws only the blocks it touched), a
  publish can be set for a time, and Solid Queue runs the jobs inside the
  server: the scheduled publish, and every night the pruning of old
  automatic versions and the purge of unused images. Since stage 5 it
  takes the forms visitors send from a published page, cached or not,
  and the editor lists, reads and deletes their answers through the same
  API, in Form responses from its menu. `ruby bin/rails db:seed` loads the design's example site. Its README has the commands to
  install, run and test it, and how the caches and the jobs work.
- [`contract/`](contract/): the render contract, documents and the HTML the
  server renders for each, which the editor's renderer is held to.
- [`builder/`](builder/): the editor's package, React 19, TypeScript and
  Vite, with every dependency pinned, the document's types and its
  validator compiled from the schema, the published page's stylesheets
  and fonts taken from `cms/`, and Oxlint keeping every call to the server
  inside `src/storage/`. Written and tested so far, beneath the interface:
  every change to a page as a command with its inverse, held to it on
  random pages and editing sessions; the store that runs them, with undo,
  redo and drag and drop; the storage adapter for the CMS's API, held to
  `cms/openapi.yaml` and to a battery of cases run against a CMS of the
  test run's own, and the autosave, one request in flight; the React
  renderer and the thirteen widgets' definitions, held to the server's
  goldens by the render contract and to the pages the CMS serves for
  random valid documents. Tests start a CMS and an editor server of their
  own, among them a browser saving a draft and uploading an image through
  the editor's proxy. On those, the interface, in the approved design's
  identity: the blocks to add, the canvas, the property panels and the
  page's tree; drag and drop by mouse and by keyboard, on the canvas and
  from the blocks to add; one keyboard map with its "?" window; the focus
  placed after every command; the block's menu; the save states, with the
  conflict's Reload and Keep mine; Preview and Publish, opening the CMS's
  own pages; Site style; the mark as icon, a manifest and About; the
  accessibility checks (`check:a11y`) and how its shell is served
  (`check:serving`).
  Since stage 3: a text block written where it stands on the canvas, with
  TipTap loaded only then, its typing one step of the page's history;
  undo and redo in the top bar and a history panel of the session's steps
  and the page's versions, with Save version and Restore; either choice
  of the two-tab conflict undoable from that history; a tablet's and a
  phone's own style values, set in the sidebar's groups with that device
  previewed and taken back by Remove; every key the interface names in
  one keyboard map; and the media library, uploading straight to the CMS
  each image drawn again in the browser, with its alt text required
  before it is placed.
  Since stage 3 bis, the same editor is laid out as the approved layout:
  a top bar with Insert, Outline and History, each a drawer (Insert floating
  over the canvas's left, the Outline and History pushing the page aside); one sidebar with a Page tab and a Block tab, their
  settings in groups named after what they hold, each saying its value
  when closed; the selected block's tools in a clamp in the page's
  margin; round "+" buttons on the page, each opening a picker of only
  what fits there; and a bottom line with the selection's path, Block
  edges, the devices in one click and the page's width.
  Since stage 4: Schedule… in the Publish menu, a small dialog that takes
  a day and a time in the site's time zone, and the publish waiting shown
  in the top bar, and in the Publish menu and History with its cancel;
  every key of Insert and of the pickers dragged by mouse or keyboard,
  Gallery and Video included, which ask in their window first and then
  land where the key was dropped; and a flat light grey where a block
  cannot go.
  Its README has the commands; from here,
  `npm run builder:install`, then `builder:typecheck`, `builder:lint`,
  `builder:test`, `builder:build`, `builder:test:rails` and `builder:e2e`.
- [`docs/decisions/`](docs/decisions/): decisions with their cost, each
  with the command that shows it holds.
- `package.json` and [`tools/`](tools/): the repository's own Node tools,
  TypeScript run by Node 24 and checked by `npm run typecheck`.
  `tools/start.cjs` and [`tools/start/`](tools/start/) are `npm start`
  (above): a guard in plain JavaScript that any Node can read, then the
  preflight, the one install routine, the two servers and the stop.
  [`tools/check.ts`](tools/check.ts) is `npm run check`, below.
  `npm run lint:openapi` lints the API
  description; `tools/seed-images.ts` renders the seed's pictures,
  `tools/gen-contract-500.ts` writes the 500-block fixture,
  `npm run measure:server`, `measure:builder` and `measure:bundle` take the
  measurements of the [Measurements](#measurements) section,
  `tools/site-shots.ts` photographs a running site,
  `tools/type-scales.ts` measures its headings under each type-scale
  choice, and
  `tools/check-production.ts` (`npm run check:production`) checks a
  production boot on 127.0.0.1:3902 (`PRODUCTION_CHECK_PORT` moves it),
  a visitor's form sent to it, kept, refused from another site and held
  to the limit, and in a browser the published page's layout, colours,
  reflow and focus rings. `npm run test:tools` runs the tools' own tests: how they
  read, from netstat, ss or lsof, who listens on a port, npm start's
  parts, the check's readers, the CI file, and that no tracked file cites
  a document the repository does not hold, or a rule by its number
  (`tools/references.test.ts`).
  `tools/probes/` holds the probe of a risky assumption, run before the
  code that relies on it. Playwright 1.62.1 drives Chromium headless for
  the ones that need a browser.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml): the same checks
  on Linux, and on Windows where the code takes another path there, each
  job with a time limit: the Rails tests on Ruby 3.3 and 3.4, the
  schema's two validators and its lint, the contract fixture and the API
  description, RuboCop, Brakeman and bundler-audit, the production check,
  the editor's checks on Node 22.13.0 (the lowest it declares) and 24,
  the render contract's two halves, the editor against a CMS of its own
  in a browser with its accessibility tests and how its page is served
  (`check:serving`), the tools' tests on Linux
  and Windows, npm start's refusal of Node 22.13.0 and 18 before any
  install, and npm start in smoke mode on Linux and Windows, from
  nothing, with its real Ctrl+C and `check:setup-tree`. It first ran on
  2 October 2026, on the checks of stage 1, and every job passed on
  Linux, among them the Rails tests in forked workers, whose OpenAPI
  counts the main process added up, and the production check, which
  found who listened and stopped the server's process group. On
  4 October 2026 it ran on stages 2 to 3 bis: 12 of its 15 jobs passed,
  npm start's smoke run on Linux and Windows and the editor's checks on
  Node 22.13.0 and 24 among them. Three failed
  on two faults only Linux has: the tools' tests (in the tools job and
  before the production check) read a process's name from the kernel,
  which for Node 24 is its main thread's, and a browser test compared two
  screenshots byte for byte, which Linux's font smoothing told apart.
  Both are fixed in stage 4, which has not run there yet, nor have its own
  checks: the jobs in Solid Queue's forked process, the Rails tests'
  cache database in forked workers. Nothing has run on macOS.

## Checking it

`npm run check` runs every check of the repository, one after another,
and reads each one's counts from what its reporter wrote: Vitest's and
Playwright's JSON, minitest's summary, the TAP of Node's test runner, the
summary lines of the other tools. A suite fails when anything in it
failed, when its count is zero, or when it is under the floor written
for it in [tools/check/suites.ts](tools/check/suites.ts). A suite that
cannot run here (no Ruby, no Chromium, a port taken, bundler-audit
without its advisory database) is listed at the end as not run, and the
run exits 2, never 0. The run also fails if `cms/public/assets` is left
over from a production build, which development would serve in place of
the stylesheets being edited. `npm run check -- --list` names the
suites; `--only` and `--skip` take those names.

In the night of 4 to 5 October 2026, on the virtual machine of "Before
you start", with `CMS_PORT`, `BUILDER_PORT` and `PRODUCTION_CHECK_PORT`
set to 3901, 4901 and 3901 so that every server it started was on the
test ports, one run of the whole check (`npm run check`), from 01:18:54
to 01:43:39 UTC on the 5th, took 24.8 minutes and ended `RESULT: 25
passed, 1 could not run here`: bundler-audit, for want of its database.
Its counts, with the third fix round that followed stage 4's review: 68
tools tests, 375 files linted, 771 unit tests and the render contract's
22, 214 corpus files with no disagreement, 309 Rails runs with 276 API
answers held to the description, 51 tests against a CMS of their own,
206 browser tests and 38 accessibility tests (the last 38 are among the
206, and run again on their own), 40 serving checks, 45 of the
production boot, 7 of npm start's smoke run and 11 of its stops. The
floors in `suites.ts` are those counts, and RuboCop's 136 files;
Brakeman's, 70, is under the 79 checks it ran. The steps of the CI
file's browser job (`builder-e2e`: the tests against a CMS of their own,
the browser tests, the accessibility tests again, the serving checks)
took 48.4, 747.6, 258.3 and 22.2 seconds, 17.9 minutes in all; 17.9 in
the second fix round's run, with 200 browser tests, 17.4 in the first
fix round's, with 192, and 17.0 in the earlier run of stage 4, whose
browser tests were 178.

The Vitest projects are made to hold on a busy machine without hiding a
failure. Each runs alone, with at most half the processors as workers (up
to four; `CHECK_MAX_WORKERS` sets it) and 30 seconds per test instead of
Vitest's 5: a test that hangs still fails. When the only trouble in a run
is workers that could not start within Vitest's fixed 60 seconds, the
project runs again with one worker; a test that failed is never run
again, and workers that cannot start even one at a time make the suite
"not run", not passed. On 2 October 2026, on the editor's unit project
(56 files, 428 tests):
- with the first two workers planted to take 70 seconds to start, Vitest
  alone exited 1 on two "Failed to start forks worker" errors, and its
  summary counted 54 files and 402 tests, the two files simply missing;
  `npm run check` saw the errors, ran the project again with one worker,
  and passed on all 56 files and 428 tests;
- with the same plant and `DOC_PROPERTY_RUNS=0`, which fails eight tests,
  it reported the eight failures and did not run the project again;
- held to one processor beside two busy loops, Vitest's own settings
  failed a canvas test that took 14.7 seconds against its 5, and the
  check's passed all 428 tests (each run about 600 seconds).

## Measurements

Every number in this section was produced by the command given with it,
run from the repository's root on 4 October 2026, on one machine: a
Windows 10 virtual machine with 8 logical processors (an Intel Core
i7-10700 at 2.9 GHz) and 12 GB of memory, with Node 24.19.0, Ruby 3.4.11
(YJIT off), Rails 8.1.4 on Puma 8.0.2 with its 3 threads, and headless
Chromium 151, the build Playwright 1.62.1 is held to.

The server's and the editor's measurements work on one page,
`contract/fixtures/large-500.json`: 500 blocks, 25 sections, 61 columns
and 414 widgets of the twelve kinds, which the server renders to 211 KB of
HTML. Its nine library images are the example site's pictures, uploaded to
the run's own library as the editor uploads an image, with the library's
ids in place of the fixture's own; the rest is the fixture as it is. (Ten
of its images name another site, which this machine cannot fetch.) Each
command that needs servers starts them, on ports of its own (3902 for the
production CMS; 3901 and 4901 for the e2e CMS and the editor;
`MEASURE_SERVER_PORT`, `MEASURE_CMS_PORT` and `MEASURE_EDITOR_PORT` move
them), with databases and an Active Storage root of its own, and deletes
them when it ends.

How a number is taken:
- **On a quiet machine.** A command waits until two readings in a row,
  three seconds each, have all the processors under 15% busy, and gives up
  (exit 2) if the machine does not settle in fifteen minutes, rather than
  measure. Each run is taken after a quiet reading and read again after it;
  a run the machine was busy after is thrown away and taken again, and
  the text beside each table says how many were. The ranges of load below are those
  readings, before and after the runs kept. A virtual machine cannot see
  what its host is doing: the load is the guest's own, and it is read
  between the runs, not during them. `MEASURE_ALLOW_BUSY=1` measures
  anyway, and the output then says it was taken under load and is not to be
  quoted.
- **Several times.** A number is the median of many runs with the smallest
  and the largest beside it, not one run. A 95th percentile is given only
  where there are hundreds of values to take it from.
- **Against a baseline.** The server's health check, which draws nothing,
  and the same drag on a page of four blocks say what the stack and the
  harness cost by themselves.
- **Able to fail.** Each command also checks that it measured what it says:
  that every answer had the 500 blocks, that a cold visit wrote 501 rows,
  that the drag was engaged and saved nothing, that the editor's text
  chunk was not loaded to open the page. `npm run test:tools` runs the
  tests of the tools themselves, among them one that reads this section
  and fails if a command in it does not exist. The measurements are not
  part of `npm run check`, which does not wait for a quiet machine: those
  tests are.

### A published page, on the server

`npm run measure:server`, on 4 October 2026 from 19:59 to 20:03 UTC, the
machine 3% then 2% busy before it, no run thrown away. The CMS in
production mode, Solid Cache on its own SQLite database, one visit at a
time over one connection:

| One visit | The application (X-Runtime), ms | The client, to the last byte, ms | Runs | Load before and after the runs |
| --- | --- | --- | --- | --- |
| The health check, `/up`: no database, no view | 0.94 (0.58 to 1.56) | 15.1 (13.6 to 16.9) | 100 | 1 to 2% |
| Drawn with no cache (the draft preview) | 108 (98.9 to 155) | 121 (104 to 172) | 30 | 2 to 2% |
| Cold: Solid Cache emptied, on the server that is running | 385 (328 to 449) | 399 (343 to 464) | 15 | 0 to 4% |
| The first visit after a start: a new server, Solid Cache empty | 553 (515 to 572) | 571 (532 to 591) | 8 | 0 to 4% |
| Warm: the whole page read from Solid Cache | 4.04 (3.27 to 6.02) | 13.9 (8.55 to 22.5) | 100 | 1 to 2% |
| A 304: the ETag sent back | 2.18 (1.74 to 3.86) | 15.3 (13.1 to 18.4) | 100 | 1 to 2% |
| One heading changed and published | 22.6 (18.4 to 35.2) | 34.4 (24.5 to 45.4) | 15 | 0 to 6% |
| The site style changed | 18.2 (14.7 to 23.9) | 31.4 (27.8 to 37.7) | 15 | 0 to 13% |

Median, and the smallest to the largest run in brackets. What each visit
read from Solid Cache and wrote to it, counted as the store receives the
calls (`tools/lib/count-reuse.rb`, in production, on the same databases,
one visit each):

| Visit | Reads | Fragments asked for | Found | Writes | Fragments written |
| --- | --- | --- | --- | --- | --- |
| Cold | 88 | 501 | 0 | 88 | 501 |
| Warm | 1 | 1 | 1 | 0 | 0 |
| A 304 | 0 | 0 | 0 | 0 | 0 |
| One heading changed | 4 | 37 | 33 | 4 | 4 |
| The site style changed | 2 | 26 | 25 | 1 | 1 |

- **A cold visit is slower than no cache.** It draws the same 500 blocks as
  the preview does, and also makes the 501 keys, asks for them in 88
  reads that find nothing, and writes them in 88 writes: 385 ms against
  108. That row empties Solid Cache from outside, on a server that has
  already answered hundreds of requests: it is what a visit costs after
  the cache is emptied, not what the first visit after a deploy costs.
- **The first visit after a start is dearer still.** A deploy is a new
  process, whose templates are not yet compiled and whose code has not yet
  run, and whose cache finds nothing: 553 ms (515 to 572), 168 more than
  the cold visit on a running server. Each of its 8 runs stops the server,
  empties Solid Cache, starts the server again, waits for `/up` and a
  second more, and visits once, so every run is on a server of its own
  (`MEASURE_RUNS_START` sets the number). The visits after it cost what
  the rows above and below say.
- **A warm visit is one read.** 4.04 ms in the application, 2.18 for a 304
  that reads nothing: a difference of 1.9 ms, and 211 KB more on the wire.
  Neither costs the client more than the health check does (15.1 ms),
  which does no work at all, so on this stack the client cannot tell them
  from nothing: that 15 ms belongs to the stack (Puma, the loopback of
  Windows, Node's client; which of them is not looked into here), not to
  the page. The application's own column is the one to read for the small
  ones.
- **One block changed: 497 of 500 are not drawn again.** Of the 37
  fragments asked for, 33 were found; the 4 written are the heading, its
  column, its section and the page. 22.6 ms against 385 cold and 108 with
  no cache. A new site style writes only the page's own fragment and finds
  the other 25 in the cache: 18.2 ms.
- **No compression.** The CMS sends the HTML as it renders it, 211 KB; a
  proxy in front would compress it, and none was in the way here.

### The editor, in the browser

`npm run measure:builder`, on 4 October 2026 from 16:09 to 16:31 UTC, the
machine 2% then 5% busy before it, no run thrown away. Headless Chromium
at 1440 by 900, against the e2e CMS, in two forms of the editor: the
production build served by `vite preview`, and the development server
`npm start` runs. Nine runs of each, every run in a browser context of its
own with nothing cached.

Opening the page of 500 blocks, in ms from the start of the navigation:

| Form | The page's data arrived | The 500 blocks are in the canvas | The frame after them is made | Of that, after the data | Long tasks of the main thread | Load |
| --- | --- | --- | --- | --- | --- | --- |
| Production build | 248 (218 to 6,861) | 1,036 (982 to 7,622) | 1,161 (1,115 to 7,755) | 908 (894 to 949) | 3 (3 to 3), 924 (891 to 955) ms | 1 to 9% |
| Development server | 607 (593 to 627) | 2,094 (2,027 to 2,149) | 2,300 (2,208 to 2,332) | 1,693 (1,615 to 1,706) | 5 (5 to 6), 1,807 (1,726 to 1,840) ms | 1 to 12% |

One of the nine openings of the production build took 7.6 s, its data
arriving after 6.9 s, and the median of the nine is 1,036 ms. The load
readings of the nine runs were 1 to 9% and the cause of that one is not
known. `MEASURE_DRAG=0 MEASURE_FORMS=build MEASURE_RUNS_BUILDER=40 npm run
measure:builder`, run the same day (16:34 to 16:37 UTC), opened the page
40 more times: the blocks were in the canvas after 1,044 ms (999 to
1,087), the data after 245 (224 to 269), the frame after them 1,176 (1,122
to 1,233), the load 0 to 8%, and none stalled.

Where the main thread's time went, from the creation of the page to the
frame after its blocks, by the browser's own counters (median, ms): the
production build was busy 1,118, of which 558 in JavaScript, 415 in
layout (79 layouts) and 31 in style recalculation; the development server
2,062, of which 1,361 in JavaScript and 402 in layout. The page has 3,001
DOM nodes and the JavaScript heap is 57.5 MB.

Dragging a block across the page: the block is held by its grip while the
page is scrolled to 14 positions spread evenly over its 65,562 px, and the
pointer goes down the canvas and up again at each, 482 moves in all. The
frame interval is the time between two animation frames; the pointer's
latency is from the move to the end of the second frame after it (the
editor answers a move in a task after the frame it arrived in, and the
second frame is the one that draws the answer, so a page that does nothing
about a move reads about 30 ms). The 4-block page is the baseline.

| Form | Page | Frame interval, median / 95th / worst, ms | Frames over 33 ms | Pointer latency, median / 95th / worst, ms | Long tasks (over 50 ms) | Runs | Load |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Production build | 500 blocks | 16.7 / 50.0 / 233 | 208 of 2,369 | 60.9 / 176 / 348 | 72, 4,776 ms | 9 | 1 to 9% |
| Production build | 4 blocks | 16.7 / 16.7 / 16.8 | 0 of 525 | 30.2 / 34.1 / 54.4 | 0 | 9 | 1 to 6% |
| Development server | 500 blocks | 16.7 / 66.6 / 550 | 310 of 2,369 | 75.1 / 199 / 697 | 184, 12,301 ms | 9 | 1 to 12% |
| Development server | 4 blocks | 16.7 / 16.7 / 33.4 | 0 of 572 | 28.9 / 44.8 / 81.8 | 0 | 9 | 0 to 5% |

Medians over the runs of each run's own median, 95th percentile and worst;
the 95th percentiles of all the runs' frames pooled are 50.0 ms and 66.6 ms
(21,301 and 21,340 frames) and of their pointer moves 177 and 196 ms
(4,338 moves each). In each run the live region named 79 to 84 different
places the block would go to, and nothing was saved: the page sent no
write to the CMS.

In the production build the 482 moves took 50.5 s on the 500-block page,
9.5 moves a second, and 8.75 s on the 4-block page, 55 a second. The main
thread was busy 46.1 s of the 50.5 (91%), 26.3 s of that in JavaScript, 1.5
in style recalculation and 0.3 in layout; on the 4-block page, 1.4 s. That
is 96 ms of main thread for a pointer move, against 2.9.

**These numbers are bad and are left as they are.** The 500-block page
takes about 1.2 s to open, 0.9 s of it after its data has arrived, and a
drag across it takes the pointer's moves at about ten a second, with a
latency of 61 ms at the median and 176 at the 95th percentile where the
baseline gives 30 and 34. The development server is worse on both.
`MEASURE_PROFILE=only npm run measure:builder` (16:37 UTC) profiles one
run on an unminified build and says where the JavaScript's time went. A
profiler slows the page, so only the shares are to be read:
- **Opening:** 24.5% of the sampled time is in the canvas's `measure`,
  which reads the page's width in a layout effect, and 17.9% in the next
  layout effect, which queries the new elements. They are the first code
  to need the new DOM laid out, so the browser's own style and layout of
  its 3,001 elements is paid there, as the counters above say (415 ms of
  layout). React's render of the 500 blocks is 12.6%, and inserting the
  elements about 9%.
- **Dragging:** 41.4% of the sampled time is in `overDrawer`
  (`builder/src/editor/drag/dnd.ts`), which each of the 500 blocks, as a
  drop target, runs at every pointer move to ask whether the pointer is
  over a drawer, and which looks the drawers up with
  `document.querySelectorAll(".drawer")` every time. 31.2% is the drag
  library's position observer measuring the targets again (`updateShape`),
  and 12 to 13% React rendering what changed. Looking the drawers up once
  per move, not once per block, would take the first of these away. This
  stage measures and does not change the editor, so it is left, and listed
  as open.

### The bundle

`npm run measure:bundle`, on 4 October 2026 at 15:54 UTC. It builds the
editor twice, as `npm run builder:build` does, into folders of its own: the
two builds are the same files, byte for byte. Gzip is level 9. The sizes do
not depend on the load of the machine.

| File | What | Raw | Gzipped |
| --- | --- | --- | --- |
| `index-*.js` | The main chunk, loaded at once: React, the drag library, the schema's validator, the widgets, the editor | 842,681 B (822.9 KiB) | 226,273 B (221.0 KiB) |
| `index-*.css` | The stylesheet, loaded at once | 99,444 B (97.1 KiB) | 18,110 B (17.7 KiB) |
| `index.html` | The page | 1,423 B | 756 B |
| | Loaded at once, in all | 943,548 B (921.4 KiB) | 245,139 B (239.4 KiB) |
| `TextEditor-*.js` | The text editor (TipTap, ProseMirror), loaded when a text is first edited | 358,570 B (350.2 KiB) | 113,515 B (110.9 KiB) |
| `activestorage.esm-*.js` | The upload code, loaded at the first upload | 15,268 B (14.9 KiB) | 5,026 B (4.9 KiB) |
| 4 `.woff2` files | The fonts, fetched when a page uses them | 399,984 B (390.6 KiB) | no smaller: they are compressed already |

What is lazy is read from the files: `index.html` names only the entry, the
entry reaches the text editor and the upload code with `import()` and never
statically, and a string only ProseMirror holds is in the text editor's
chunk and not in the entry. Opening the 500-block page did not request the
text editor's chunk in any run above.

### What these numbers do not say

- Chromium here paints in software and has no screen: the compositor of a
  real display is not in them, and the frame intervals are those of a
  60 Hz timer. Only Chromium was measured, only on Windows, and only one
  visit at a time: the CMS was not measured under concurrent visits.
- The load is read between runs, on the guest. A stall that shows as no
  load, like the opening that took 7.6 s, is not explained by it.
- The client's times for small answers are the 15 ms floor of this stack.
  The application's column shows them, and it is the application's own
  time, from where Rails starts its clock to its response, not Puma's.

## The plan, stage by stage

0. **Design.** A static mock of the editor and of a published page, approved
   before any code was written. Done: it is `design/`.
1. **Domain and API.** The Rails side: the page document and its shared
   schema, one draft and its versions, publishing and previews, server-side
   rendering of every widget, the media library, and the API description.
   Done.
2. **The editor.** A React and TypeScript app with a widget panel, a canvas
   and a navigator: drag and drop, properties, automatic saving. Done.
3. **Editing in depth.** Rich text, undo and redo, versions and restore,
   tablet and phone overrides, full keyboard use, image uploads. Done.
   - **3 bis, the layout.** The same editor, every capability kept,
     rearranged as the layout approved on 3 October 2026
     (`design/layout/`). Done.
4. **Publishing and performance.** HTTP and fragment caching, scheduled
   publishing and background jobs, with measurements. In progress: all
   four are in the repository (above, and [Measurements](#measurements));
   the stage's reviews are next.
5. **Forms**, submitted to Rails from published pages.
6. **A browser-only demo** of the editor, then the full documentation.

## License

MIT, see [LICENSE](LICENSE). The fonts in `design/fonts/` are under the SIL
Open Font License, with each licence file next to its font.
