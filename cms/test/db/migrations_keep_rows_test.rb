require "test_helper"
require "open3"

# Every migration keeps the rows already in the database. A migration that
# makes SQLite rebuild a table (a check added or removed, a column
# removed) copies it and drops the old one inside the migration's
# transaction, where Rails' "foreign keys off" does nothing: the ON DELETE
# CASCADE of every table pointing at it then deletes their rows. That is
# how AddBeforeRestoreToVersionReasons lost the media usages of versions,
# which RestoreVersionMediaUsages puts back.
#
# This runs the migrations from the first one with all of the app's
# tables, as a person runs them, in processes of their own, on a database
# of its own (DATABASE_URL) holding a row in each of those tables, and
# with the schema dump sent to that database's folder (SCHEMA), so
# db/schema.rb and the development and test databases are never touched.
class MigrationsKeepRowsTest < ActiveSupport::TestCase
  include OwnDatabases

  FIRST = "20261001193000"
  TABLES = %w[active_storage_blobs active_storage_attachments pages drafts page_versions slug_redirects media_items media_usages site_styles].freeze
  NOW = "2026-10-01 10:00:00"
  # A page whose draft and kept version both show library image m1.
  DOCUMENT = {
    "schemaVersion" => 1, "title" => "Jetty",
    "sections" => [ {
      "id" => "s", "type" => "section", "props" => {}, "style" => { "base" => {} },
      "children" => [ { "id" => "c", "type" => "column", "props" => {}, "style" => { "base" => {} },
                        "children" => [ { "id" => "i", "type" => "image", "props" => { "mediaId" => "m1", "alt" => "The jetty" }, "style" => { "base" => {} }, "children" => [] } ] } ]
    } ]
  }.to_json

  test "migrating a database that holds data keeps every row of every table" do
    dir = Rails.root.join("tmp", "migrations-#{SecureRandom.hex(4)}")
    FileUtils.mkdir_p(dir)
    file = dir.join("primary.sqlite3")
    # Every database development has goes to the folder (OwnDatabases):
    # migrating development touches each of them.
    env = { "RAILS_ENV" => "development", **own_databases("development", dir), "SCHEMA" => dir.join("schema.rb").to_s }
    rails = ->(*tasks) { Open3.capture2e(env, RbConfig.ruby, "bin/rails", *tasks, chdir: Rails.root.to_s) }

    # Up to FIRST on the primary database alone: with more than one
    # database, Rails takes VERSION for each database's own migrations.
    out, status = rails.call("db:migrate:primary", "VERSION=#{FIRST}")
    assert status.success?, out
    before = with_database(file) do |db|
      fill(db)
      counts(db)
    end
    assert before.values.all?(&:positive?), "every table holds a row before the migrations: #{before}"

    out, status = rails.call("db:migrate")
    assert status.success?, out

    after, live = with_database(file) { |db| [ counts(db), db.get_first_value("SELECT published_revision FROM pages") ] }
    assert_equal before, after
    # The draft holds the live document, so the live revision is the draft's.
    assert_equal 1, live
  ensure
    FileUtils.rm_rf(dir) if dir
  end

  private

  def with_database(file)
    db = SQLite3::Database.new(file.to_s)
    db.execute("PRAGMA foreign_keys = ON")
    yield db
  ensure
    db&.close
  end

  def fill(db)
    db.execute("INSERT INTO active_storage_blobs (id, key, filename, content_type, metadata, service_name, byte_size, checksum, created_at) VALUES (1, 'k1', 'jetty.png', 'image/png', '{}', 'local', 70, 'c1', ?)", [ NOW ])
    db.execute("INSERT INTO media_items (id, public_id, alt, width, height, created_at, updated_at) VALUES (1, 'm1', '', 3, 2, ?, ?)", [ NOW, NOW ])
    db.execute("INSERT INTO active_storage_attachments (name, record_type, record_id, blob_id, created_at) VALUES ('file', 'MediaItem', 1, 1, ?)", [ NOW ])
    db.execute("INSERT INTO pages (id, slug, published_at, created_at, updated_at, home) VALUES (1, 'jetty', ?, ?, ?, 1)", [ NOW, NOW, NOW ])
    db.execute("INSERT INTO drafts (id, page_id, document, revision, slug, created_at, updated_at) VALUES (1, 1, ?, 1, 'jetty', ?, ?)", [ DOCUMENT, NOW, NOW ])
    db.execute("INSERT INTO page_versions (id, page_id, number, document, reason, created_at) VALUES (1, 1, 1, ?, 'publish', ?)", [ DOCUMENT, NOW ])
    db.execute("UPDATE pages SET published_version_id = 1 WHERE id = 1")
    db.execute("INSERT INTO slug_redirects (from_slug, page_id, created_at, updated_at) VALUES ('old-jetty', 1, ?, ?)", [ NOW, NOW ])
    db.execute("INSERT INTO media_usages (media_item_id, draft_id) VALUES (1, 1)")
    db.execute("INSERT INTO media_usages (media_item_id, page_version_id) VALUES (1, 1)")
    db.execute("INSERT INTO site_styles (id, palette, type_scale, created_at, updated_at) VALUES (1, '{}', 'balanced', ?, ?)", [ NOW, NOW ])
  end

  def counts(db)
    TABLES.to_h { |table| [ table, db.get_first_value("SELECT count(*) FROM #{table}") ] }
  end
end
