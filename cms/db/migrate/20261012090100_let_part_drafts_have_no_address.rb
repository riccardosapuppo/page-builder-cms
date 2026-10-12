# A draft holds the address its page will have once published; the
# header's and the footer's have none (Page::PARTS), so the column takes
# NULL. A page's draft still needs one: Draft validates it, and the unique
# index keeps two pages from one address, NULLs apart.
#
# SQLite rebuilds drafts to change the column, and media_usages points at
# it with ON DELETE CASCADE: this runs without the transaction, for the
# reason AddKindToPages gives.
class LetPartDraftsHaveNoAddress < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    change_column_null :drafts, :slug, true
  end

  # Every draft holds an address again: the parts, whose drafts hold none,
  # go first, with their drafts and versions (ON DELETE CASCADE), as the
  # pages they were could not be before AddKindToPages.
  def down
    execute "DELETE FROM pages WHERE kind <> 'page'"
    change_column_null :drafts, :slug, false
  end
end
