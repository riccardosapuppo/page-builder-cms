# The answers a visitor sent with a form of a published page: which page,
# the published version the form was read from, the form block's id, a
# copy of the form's fields as that version had them, and the answers by
# field name. The copy is what lets an old answer be read as it was sent
# after the form changes in a later version.
#
# Neither key cascades: an answer outlives nothing silently, and the only
# versions that hold forms visitors send are publish versions, which are
# never pruned.
class CreateSubmissions < ActiveRecord::Migration[8.1]
  def change
    create_table :submissions do |t|
      t.references :page, null: false, foreign_key: true, index: false
      t.references :page_version, null: false, foreign_key: true
      t.string :form_id, null: false
      t.json :fields, null: false
      t.json :answers, null: false
      t.datetime :created_at, null: false
    end
    # A page's answers, newest first, the way the CMS lists them.
    add_index :submissions, [ :page_id, :created_at ]
  end
end
