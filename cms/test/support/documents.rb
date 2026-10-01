# frozen_string_literal: true

# Page documents for the tests, built in the shape the schema describes:
# a section holds columns, a column holds widgets.
module Documents
  CORPUS = Rails.application.config.x.schema_dir.join("corpus")

  def corpus_document(name)
    JSON.parse(CORPUS.join(name).read)
  end

  def page_document(title: "Winter series", widgets: nil)
    widgets ||= [ heading_block("h1", title) ]
    { "schemaVersion" => 1, "title" => title, "sections" => [ section_block("s1", widgets) ] }
  end

  def section_block(id, widgets)
    {
      "id" => id, "type" => "section", "props" => {}, "style" => { "base" => {} },
      "children" => [ { "id" => "#{id}c1", "type" => "column", "props" => {}, "style" => { "base" => {} }, "children" => widgets } ]
    }
  end

  def heading_block(id, text, level: 1)
    { "id" => id, "type" => "heading", "props" => { "level" => level, "text" => text }, "style" => { "base" => {} }, "children" => [] }
  end

  def image_block(id, media_id, alt: "Swimmers at the jetty")
    { "id" => id, "type" => "image", "props" => { "mediaId" => media_id, "alt" => alt }, "style" => { "base" => {} }, "children" => [] }
  end

  # Where the first widget of the first column sits.
  FIRST_WIDGET = "/sections/0/children/0/children/0"
end
