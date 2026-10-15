# What the cache keys of the pages that list a collection's entries need
# (PageCache, docs/decisions/collections-are-typed-entries.md): on a page's
# row, the collections its published version's Collection lists name, so
# a visit is still answered 304 before the version's document is read, as
# any page's is; and on a collection's row, the moment of the last change
# a visitor could see of it, beside the count of them, so that a database
# made anew, or a backup restored, never names a list the way another
# database did.
#
# No page has published a list before this one: every page names none. A
# collection's last such change is taken to be its definition's.
class AddCacheKeysOfCollections < ActiveRecord::Migration[8.1]
  def up
    add_column :pages, :listed_collections, :json, null: false, default: []
    add_column :collections, :revised_at, :datetime
    execute "UPDATE collections SET revised_at = updated_at"
  end

  def down
    remove_column :collections, :revised_at
    remove_column :pages, :listed_collections
  end
end
