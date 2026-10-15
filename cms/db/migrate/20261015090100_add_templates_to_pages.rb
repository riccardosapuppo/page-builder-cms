# A collection's template is a page of its own kind, "template" (Page::KINDS):
# a document like a page's, with a draft, versions and a publish, which
# draws each entry of its collection. It belongs to its collection
# (collection_id, one template each, deleted with it), has no address and
# is never the home page, as a part; and it is no part: the index that
# keeps one header and one footer leaves templates out.
#
# The check and the foreign key make SQLite rebuild pages: this runs
# without the transaction, for the reason AddKindToPages gives
# (test/db/migrations_keep_rows_test.rb counts every row before and after).
class AddTemplatesToPages < ActiveRecord::Migration[8.1]
  disable_ddl_transaction!

  def up
    add_reference :pages, :collection, foreign_key: { on_delete: :cascade }, index: { unique: true }
    remove_check_constraint :pages, name: "pages_kind"
    add_check_constraint :pages, "kind IN ('page', 'header', 'footer', 'template') AND (kind = 'page' OR (slug IS NULL AND NOT home)) " \
                                 "AND ((kind = 'template') = (collection_id IS NOT NULL))", name: "pages_kind"
    remove_index :pages, name: "index_pages_one_part_of_each_kind"
    add_index :pages, :kind, unique: true, where: "kind IN ('header', 'footer')", name: "index_pages_one_part_of_each_kind"
  end

  # The templates go first, with their drafts and versions (ON DELETE
  # CASCADE), as the pages they are could not be before.
  def down
    execute "DELETE FROM pages WHERE kind = 'template'"
    remove_index :pages, name: "index_pages_one_part_of_each_kind"
    add_index :pages, :kind, unique: true, where: "kind <> 'page'", name: "index_pages_one_part_of_each_kind"
    remove_check_constraint :pages, name: "pages_kind"
    add_check_constraint :pages, "kind IN ('page', 'header', 'footer') AND (kind = 'page' OR (slug IS NULL AND NOT home))", name: "pages_kind"
    remove_reference :pages, :collection, foreign_key: true, index: true
  end
end
