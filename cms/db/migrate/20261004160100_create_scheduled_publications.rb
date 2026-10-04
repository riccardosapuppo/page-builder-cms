# A publish set for a time: which page, the version of the draft it will
# put live (reason "scheduled") and the draft revision that version was
# taken from, when, and what became of it. PublishPageJob reads the row
# when its time comes and acts only on a pending one.
#
# state:
#   pending     waiting for its time;
#   published   put live by the job, as published_version;
#   cancelled   cancelled by a person;
#   replaced    a newer schedule of the same page took its place;
#   superseded  by its time, a publish had already put this revision of
#               the draft, or a later one, live: nothing was left to do;
#   failed      the job could not put it live (the reason is in the log).
class CreateScheduledPublications < ActiveRecord::Migration[8.1]
  def change
    create_table :scheduled_publications do |t|
      t.references :page, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :page_version, null: false, foreign_key: { on_delete: :cascade }
      t.integer :revision, null: false
      t.datetime :publish_at, null: false
      t.string :state, null: false, default: "pending"
      # When it stopped being pending.
      t.datetime :settled_at
      # The publish version the job made, for a published one.
      t.references :published_version, foreign_key: { to_table: :page_versions, on_delete: :nullify }
      t.timestamps
      t.check_constraint "state IN ('pending', 'published', 'cancelled', 'replaced', 'superseded', 'failed')", name: "scheduled_publications_state"
      t.check_constraint "(state = 'pending') = (settled_at IS NULL)", name: "scheduled_publications_settled"
    end
    # One pending publish per page: a second replaces the first.
    add_index :scheduled_publications, :page_id, unique: true, where: "state = 'pending'", name: "index_scheduled_publications_one_pending"
    add_index :scheduled_publications, [ :page_id, :id ]
    add_index :scheduled_publications, [ :state, :publish_at ]
  end
end
