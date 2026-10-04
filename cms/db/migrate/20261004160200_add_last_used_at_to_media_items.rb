# When a draft save or a new version last named the image (MediaUsage).
# PurgeMediaJob deletes an image that nothing uses any more only once this
# is long enough ago; an image never placed on a page has none, and the
# job leaves it in the library, where a person put it.
#
# Images in use now are marked as used now. Images in use by nothing are
# left unmarked: whether a page ever showed them is not known, and keeping
# one is the safe side.
class AddLastUsedAtToMediaItems < ActiveRecord::Migration[8.1]
  def up
    add_column :media_items, :last_used_at, :datetime
    execute(ActiveRecord::Base.sanitize_sql_array([
      "UPDATE media_items SET last_used_at = ? WHERE id IN (SELECT media_item_id FROM media_usages)", Time.current.utc
    ]))
  end

  # SQLite's own DROP COLUMN, not remove_column, which would rebuild the
  # table (see AddPublishedRevisionToPages).
  def down
    execute "ALTER TABLE media_items DROP COLUMN last_used_at"
  end
end
