require "test_helper"

# The form blocks of a document as the page draws them and the server
# checks them: where they are found, the fields they keep, and the limits,
# which are the schema's own numbers.
class FormBlockTest < ActiveSupport::TestCase
  def form(id, items, confirmation: "Thank you.")
    { "id" => id, "type" => "form", "props" => { "items" => items, "submitLabel" => "Send", "confirmation" => confirmation }, "style" => { "base" => {} }, "children" => [] }
  end

  NAME = { "name" => "name", "kind" => "text", "label" => "Name", "required" => true, "maxLength" => 100 }.freeze

  test "the limits it knows are the schema's" do
    schema = JSON.parse(Rails.configuration.x.schema_dir.join("block-document.schema.json").read)
    field = schema.dig("$defs", "formField")
    kinds = field["allOf"].to_h { |rule| [ rule.dig("if", "properties", "kind", "const"), rule["then"] ] }

    assert_equal FormBlock::KINDS, field.dig("properties", "kind", "enum")
    assert_equal FormBlock::LONGEST["text"], kinds["text"].dig("properties", "maxLength", "maximum")
    assert_equal FormBlock::LONGEST["textarea"], field.dig("properties", "maxLength", "maximum")
    assert_equal FormBlock::MOST_FIELDS, schema.dig("$defs", "formBlock", "properties", "props", "properties", "items", "maxItems")
  end

  test "a form is found by its id where the page draws it, and only there" do
    document = page_document(widgets: [ heading_block("h", "Join"), form("join", [ NAME ]) ])
    found = FormBlock.find(document, "join")

    assert_equal "join", found.id
    assert_equal [ FormBlock::Field.new(name: "name", kind: "text", label: "Name", required: true, max_length: 100) ], found.fields
    assert_equal "Thank you.", found.confirmation
    assert_nil FormBlock.find(document, "h"), "a heading is not a form"
    assert_nil FormBlock.find(document, "other")
    assert_nil FormBlock.find(document, [ "join" ])
    assert_nil FormBlock.find(nil, "join")

    # Placed where the renderer draws nothing (straight in a section, or as
    # a section of its own), a form is not one a visitor could have sent.
    misplaced = { "schemaVersion" => 1, "title" => "T", "sections" => [ form("loose", [ NAME ]), { "id" => "s", "type" => "section", "props" => {}, "style" => { "base" => {} }, "children" => [ form("in-section", [ NAME ]) ] } ] }
    assert_nil FormBlock.find(misplaced, "loose")
    assert_nil FormBlock.find(misplaced, "in-section")
  end

  test "each kind holds the limit the browser holds it to, and a limit the schema refuses gives way to the kind's" do
    fields = FormBlock.fields(form("f", [
      NAME,
      { "name" => "email", "kind" => "email", "label" => "Email", "required" => false },
      { "name" => "notes", "kind" => "textarea", "label" => "Notes", "required" => false, "maxLength" => 100.0 },
      { "name" => "long", "kind" => "text", "label" => "Long", "required" => false, "maxLength" => 301 },
      { "name" => "frac", "kind" => "textarea", "label" => "Frac", "required" => false, "maxLength" => 2.5 },
      { "name" => "box", "kind" => "checkbox", "label" => "Box", "required" => true },
      { "name" => "file", "kind" => "file", "label" => "File", "required" => false },
      { "kind" => "text", "label" => "No name", "required" => false, "maxLength" => 10 },
      "not a field"
    ]))

    assert_equal [ [ "name", 100 ], [ "email", 254 ], [ "notes", 100 ], [ "long", 300 ], [ "frac", 5000 ], [ "box", nil ] ], fields.map { |f| [ f.name, f.max_length ] }
    assert_equal [ true, false, false, false, false, true ], fields.map(&:required)
  end
end
