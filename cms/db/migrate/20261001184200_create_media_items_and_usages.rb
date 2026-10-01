# The media library, and the index of which drafts and versions use which
# item.
#
# A document names an image by the item's public id. The usage index is
# rewritten on every draft save and written once for every version, so
# deleting an item can say which pages and versions still show it.
class CreateMediaItemsAndUsages < ActiveRecord::Migration[8.1]
  def change
    create_table :media_items do |t|
      # The id documents use ({"mediaId": ...}): random, so it says nothing
      # about how many items exist, and in the schema's mediaId alphabet.
      t.string :public_id, null: false, index: { unique: true }
      # The alt text the editor proposes when the image is placed. A block
      # keeps its own copy: changing it here changes no page.
      t.string :alt, null: false, default: ""
      t.integer :width, null: false
      t.integer :height, null: false
      t.timestamps
    end

    create_table :media_usages do |t|
      # No cascade: the database refuses to delete an item that is in use,
      # behind the 409 the API answers first.
      t.references :media_item, null: false, foreign_key: true, index: false
      t.references :draft, foreign_key: { on_delete: :cascade }
      t.references :page_version, foreign_key: { on_delete: :cascade }
      t.check_constraint "(draft_id IS NULL) <> (page_version_id IS NULL)", name: "media_usages_one_owner"
    end
    add_index :media_usages, [ :media_item_id, :draft_id ], unique: true, where: "draft_id IS NOT NULL"
    add_index :media_usages, [ :media_item_id, :page_version_id ], unique: true, where: "page_version_id IS NOT NULL"
  end
end
