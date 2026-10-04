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
the development database (`db:prepare`, which loads the example site
into a new one), start the CMS on http://127.0.0.1:3900 and the editor on
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
  404 page. `ruby bin/rails db:seed` loads the design's example site. Its
  README has the commands to install, run and test it.
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
  renderer and the twelve widgets' definitions, held to the server's
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
  `tools/site-shots.ts` photographs a running site,
  `tools/type-scales.ts` measures its headings under each type-scale
  choice, and
  `tools/check-production.ts` (`npm run check:production`) checks a
  production boot on 127.0.0.1:3902 (`PRODUCTION_CHECK_PORT` moves it),
  and in a browser the published page's layout, colours, reflow and
  focus rings. `npm run test:tools` runs the tools' own tests: how they
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
  nothing, with its real Ctrl+C. It first ran on 2 October 2026, on the
  checks of stage 1, and every job passed on Linux, among them the Rails
  tests in forked workers, whose OpenAPI counts the main process added
  up, and the production check, which found who listened and stopped the
  server's process group. The jobs of stage 2 have not run yet: until
  they do, the editor's checks and npm start have passed on Windows only,
  and their Linux paths (ss, process groups, a first install from
  nothing) and the editor's checks on Node 22 have run nowhere. Nothing
  has run on macOS.

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

On 4 October 2026, on the virtual machine of "Before you start", with
`CMS_PORT`, `BUILDER_PORT` and `PRODUCTION_CHECK_PORT` set to 3901 and
4901 so that every server it started was on the test ports, one whole
run, from 14:50:32 to 15:09:34, took 19 minutes and ended
`RESULT: 25 passed, 1 could not run here`: bundler-audit, for want of
its database. Its counts, with stage 3 bis's layout: 41 tools tests,
354 files linted, 715 unit tests and the render contract's 22, 214
corpus files with no disagreement, 237 Rails runs with 201 API answers
held to the description, 47 tests against a CMS of their own, 162
browser tests and 36 accessibility tests, 40 serving checks, 35 of the
production boot, 7 of npm start's smoke run and 11 of its stops.
The floors in `suites.ts` are those counts, and RuboCop's 110 files;
Brakeman's, 70, is under the 79 checks it ran.

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
     (`design/layout/`). In progress: it is in `builder/` (above), walked
     by the keyboard alone in a browser test; the stage's reviews are
     next.
4. **Publishing and performance.** HTTP and fragment caching, scheduled
   publishing and background jobs, with measurements.
5. **Forms**, submitted to Rails from published pages.
6. **A browser-only demo** of the editor, then the full documentation.

## License

MIT, see [LICENSE](LICENSE). The fonts in `design/fonts/` are under the SIL
Open Font License, with each licence file next to its font.
