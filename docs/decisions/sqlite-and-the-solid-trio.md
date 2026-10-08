# Pages, cache and jobs live in SQLite files, with no Redis, no Docker and no service

Decided on 1 October 2026, with the Rails application.
Written down on 8 October 2026.

## The question

A CMS needs a database for pages and versions, a cache for the pages it
draws, and a queue for a publish set for a time and the nightly cleanup.
The usual answer is a database server, Redis and a worker process, each
with an account, a port or a container. A person who clones this to look
at it should need Ruby and Node, and nothing running that they did not
start through one command.

## The decision

Rails 8's own defaults: **SQLite** for the pages, **Solid Cache** and
**Solid Queue**, each on a SQLite database of its own (`primary`, `cache`
and `queue`, three files under `cms/storage/`), and Active Storage on the
local disk for the images. The queue's supervisor runs inside Puma, so one
`npm start` starts the CMS and its jobs. Nothing else is needed: no Redis,
no Docker, no account, no key.

- **Windows cannot fork**, so there the supervisor and its workers are
  threads of Puma's own process (`solid_queue_mode :async`); on Linux and
  macOS they are a child process. `bin/jobs` takes the same default.
- **A hard stop** (a closed console window, `taskkill /F`) leaves Solid
  Queue's rows behind: its processes, and the jobs a dead worker held. As
  the next supervisor starts, and before its workers take a job, the rows
  of a process that is gone are released and their jobs put back in the
  queue ([cms/lib/queue_orphans.rb](../../cms/lib/queue_orphans.rb)).
- **A job looks again when it runs.** The scheduled publish carries only an
  id, and does nothing if its schedule was cancelled, replaced or already
  run. If the pages database is busy past SQLite's five seconds, it waits
  ten seconds and tries again, up to twelve times.

## What it costs

- **One host.** SQLite is a file: there is no second server to share it
  with, and a write blocks another for as long as it takes. The CMS was
  measured one visit at a time, never under concurrent visits.
- **No TLS and no compression.** Production forces SSL and assumes a proxy
  in front that ends it; the CMS sends its HTML as it renders it, 211 KB for
  the 500-block page, and a proxy would compress it.
- **Jobs stop with the server.** The queue is inside Puma, so a publish
  set for a time happens only while the server runs. One whose time passes
  while no server runs happens at the next start, which also gives a job
  again to every pending schedule whose time has passed.
- **The cache is in the same disk.** Solid Cache is a table; it is read
  with a query, not from memory (4 ms in the application for a whole
  page, in the [measurements](../../README.md#measurements)).

## The proof

From `cms/`, with the lock described in its README held:

```
ruby bin/rails test test/bin/jobs_test.rb test/lib/queue_orphans_test.rb test/jobs
```

starts `bin/jobs` for real on databases of its own and sees the
supervisor, dispatcher, worker and scheduler register and stay up; plants
orphaned rows and sees them cleaned; and runs the jobs with the time moved
by hand. From the repository's root, `node tools/check-production.ts`
boots production, schedules a page 15 seconds ahead beside a server and a
`bin/jobs` of its own, and checks that the page is not live before its
time and is live after. On 8 October 2026 the Rails tests ran 19 tests with 82
assertions and no failure, and the production check printed `RESULT: 50
checks passed`.
