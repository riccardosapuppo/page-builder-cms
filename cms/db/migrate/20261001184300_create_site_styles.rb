# The site style: the tone of each palette slot and the type-scale choice.
# One row for the whole site; until someone changes it, the defaults of
# schema/tokens.json apply and no row exists.
class CreateSiteStyles < ActiveRecord::Migration[8.1]
  def change
    create_table :site_styles do |t|
      t.json :palette, null: false
      t.string :type_scale, null: false
      t.timestamps
      t.check_constraint "id = 1", name: "site_styles_single_row"
    end
  end
end
