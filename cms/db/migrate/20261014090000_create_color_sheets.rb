# The stylesheets of free colours the pages link (FreeColors): each kept
# once, under the SHA-256 of its text (ColorSheet), never changed.
class CreateColorSheets < ActiveRecord::Migration[8.1]
  def change
    create_table :color_sheets do |t|
      t.string :digest, null: false
      t.text :css, null: false
      t.datetime :created_at, null: false
    end
    add_index :color_sheets, :digest, unique: true
  end
end
