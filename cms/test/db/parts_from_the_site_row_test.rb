require "test_helper"
require "open3"

# MakePartsFromTheSiteRow, on a database of its own. A site that changed
# its header and footer in the old panel (the one row of the sites table)
# keeps what it set, as its published header and footer, its words in the
# starters' places; one with no row gets no part from the migration, and
# its pages draw the starters, which hold the defaults the row stood in
# for. Either way the table goes. Run as a person runs the migrations, in
# processes of their own (DATABASE_URL, SCHEMA), so db/schema.rb and the
# development and test databases are never touched.
class PartsFromTheSiteRowTest < ActiveSupport::TestCase
  include OwnDatabases

  # The last migration before it, with the sites table still there.
  BEFORE = "20261012090100"
  NOW = "2026-10-09 08:00:00"

  test "a site's row becomes its published header and footer, its words in the starters' places, and the table goes" do
    migrated(name: "Samphire Bay", menu: [ { label: "Tides", href: "/tides" }, { label: "Join", href: "/#join" } ], action: { label: "Swim with us", href: "/#join" },
             footer: { lead: "Samphire Bay swimmers.", text: "Since 1931." }) do |db|
      parts = parts_of(db)
      assert_equal %w[header footer], parts.keys
      header = parts.fetch("header")
      footer = parts.fetch("footer")

      assert_equal({ "name" => "Samphire Bay" }, widgets(header)["header-logo"]["props"])
      assert_equal [ { "label" => "Tides", "href" => "/tides" }, { "label" => "Join", "href" => "/#join" } ], widgets(header)["header-menu"]["props"]["items"]
      assert_equal({ "label" => "Swim with us", "href" => "/#join" }, widgets(header)["header-join"]["props"])
      runs = widgets(footer)["footer-text"]["props"]["doc"]["content"][0]["content"]
      assert_equal [ "Samphire Bay swimmers.", " Since 1931." ], runs.map { |run| run["text"] }
      assert_equal [ { "type" => "bold" } ], runs[0]["marks"]
      assert_nil runs[1]["marks"]
    end
  end

  test "a row with no link and no button leaves the menu and the button out, and the parts are still drafts the editor could save back" do
    migrated(name: "Quiet Cove", menu: [], action: nil, footer: { lead: "Quiet Cove.", text: "No swims in winter." }) do |db|
      header = parts_of(db).fetch("header")
      assert_equal %w[header-logo], widgets(header).keys
      assert_equal [ [ "header-logo" ], [], [] ], header["sections"][0]["children"].map { |column| column["children"].map { |b| b["id"] } }
    end
  end

  test "a site with no row gets no part from the migration, and the table goes" do
    migrated(nil) do |db|
      assert_equal 0, db.get_first_value("SELECT count(*) FROM pages")
    end
  end

  private

  # The database migrated to just before the migration, the row put in
  # (none for nil), then migrated to the end; yields it, once the sites
  # table is gone.
  def migrated(row)
    dir = Rails.root.join("tmp", "parts-#{SecureRandom.hex(4)}")
    FileUtils.mkdir_p(dir)
    file = dir.join("primary.sqlite3")
    env = { "RAILS_ENV" => "development", **own_databases("development", dir), "SCHEMA" => dir.join("schema.rb").to_s }
    rails = ->(*tasks) { Open3.capture2e(env, RbConfig.ruby, "bin/rails", *tasks, chdir: Rails.root.to_s) }

    out, status = rails.call("db:migrate:primary", "VERSION=#{BEFORE}")
    assert status.success?, out
    if row
      with_database(file) do |db|
        db.execute("INSERT INTO sites (id, name, menu, action, footer, revision, created_at, updated_at) VALUES (1, ?, ?, ?, ?, 4, ?, ?)",
                   [ row[:name], row[:menu].to_json, row[:action]&.to_json, row[:footer].to_json, NOW, NOW ])
      end
    end
    out, status = rails.call("db:migrate")
    assert status.success?, out
    with_database(file) do |db|
      assert_empty db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sites'")
      yield db
    end
  ensure
    FileUtils.rm_rf(dir) if dir
  end

  def with_database(file)
    db = SQLite3::Database.new(file.to_s)
    db.execute("PRAGMA foreign_keys = ON")
    yield db
  ensure
    db&.close
  end

  # Each part's draft by its kind, in the order made, each held to what a
  # published part is: no address, its draft live as the row's values were
  # (the version published, the draft's revision), and a document a
  # part's draft may be.
  def parts_of(db)
    rows = db.execute(<<~SQL)
      SELECT p.kind, p.published_revision, p.published_at, d.revision, d.slug, d.document, v.document, v.reason, v.number
      FROM pages p JOIN drafts d ON d.page_id = p.id JOIN page_versions v ON v.id = p.published_version_id
      ORDER BY p.id
    SQL
    rows.to_h do |kind, published_revision, published_at, revision, slug, draft, live, reason, number|
      assert_equal [ 1, 1, nil, "publish", 1 ], [ published_revision, revision, slug, reason, number ], kind
      assert_equal NOW, published_at.to_s[0, 19], kind
      assert_equal JSON.parse(draft), JSON.parse(live), kind
      assert_empty SiteParts.check(JSON.parse(draft)).errors, kind
      [ kind, JSON.parse(draft) ]
    end
  end

  # A part's widgets by their ids.
  def widgets(document)
    document["sections"].flat_map { |section| section["children"].flat_map { |column| column["children"] } }.index_by { |block| block["id"] }
  end
end
