# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_09_170000) do
  create_table "active_storage_attachments", force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.bigint "record_id", null: false
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "drafts", force: :cascade do |t|
    t.integer "page_id", null: false
    t.json "document", null: false
    t.integer "revision", default: 0, null: false
    t.string "last_save_id"
    t.string "slug", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["page_id"], name: "index_drafts_on_page_id", unique: true
    t.index ["slug"], name: "index_drafts_on_slug", unique: true
  end

  create_table "media_items", force: :cascade do |t|
    t.string "public_id", null: false
    t.string "alt", default: "", null: false
    t.integer "width", null: false
    t.integer "height", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "last_used_at"
    t.index ["public_id"], name: "index_media_items_on_public_id", unique: true
  end

  create_table "media_usages", force: :cascade do |t|
    t.integer "media_item_id", null: false
    t.integer "draft_id"
    t.integer "page_version_id"
    t.index ["draft_id"], name: "index_media_usages_on_draft_id"
    t.index ["media_item_id", "draft_id"], name: "index_media_usages_on_media_item_id_and_draft_id", unique: true, where: "draft_id IS NOT NULL"
    t.index ["media_item_id", "page_version_id"], name: "index_media_usages_on_media_item_id_and_page_version_id", unique: true, where: "page_version_id IS NOT NULL"
    t.index ["page_version_id"], name: "index_media_usages_on_page_version_id"
    t.check_constraint "(draft_id IS NULL) <> (page_version_id IS NULL)", name: "media_usages_one_owner"
  end

  create_table "page_versions", force: :cascade do |t|
    t.integer "page_id", null: false
    t.integer "number", null: false
    t.json "document", null: false
    t.string "reason", null: false
    t.string "name"
    t.integer "restored_from"
    t.datetime "created_at", null: false
    t.index ["page_id", "number"], name: "index_page_versions_on_page_id_and_number", unique: true
    t.check_constraint "reason IN ('publish', 'restore', 'before-restore', 'manual', 'auto', 'scheduled')", name: "page_versions_reason"
  end

  create_table "pages", force: :cascade do |t|
    t.string "slug"
    t.datetime "published_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.integer "published_version_id"
    t.boolean "home", default: false, null: false
    t.integer "published_revision"
    t.index ["home"], name: "index_pages_one_home", unique: true, where: "home"
    t.index ["published_version_id"], name: "index_pages_on_published_version_id"
    t.index ["slug"], name: "index_pages_on_slug", unique: true
  end

  create_table "scheduled_publications", force: :cascade do |t|
    t.integer "page_id", null: false
    t.integer "page_version_id", null: false
    t.integer "revision", null: false
    t.datetime "publish_at", null: false
    t.string "state", default: "pending", null: false
    t.datetime "settled_at"
    t.integer "published_version_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["page_id", "id"], name: "index_scheduled_publications_on_page_id_and_id"
    t.index ["page_id"], name: "index_scheduled_publications_one_pending", unique: true, where: "state = 'pending'"
    t.index ["page_version_id"], name: "index_scheduled_publications_on_page_version_id"
    t.index ["published_version_id"], name: "index_scheduled_publications_on_published_version_id"
    t.index ["state", "publish_at"], name: "index_scheduled_publications_on_state_and_publish_at"
    t.check_constraint "(state = 'pending') = (settled_at IS NULL)", name: "scheduled_publications_settled"
    t.check_constraint "state IN ('pending', 'published', 'cancelled', 'replaced', 'superseded', 'failed')", name: "scheduled_publications_state"
  end

  create_table "site_styles", force: :cascade do |t|
    t.json "palette", null: false
    t.string "type_scale", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.check_constraint "id = 1", name: "site_styles_single_row"
  end

  create_table "sites", force: :cascade do |t|
    t.string "name", null: false
    t.json "menu", null: false
    t.json "action"
    t.json "footer", null: false
    t.integer "revision", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.check_constraint "id = 1", name: "sites_single_row"
  end

  create_table "slug_redirects", force: :cascade do |t|
    t.string "from_slug", null: false
    t.integer "page_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["from_slug"], name: "index_slug_redirects_on_from_slug", unique: true
    t.index ["page_id"], name: "index_slug_redirects_on_page_id"
  end

  create_table "submissions", force: :cascade do |t|
    t.integer "page_id", null: false
    t.integer "page_version_id", null: false
    t.string "form_id", null: false
    t.json "fields", null: false
    t.json "answers", null: false
    t.datetime "created_at", null: false
    t.index ["page_id", "created_at"], name: "index_submissions_on_page_id_and_created_at"
    t.index ["page_version_id"], name: "index_submissions_on_page_version_id"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "drafts", "pages", on_delete: :cascade
  add_foreign_key "media_usages", "drafts", on_delete: :cascade
  add_foreign_key "media_usages", "media_items"
  add_foreign_key "media_usages", "page_versions", on_delete: :cascade
  add_foreign_key "page_versions", "pages", on_delete: :cascade
  add_foreign_key "pages", "page_versions", column: "published_version_id"
  add_foreign_key "scheduled_publications", "page_versions", column: "published_version_id", on_delete: :nullify
  add_foreign_key "scheduled_publications", "page_versions", on_delete: :cascade
  add_foreign_key "scheduled_publications", "pages", on_delete: :cascade
  add_foreign_key "slug_redirects", "pages", on_delete: :cascade
  add_foreign_key "submissions", "page_versions"
  add_foreign_key "submissions", "pages"
end
