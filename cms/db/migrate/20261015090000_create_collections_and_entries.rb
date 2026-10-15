# Collections, their entries, and the addresses an entry had before it was
# published under a new one.
#
# A collection's row holds its definition, as schema/collection.schema.json
# describes it and CollectionDocument checks it: its name, the prefix every
# entry's address starts with (/<prefix>/<entry>), its fields and the order
# its entries are listed in. published_revision counts the changes a
# visitor could see: it goes up with every publish, unpublish and delete of
# a live entry, and every change of the definition.
#
# An entry holds its draft (title, slug and values) with the revision a
# save names, as a page's draft does, and what is live: the title, slug and
# values it was published with, the draft revision they came from, and
# when it went live; all of these or none (a check). Its slug is unique in
# its collection, and so is its live slug among the live ones.
class CreateCollectionsAndEntries < ActiveRecord::Migration[8.1]
  def change
    create_table :collections do |t|
      t.string :name, null: false
      t.string :prefix, null: false
      t.json :fields, null: false
      t.json :default_sort, null: false
      t.integer :published_revision, null: false, default: 0
      t.timestamps
    end
    add_index :collections, :prefix, unique: true

    create_table :entries do |t|
      t.references :collection, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.string :title, null: false
      # The address the entry will have once published, in its collection.
      t.string :slug, null: false
      # The values of the collection's fields, by key.
      t.json :field_values, null: false
      # Raised by one on every save; a save that names an older revision is
      # refused with 409, as a page draft's is.
      t.integer :revision, null: false, default: 0
      t.string :last_save_id
      t.string :published_title
      t.string :published_slug
      t.json :published_field_values
      t.integer :published_revision
      t.datetime :published_at
      t.timestamps
      t.check_constraint "(published_at IS NULL) = (published_title IS NULL) AND (published_at IS NULL) = (published_slug IS NULL) " \
                         "AND (published_at IS NULL) = (published_field_values IS NULL) AND (published_at IS NULL) = (published_revision IS NULL)",
                         name: "entries_published_whole"
    end
    add_index :entries, [ :collection_id, :slug ], unique: true
    add_index :entries, [ :collection_id, :published_slug ], unique: true, where: "published_slug IS NOT NULL", name: "index_entries_one_live_slug"

    create_table :entry_redirects do |t|
      t.references :collection, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :entry, null: false, foreign_key: { on_delete: :cascade }
      t.string :from_slug, null: false
      t.timestamps
    end
    add_index :entry_redirects, [ :collection_id, :from_slug ], unique: true
  end
end
