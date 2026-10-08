# A page has one draft, saved at a revision, and a version is made on purpose

Decided on 1 October 2026, with the draft and the versions.
Written down on 8 October 2026.

## The question

The editor saves on its own, a second after the last edit. If every save
were a version, the history would be noise; and if a save simply replaced
the draft, a second tab, or a save that arrives late, would silently erase
the other's work.

## The decision

- **One draft per page**, with a revision number. A save names the
  revision it was made from and is one statement,
  `UPDATE drafts SET ..., revision = revision + 1 WHERE page_id = ? AND
  revision = ?`: the number of rows it changed decides. None means a 409,
  which names the draft's `currentRevision` and the `lastSaveId` that got
  it there.
- **A retry is not a conflict.** Every save carries an id. The same id with
  the same revision and document, sent again because its answer was lost,
  is answered 200; the same id with another document or revision is a 409.
- **A version is kept** on publish, on restore, on "Save version", on
  scheduling a publish, and at most every ten minutes while someone saves.
  A restore first keeps the draft it replaces as a `before-restore`
  version, so the edits made since the last automatic version are not lost
  to it. A nightly job prunes automatic versions only: the newest 50 of
  each page stay, and those of the last 30 days.
- **The editor sends one request at a time.** Edits made meanwhile leave
  with the revision its answer gave. When the answer is a conflict, saving
  stops and the editor offers Reload (take the server's draft) or Keep
  mine (save this tab's page on top); either is a step of the History that
  can be undone.

## What it costs

- **Two tabs, or two people, do not merge.** One of two sets of edits is
  chosen, by the person who sees the conflict. There is no merge and no
  live co-editing.
- **History is coarse.** A version is made at most every ten minutes of
  saving, so the draft between two automatic versions exists only as the
  draft. The editor's own History (undo and redo, per session) is finer
  and is lost when the tab closes.
- **A save is a write that can lose a race.** Every call that saves must
  handle a 409, and the browser demo's storage must answer the same, so it
  does ([storage-behind-an-adapter.md](storage-behind-an-adapter.md)).

## The proof

From `cms/`, with the lock described in its README held:

```
ruby bin/rails test test/integration/api/draft_concurrency_test.rb test/integration/api/draft_test.rb test/integration/api/versions_test.rb
```

The concurrency test sends saves from one revision at the same moment,
over real connections, and prints how many requests and transactions
overlapped, so a run that never overlapped them is visible; with the
revision condition taken out of the statement, 5 of the 15 tests of the
first two files failed. On 8 October 2026 the three files ran 24 tests with
118 assertions and no failure, and the concurrency test printed `[draft
concurrency] 10 rounds: requests overlapping in 10, transactions
overlapping in 10`.

The editor's half is `builder/src/storage/autosave.test.ts` and the
two-tab case of the storage battery, which runs on the CMS's adapter and on
the browser's.
