# A scheduled publish freezes the draft it will put live as a version of
# its own reason, "scheduled" (PageVersion): the job publishes that copy,
# not whatever the draft holds when the time comes, and the media it shows
# stay indexed as a kept version's. The check on the reason column lists
# every reason, so it takes the new one.
#
# SQLite cannot change a check in place: Rails rebuilds page_versions, a
# copy and then DROP TABLE of the old one. Inside a transaction SQLite
# ignores Rails' "foreign keys off", and dropping the old table would run
# the ON DELETE CASCADE of media_usages and delete the row of every image a
# version shows (RestoreVersionMediaUsages tells how that happened once).
# Outside one, the switch holds and nothing cascades, so this migration
# runs without the transaction (test/db/migrations_keep_rows_test.rb counts
# every row before and after).
class AddScheduledToVersionReasons < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    replace_reasons "reason IN ('publish', 'restore', 'before-restore', 'manual', 'auto', 'scheduled')"
  end

  def down
    replace_reasons "reason IN ('publish', 'restore', 'before-restore', 'manual', 'auto')"
  end

  private

  def replace_reasons(expression)
    remove_check_constraint :page_versions, name: "page_versions_reason"
    add_check_constraint :page_versions, expression, name: "page_versions_reason"
  end
end
