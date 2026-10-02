# src/document/

The page document as data, and every change to it, in pure functions: no
React, no DOM, no clock, no network. Everything here runs in Node, in tests
marked `// @vitest-environment node` (the default).

- **The tree**: find a block, its parent and its path; the nesting rule
  (page > section of one to four columns > column > widget), read from the
  schema's enums through `../shared/document.ts`, never written out again.
- **Commands with their inverse.** Each command is a value: its kind, a
  label people read in the history ("Delete heading"), and everything that
  is not deterministic decided when it is made (the ids of a duplicate or a
  paste, the `mediaId` of a finished upload), so redoing it repeats it
  exactly. Applying a command and then its inverse gives back the same
  document, byte for byte: a property test with fast-check, over random
  documents and random commands, holds every command to that.
- **The reducer**: `(document, command) => document`, validating only
  what a command can break (the candidate parent for a count such as "a
  section is full"; the whole document on a drop, never on every move).
- **Migrations** from an older `schemaVersion`, twins of the server's
  (`cms/app/models/block_document/upgrade.rb`); none exist for version 1.

Types come from `../shared/document.ts`. Nothing here imports from
`../store`, `../render`, `../widgets`, `../editor` or `../storage`.
