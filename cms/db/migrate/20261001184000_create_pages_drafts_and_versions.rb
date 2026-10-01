# A page, its one draft and its versions.
#
# The page row holds only what is live: the published address and the
# version that is served. Everything being edited lives in the draft, which
# the editor saves again and again with a revision number. A version is a
# frozen copy of a document, made on publish, on restore, on "Save version"
# and automatically while someone edits.
class CreatePagesDraftsAndVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :pages do |t|
      # The address the page is served at: null until the first publish,
      # unique once set (SQLite lets any number of rows hold null).
      t.string :slug
      # Never moves back: a later publish of an older version keeps the
      # time of the latest publish.
      t.datetime :published_at
      t.timestamps
    end
    add_index :pages, :slug, unique: true

    create_table :drafts do |t|
      t.references :page, null: false, index: { unique: true }, foreign_key: { on_delete: :cascade }
      t.json :document, null: false
      # Raised by one on every save; a save that names an older revision is
      # refused with 409.
      t.integer :revision, null: false, default: 0
      # The id the editor gave its latest accepted save, so a retry of that
      # same save is recognised as done rather than as a conflict.
      t.string :last_save_id
      # The address the page will have once published.
      t.string :slug, null: false
      t.timestamps
    end
    add_index :drafts, :slug, unique: true

    create_table :page_versions do |t|
      t.references :page, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.integer :number, null: false
      t.json :document, null: false
      t.string :reason, null: false
      t.string :name
      # For a restore: the number of the version that was copied back.
      t.integer :restored_from
      # Versions never change, so they have no updated_at.
      t.datetime :created_at, null: false
      t.check_constraint "reason IN ('publish', 'restore', 'manual', 'auto')", name: "page_versions_reason"
    end
    # Also a second line of defence: two writers that both took the same
    # next number cannot both insert it.
    add_index :page_versions, [ :page_id, :number ], unique: true

    add_reference :pages, :published_version, foreign_key: { to_table: :page_versions }
  end
end
