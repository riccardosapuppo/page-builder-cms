# The site's header and footer, as the editor sets them: the name, the
# menu, the header's button (null for none) and the footer's two lines,
# with the revision every write names. One row for the whole site; until
# someone changes them there is no row, and config/site.yml's values apply.
class CreateSites < ActiveRecord::Migration[8.1]
  def change
    create_table :sites do |t|
      t.string :name, null: false
      t.json :menu, null: false
      t.json :action
      t.json :footer, null: false
      t.integer :revision, null: false
      t.timestamps
      t.check_constraint "id = 1", name: "sites_single_row"
    end
  end
end
