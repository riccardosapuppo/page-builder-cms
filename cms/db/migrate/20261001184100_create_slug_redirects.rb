# An address a page had before it was published under a new one. It
# points at the page, not at a slug, so a page renamed twice never sends a
# visitor through a chain of redirects.
class CreateSlugRedirects < ActiveRecord::Migration[8.1]
  def change
    create_table :slug_redirects do |t|
      t.string :from_slug, null: false, index: { unique: true }
      t.references :page, null: false, foreign_key: { on_delete: :cascade }
      t.timestamps
    end
  end
end
