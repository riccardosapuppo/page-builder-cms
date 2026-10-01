# The page the site's root address, /, serves. At most one page is the
# home page: the partial unique index holds that even if two requests
# race to mark different pages.
class AddHomeToPages < ActiveRecord::Migration[8.1]
  def change
    add_column :pages, :home, :boolean, null: false, default: false
    add_index :pages, :home, unique: true, where: "home", name: "index_pages_one_home"
  end
end
