# The header and footer were one row of the sites table, its four values
# set in the editor's Header and footer panel (PUT /api/site); they are now
# the site's parts, pages made of blocks like any other (SiteParts). A site
# that changed them there keeps what it set: the starters
# (config/parts/*.json) are filled with the row's words, its name in the
# header's logo, its links in the menu, its button, or none, and its two
# lines in the footer's text, and each part is published, since the row's
# values were live. A site that never changed them has no row: its pages
# draw the starters, which hold the defaults the row stood in for. Then the
# table goes.
class MakePartsFromTheSiteRow < ActiveRecord::Migration[8.1]
  # The tables as they are at this migration, apart from the app's models,
  # which may change later.
  class SiteRow < ActiveRecord::Base
    self.table_name = "sites"
  end

  def up
    if table_exists?(:sites) && (row = SiteRow.find_by(id: 1))
      # In UTC, as the database keeps every time: quoted as it is, a time in
      # the app's zone would be written in that zone's hours.
      at = (row.updated_at || Time.current).utc
      { "header" => header(row), "footer" => footer(row) }.each do |kind, document|
        next if select_value("SELECT 1 FROM pages WHERE kind = #{quote(kind)}")

        part(kind, document, at)
      end
    end
    drop_table :sites, if_exists: true
  end

  # The table back, with no row: what a site that never changed its header
  # and footer had. The parts stay pages, as published, until
  # LetPartDraftsHaveNoAddress and AddKindToPages are taken back too.
  def down
    create_table :sites do |t|
      t.string :name, null: false
      t.json :menu, null: false
      t.json :action
      t.json :footer, null: false
      t.integer :revision, null: false
      t.timestamps
      t.check_constraint "id = 1", name: "sites_single_row"
    end
  end

  private

  def starter(kind)
    JSON.parse(Rails.root.join("config", "parts", "#{kind}.json").read(encoding: "UTF-8"))
  end

  # The starter's header with the row's name, links and button.
  def header(row)
    document = starter("header")
    each_block(document) do |block, column|
      case block["id"]
      when "header-logo" then block["props"] = { "name" => row.name }
      when "header-menu"
        links = Array(json(row.menu)).map { |link| { "label" => link["label"], "href" => link["href"] } }
        links.empty? ? column["children"].delete(block) : block["props"]["items"] = links
      when "header-join"
        action = json(row.action)
        action ? block["props"] = { "label" => action["label"], "href" => action["href"] } : column["children"].delete(block)
      end
    end
    document
  end

  # The starter's footer with the row's two lines, the first in bold.
  def footer(row)
    lines = json(row.footer)
    document = starter("footer")
    each_block(document) do |block|
      next unless block["id"] == "footer-text"

      block["props"] = { "doc" => { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [
        { "type" => "text", "text" => lines["lead"], "marks" => [ { "type" => "bold" } ] },
        { "type" => "text", "text" => " #{lines['text']}" }
      ] } ] } }
    end
    document
  end

  def json(value)
    value.is_a?(String) ? JSON.parse(value) : value
  end

  # Each widget of a document, with its column.
  def each_block(document)
    document["sections"].each do |section|
      section["children"].each do |column|
        column["children"].dup.each { |block| yield block, column }
      end
    end
  end

  # A part with document as its draft, published: a page row, its draft,
  # the version that is live.
  def part(kind, document, at)
    json = JSON.generate(document)
    page_id = insert("INSERT INTO pages (kind, created_at, updated_at) VALUES (#{quote(kind)}, #{quote(at)}, #{quote(at)})")
    insert("INSERT INTO drafts (page_id, document, revision, slug, created_at, updated_at) VALUES (#{page_id}, #{quote(json)}, 1, NULL, #{quote(at)}, #{quote(at)})")
    version_id = insert("INSERT INTO page_versions (page_id, number, document, reason, created_at) VALUES (#{page_id}, 1, #{quote(json)}, 'publish', #{quote(at)})")
    update("UPDATE pages SET published_version_id = #{version_id}, published_revision = 1, published_at = #{quote(at)} WHERE id = #{page_id}")
  end
end
