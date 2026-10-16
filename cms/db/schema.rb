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

ActiveRecord::Schema[8.1].define(version: 2026_10_16_090000) do
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

  create_table "collections", force: :cascade do |t|
    t.string "name", null: false
    t.string "prefix", null: false
    t.json "fields", null: false
    t.json "default_sort", null: false
    t.integer "published_revision", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.datetime "revised_at"
    t.index ["prefix"], name: "index_collections_on_prefix", unique: true
  end

  create_table "color_sheets", force: :cascade do |t|
    t.string "digest", null: false
    t.text "css", null: false
    t.datetime "created_at", null: false
    t.index ["digest"], name: "index_color_sheets_on_digest", unique: true
  end

  create_table "drafts", force: :cascade do |t|
    t.integer "page_id", null: false
    t.json "document", null: false
    t.integer "revision", default: 0, null: false
    t.string "last_save_id"
    t.string "slug"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["page_id"], name: "index_drafts_on_page_id", unique: true
    t.index ["slug"], name: "index_drafts_on_slug", unique: true
  end

  create_table "entries", force: :cascade do |t|
    t.integer "collection_id", null: false
    t.string "title", null: false
    t.string "slug", null: false
    t.json "field_values", null: false
    t.integer "revision", default: 0, null: false
    t.string "last_save_id"
    t.string "published_title"
    t.string "published_slug"
    t.json "published_field_values"
    t.integer "published_revision"
    t.datetime "published_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["collection_id", "published_slug"], name: "index_entries_one_live_slug", unique: true, where: "published_slug IS NOT NULL"
    t.index ["collection_id", "slug"], name: "index_entries_on_collection_id_and_slug", unique: true
    t.check_constraint "(published_at IS NULL) = (published_title IS NULL) AND (published_at IS NULL) = (published_slug IS NULL) AND (published_at IS NULL) = (published_field_values IS NULL) AND (published_at IS NULL) = (published_revision IS NULL)", name: "entries_published_whole"
  end

  create_table "entry_redirects", force: :cascade do |t|
    t.integer "collection_id", null: false
    t.integer "entry_id", null: false
    t.string "from_slug", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["collection_id", "from_slug"], name: "index_entry_redirects_on_collection_id_and_from_slug", unique: true
    t.index ["entry_id"], name: "index_entry_redirects_on_entry_id"
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
    t.integer "entry_id"
    t.index ["draft_id"], name: "index_media_usages_on_draft_id"
    t.index ["entry_id"], name: "index_media_usages_on_entry_id"
    t.index ["media_item_id", "draft_id"], name: "index_media_usages_on_media_item_id_and_draft_id", unique: true, where: "draft_id IS NOT NULL"
    t.index ["media_item_id", "entry_id"], name: "index_media_usages_on_media_item_id_and_entry_id", unique: true, where: "entry_id IS NOT NULL"
    t.index ["media_item_id", "page_version_id"], name: "index_media_usages_on_media_item_id_and_page_version_id", unique: true, where: "page_version_id IS NOT NULL"
    t.index ["page_version_id"], name: "index_media_usages_on_page_version_id"
    t.check_constraint "(draft_id IS NOT NULL) + (page_version_id IS NOT NULL) + (entry_id IS NOT NULL) = 1", name: "media_usages_one_owner"
  end

  create_table "orders", force: :cascade do |t|
    t.string "status", default: "open", null: false
    t.string "currency", null: false
    t.json "lines", null: false
    t.integer "total", null: false
    t.string "stripe_session_id"
    t.string "email"
    t.datetime "paid_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["stripe_session_id"], name: "index_orders_on_stripe_session_id", unique: true, where: "stripe_session_id IS NOT NULL"
    t.check_constraint "(status = 'paid') = (paid_at IS NOT NULL)", name: "orders_paid_whole"
    t.check_constraint "currency IN ('GBP', 'EUR', 'USD')", name: "orders_currency"
    t.check_constraint "status IN ('open', 'paid', 'expired')", name: "orders_status"
    t.check_constraint "total >= 0", name: "orders_total"
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
    t.string "kind", default: "page", null: false
    t.integer "collection_id"
    t.json "listed_collections", default: [], null: false
    t.index ["collection_id"], name: "index_pages_on_collection_id", unique: true
    t.index ["home"], name: "index_pages_one_home", unique: true, where: "home"
    t.index ["kind"], name: "index_pages_one_part_of_each_kind", unique: true, where: "kind IN ('header', 'footer')"
    t.index ["published_version_id"], name: "index_pages_on_published_version_id"
    t.index ["slug"], name: "index_pages_on_slug", unique: true
    t.check_constraint "kind IN ('page', 'header', 'footer', 'template') AND (kind = 'page' OR (slug IS NULL AND NOT home)) AND ((kind = 'template') = (collection_id IS NOT NULL))", name: "pages_kind"
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

  create_table "shop_settings", force: :cascade do |t|
    t.boolean "enabled", default: false, null: false
    t.string "currency", default: "GBP", null: false
    t.integer "products_collection_id"
    t.string "price_field"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["products_collection_id"], name: "index_shop_settings_on_products_collection_id"
    t.check_constraint "NOT enabled OR (products_collection_id IS NOT NULL AND price_field IS NOT NULL)", name: "shop_settings_on_whole"
    t.check_constraint "currency IN ('GBP', 'EUR', 'USD')", name: "shop_settings_currency"
    t.check_constraint "id = 1", name: "shop_settings_single_row"
  end

  create_table "site_styles", force: :cascade do |t|
    t.json "palette", null: false
    t.string "type_scale", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "letter_width", default: "normal", null: false
    t.text "custom_css", default: "", null: false
    t.check_constraint "id = 1", name: "site_styles_single_row"
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
  add_foreign_key "entries", "collections", on_delete: :cascade
  add_foreign_key "entry_redirects", "collections", on_delete: :cascade
  add_foreign_key "entry_redirects", "entries", on_delete: :cascade
  add_foreign_key "media_usages", "drafts", on_delete: :cascade
  add_foreign_key "media_usages", "entries", on_delete: :cascade
  add_foreign_key "media_usages", "media_items"
  add_foreign_key "media_usages", "page_versions", on_delete: :cascade
  add_foreign_key "page_versions", "pages", on_delete: :cascade
  add_foreign_key "pages", "collections", on_delete: :cascade
  add_foreign_key "pages", "page_versions", column: "published_version_id"
  add_foreign_key "scheduled_publications", "page_versions", column: "published_version_id", on_delete: :nullify
  add_foreign_key "scheduled_publications", "page_versions", on_delete: :cascade
  add_foreign_key "scheduled_publications", "pages", on_delete: :cascade
  add_foreign_key "shop_settings", "collections", column: "products_collection_id"
  add_foreign_key "slug_redirects", "pages", on_delete: :cascade
  add_foreign_key "submissions", "page_versions"
  add_foreign_key "submissions", "pages"
end
