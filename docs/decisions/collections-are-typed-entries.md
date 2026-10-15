# Collections are typed entries: a definition held to a schema, values held to it by rules written twice, a template kept as a part

Decided on 15 October 2026, with stage 13, collections first and a shop
built on them later: its first phase, the model on both sides, the CMS's
tables and API, the editor's storage on both adapters. The editor's
screen, the widgets and the entries' pages on the site come in the
phases after it.

## The question

The project reads as a page builder more than a CMS: everything it keeps
is a page. A site wants content that repeats, news, events, later
products, each item of a kind typed the same way, listed on pages and
drawn by one design. Two ways were open. Items as pages, each article a
page with a tag, keep one model but leave the shape of an item to each
page, a list to a search through documents, and every article's design
to be copied by hand. Typed content, a collection with fields and its
entries holding values of them, needs a model of its own, and the
project's rule that the editor and the server agree on what is valid
then has to hold for something whose shape is data, which no fixed
schema can describe.

## The decision

- **A collection is a definition**: its name, the prefix of its entries'
  addresses (`/news/<entry>`), its fields (a key, a label, a type of a
  closed list of nine, `text`, `paragraph`, `richText`, `number`, `date`,
  `image`, `link`, `toggle` and `choice`, and whether it is required) and
  the order its entries are listed in. It is held to one schema,
  [`schema/collection.schema.json`](../../schema/collection.schema.json),
  which ajv and json_schemer both read, and to rules the schema cannot
  hold (keys and options unique, a number field's bounds in order and with
  two decimals, an order by a date or number field), written once in
  TypeScript ([`schema/tools/collection-rules.ts`](../../schema/tools/collection-rules.ts),
  imported by the editor as it is) and once in Ruby
  ([`cms/lib/collection_document/rules.rb`](../../cms/lib/collection_document/rules.rb)),
  as a page's are ([one-schema-two-validators.md](one-schema-two-validators.md)).
- **An entry is held to its collection's fields by those rules**: they
  give each value to the definition of its field's type in the schema,
  which reuses the page schema's own (the text widget's rich text, the
  image widget's library image, the button's label and address), and say
  what the schema cannot (a value under a key no field has, a required
  field without one, a number within its field's bounds, a day that
  exists, a choice among its options). Unlike a page's rules, they do not
  stand in front of the schema: both answer together, so a person filling
  in an entry sees every fault at once. A corpus of 124 cases,
  [`schema/collection-corpus/`](../../schema/collection-corpus/), holds
  the two validators to one verdict, and the editor's checks and the
  CMS's to it.
- **An entry has a draft and what is live**, no versions: the draft saved
  at a revision as a page's is ([one-draft-saved-at-a-revision.md](one-draft-saved-at-a-revision.md):
  one conditional statement, a retry recognised, a conflict naming where
  it is), and a publish copying its title, slug and values, checked again
  against the fields as they are then. A live entry published under a new
  slug leaves a redirect from the old one, as a page does. When it went
  live is its first publish since its last unpublish, so a news list does
  not reorder at every correction.
- **A collection's template is a page of kind `template`**, a row of
  `pages` that belongs to its collection (`collection_id`, one each,
  deleted with it), and not a table of its own. The parts showed that a
  document kept as a page gets, for nothing, everything this one needs: a
  draft saved at a revision, versions, a restore, a publish and a
  schedule, its images counted as used, the page API by its id, and the
  editor's autosave and History. A table of its own would have copied all
  of it. Like a part it has no address and is never the home page; unlike
  a part it takes anchors, since it is the whole of what its entry's page
  holds between the header and the footer, which take none. It holds no
  form (keyword `template`): a form's answers are kept with a page and the
  version they were sent from, and an entry is no page.
- **A prefix is never a page's address, nor a page's address a prefix**,
  checked both ways, next and live; nor one the application answers
  itself, `sent` among them, whose `/sent/<form>` confirms the home page's
  forms.
- **A counter of what a visitor could see**, `publishedRevision` on the
  collection: every publish, unpublish and delete of a live entry moves
  it, and so does every change of the definition, whose prefix the
  entries' links start with and whose fields a list of entries draws. A
  save does not. The pages that list a collection's entries will be
  cached by it ([published-pages-cached-by-key.md](published-pages-cached-by-key.md)).
- **Both storages keep collections**, behind the same interface and
  held by the same battery ([storage-behind-an-adapter.md](storage-behind-an-adapter.md)):
  the CMS's JSON API, and the browser's IndexedDB, whose layout's third
  step adds two stores and touches no record of the others. A capability,
  `collections`, says a storage keeps them, as `responses` says it keeps
  form answers. An image an entry shows, in its draft or in what is live,
  is in use: not deleted, not purged, and the refusal names the entry.

## What it costs

- **Another pair of twins.** The collection rules are written twice, with
  a corpus to keep and a comparator to run, and the comparator holds
  pointers and keywords to one verdict, not words: a test reads the Ruby
  file for each word of the TypeScript twin.
- **One check per value.** An entry is checked value by value, each
  against its field's definition, and the editor's bundle carries eleven
  more compiled validators.
- **A collection's definition is not saved at a revision.** Two tabs
  changing one collection's fields at once keep the last, as the site
  style does; an entry's save is conditional, a definition's change is not.
- **A field deleted leaves its values** in the entries until each is
  saved again, without them; a key added again with another type finds
  the old values, which a publish refuses at the value, and which what
  draws an entry must read by its field, never by the key found.
- **The list of entries is read whole.** It is searched in the titles
  only, ASCII letters without their case (any other letter keeps it), and
  ordered after reading, with no pages of results.
- **No form in a template**, and no versions of an entry: its draft and
  what is live are all it keeps.
- **The browser's storage keeps no redirects**, since it serves nothing.
- **Two tables rebuilt**: `pages` (a check, a column and its foreign key)
  and `media_usages` (a third owner), without the migration's
  transaction, as the parts' migration did.

## The proof

From `schema/tools/`, with the CMS's gems installed: `npm run compare`
runs the comparator on the page corpus and then on the collection corpus,
which printed `RESULT: PASS (124 files, 0 disagreements, 0 exceptions)`
on 15 October 2026, every expected pointer and keyword reported by both
engines (112 of 112) and the same sets from both on every invalid case;
with the Ruby twin's `dateExists` taken out it exited 1 with eight
failures, and with the TypeScript twin's `uniqueKey` taken out with one.
`npm run corpus:check` and `npm run lint` hold the corpus and the schema.

From `cms/`, `ruby bin/rails test test/models/collection_test.rb
test/models/entry_test.rb test/models/collection_document_test.rb
test/integration/api/collections_test.rb test/integration/api/entries_test.rb`
(after `ruby bin/rails db:test:prepare`): the template made with its
collection, the definition's refusals at their pointers, the prefix and a
page's address both ways, the counter, a save at a revision, a retry and
a conflict, a publish checked again, the redirect, an image an entry
shows kept, a template's address, home and form refused, and the
collection corpus answered by the CMS's own checks. Planted one at a
time, each of these faults failed two or three of them: the prefix's
check against the pages, the page's against the prefixes, the revision
left out of the save, the counter left out of the publish, the entries
left out of an image's uses, the form left in a template.

From `builder/`, `npm run test:rails` and `npm run e2e:browser`: the
battery's 13 cases of the collections on the CMS's adapter and on the
browser's, in Chromium on its IndexedDB; and `adapter.spec.ts`'s upgrade
of a database the build before kept, every page, part, version, image
and setting as it was, the site standing as it stood, the build before's
tab told to reload. Planted, each failed: an upgrade that cleared the
pages, a fingerprint that counted the new stores while empty, an entry's
save that did not look at the revision, a publish that did not move the
counter. `npm test` holds the editor's checks to the collection corpus
(`src/shared/collection.test.ts`) and the adapter's types to
`cms/openapi.yaml` (`src/storage/openapi.test.ts`).
