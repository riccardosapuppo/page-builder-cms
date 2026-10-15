# An entry's image values use library images as a page's blocks do: a row
# per image an entry names, in its draft or in what is live, so an image
# an entry shows is neither deleted nor purged (MediaItem). A usage row
# now has one owner of three: a draft, a version, or an entry.
#
# The check makes SQLite rebuild media_usages; no table points at it, but
# this runs without the transaction all the same, as the other rebuilds do.
class AddEntriesToMediaUsages < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    add_reference :media_usages, :entry, foreign_key: { on_delete: :cascade }, index: true
    remove_check_constraint :media_usages, name: "media_usages_one_owner"
    add_check_constraint :media_usages, "(draft_id IS NOT NULL) + (page_version_id IS NOT NULL) + (entry_id IS NOT NULL) = 1", name: "media_usages_one_owner"
    add_index :media_usages, [ :media_item_id, :entry_id ], unique: true, where: "entry_id IS NOT NULL"
  end

  def down
    execute "DELETE FROM media_usages WHERE entry_id IS NOT NULL"
    remove_index :media_usages, [ :media_item_id, :entry_id ]
    remove_check_constraint :media_usages, name: "media_usages_one_owner"
    add_check_constraint :media_usages, "(draft_id IS NULL) <> (page_version_id IS NULL)", name: "media_usages_one_owner"
    remove_reference :media_usages, :entry, foreign_key: true, index: true
  end
end
