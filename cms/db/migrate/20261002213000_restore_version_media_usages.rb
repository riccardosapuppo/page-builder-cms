# AddBeforeRestoreToVersionReasons replaced the check on page_versions'
# reason. SQLite cannot change a check in place, so Rails rebuilt the
# table: a copy, then DROP TABLE of the old one. Rails turns foreign keys
# off around that, but inside the migration's transaction SQLite ignores
# the switch, so dropping the old table ran media_usages' ON DELETE
# CASCADE and deleted the row of every image a kept version shows. A
# database migrated through it, rather than loaded from schema.rb, no
# longer knew which images its versions use, and would let one be deleted
# from the library. This puts those rows back from the versions'
# documents. It only adds missing rows, so it changes nothing on a
# database that never lost them.
class RestoreVersionMediaUsages < ActiveRecord::Migration[8.1]
  def up
    items = select_rows("SELECT public_id, id FROM media_items").to_h
    select_rows("SELECT id, document FROM page_versions").each do |version_id, json|
      # The ids an image block or a gallery item names, as
      # BlockDocument.media_refs finds them: any member called mediaId.
      named = media_ids(JSON.parse(json)).filter_map { |public_id| items[public_id] }.uniq
      named.each do |item_id|
        execute(ActiveRecord::Base.sanitize_sql_array([
          "INSERT INTO media_usages (media_item_id, page_version_id) SELECT ?, ? " \
          "WHERE NOT EXISTS (SELECT 1 FROM media_usages WHERE media_item_id = ? AND page_version_id = ?)",
          item_id, version_id, item_id, version_id
        ]))
      end
    end
  end

  # The rows it adds are ones the versions should always have had.
  def down; end

  private

  def media_ids(value)
    case value
    when Hash then value.flat_map { |key, child| key == "mediaId" && child.is_a?(String) ? [ child ] : media_ids(child) }
    when Array then value.flat_map { |child| media_ids(child) }
    else []
    end
  end
end
