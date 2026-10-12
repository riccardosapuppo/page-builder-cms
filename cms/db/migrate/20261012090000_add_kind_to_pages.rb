# The site's header and footer become pages of their own kind (Page::KINDS):
# documents like a page's, with a draft, versions and publishes, drawn
# around every page a visitor sees. A page is "page"; at most one is
# "header" and one "footer" (a unique index on the parts' kinds), and a part
# has no address and is never the home page.
#
# The check makes SQLite rebuild pages: a copy, then DROP TABLE of the old
# one. Inside a transaction SQLite ignores Rails' "foreign keys off", and
# dropping the old table would run the ON DELETE CASCADE of every table that
# points at pages (drafts, versions, redirects, schedules) and delete their
# rows; outside one the switch holds, so this runs without the transaction,
# as AddScheduledToVersionReasons does (test/db/migrations_keep_rows_test.rb
# counts every row before and after).
class AddKindToPages < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    add_column :pages, :kind, :string, null: false, default: "page"
    add_check_constraint :pages, "kind IN ('page', 'header', 'footer') AND (kind = 'page' OR (slug IS NULL AND NOT home))", name: "pages_kind"
    add_index :pages, :kind, unique: true, where: "kind <> 'page'", name: "index_pages_one_part_of_each_kind"
  end

  def down
    remove_index :pages, name: "index_pages_one_part_of_each_kind"
    remove_check_constraint :pages, name: "pages_kind"
    remove_column :pages, :kind
  end
end
