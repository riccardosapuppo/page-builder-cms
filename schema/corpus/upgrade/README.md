# corpus/upgrade/

Documents written in an **older** `schemaVersion`, kept to prove that each
one still opens after the shape changes.

Every change of shape raises `schemaVersion` and comes with an upgrade
function, written in Ruby for the server and in TypeScript for the browser
demo. Documents are upgraded when they are read and when a version is
restored, so a page saved a year ago still opens and still renders.

When version 2 arrives, this folder gets, for each kind of change, a
version 1 document and the version 2 document it must become, and
`manifest.json` lists them. The comparator then runs both upgrade functions
on each file, checks that they produce the same document, and validates the
result against the current schema with both engines.

The folder is empty today because version 1 is the first version: there is
nothing older to upgrade. The comparator lists it anyway and fails if a
`.json` file appears here while no upgrade function exists, so a case can
never sit in this folder untested.
