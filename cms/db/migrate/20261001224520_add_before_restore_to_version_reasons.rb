# A restore now first keeps the draft it replaces, as a version of its own
# reason, "before-restore" (PageVersion). The check on the reason column
# lists every reason, so it takes the new one.
class AddBeforeRestoreToVersionReasons < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :page_versions, name: "page_versions_reason"
    add_check_constraint :page_versions, "reason IN ('publish', 'restore', 'before-restore', 'manual', 'auto')", name: "page_versions_reason"
  end

  def down
    remove_check_constraint :page_versions, name: "page_versions_reason"
    add_check_constraint :page_versions, "reason IN ('publish', 'restore', 'manual', 'auto')", name: "page_versions_reason"
  end
end
