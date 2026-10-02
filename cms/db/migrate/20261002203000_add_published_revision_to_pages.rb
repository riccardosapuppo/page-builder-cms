# The draft's revision a page's live version was taken from. The draft is
# saved again and again after a publish; with this number the API can say
# how many of those saves are not live (the draft's revision minus it),
# which the editor's top bar shows as "Published, N changes not live".
#
# Set on every publish from now on, and present exactly when something is
# live. Page validates that, not a check constraint: SQLite cannot add one
# to a table, so Rails would rebuild pages, and dropping the old table
# inside the migration's transaction runs the ON DELETE CASCADE of every
# table that points at it, deleting drafts, versions and redirects.
class AddPublishedRevisionToPages < ActiveRecord::Migration[8.1]
  def up
    add_column :pages, :published_revision, :integer

    # Pages published before this column existed. When the draft still
    # holds the live document, the live version is the draft as it is now.
    # Otherwise the revision it came from is unknown, and one less than the
    # draft's is the most that is certainly true: at least the last save is
    # not live.
    rows = select_rows(<<~SQL)
      SELECT pages.id, drafts.revision, drafts.document, page_versions.document
      FROM pages
      JOIN drafts ON drafts.page_id = pages.id
      JOIN page_versions ON page_versions.id = pages.published_version_id
    SQL
    rows.each do |page_id, revision, draft_json, live_json|
      same = JSON.parse(draft_json) == JSON.parse(live_json)
      published_revision = same ? revision : [ revision - 1, 0 ].max
      execute(ActiveRecord::Base.sanitize_sql_array([ "UPDATE pages SET published_revision = ? WHERE id = ?", published_revision, page_id ]))
    end
  end

  # SQLite's own DROP COLUMN (3.35 and later; the sqlite3 gem brings its
  # own), not remove_column, which rebuilds the table the same dangerous way.
  def down
    execute "ALTER TABLE pages DROP COLUMN published_revision"
  end
end
