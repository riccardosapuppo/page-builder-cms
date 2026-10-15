require "test_helper"

# The collection's checks as the CMS runs them (CollectionDocument: the
# JSON rules, then lib/collection_document/rules.rb with the app's own
# json_schemer of collection.schema.json), held to the collection corpus
# that schema/tools compares the editor's twin with: a valid case passes
# whole, and an invalid one fails with its manifest's pointer and keyword
# among its errors. The cases the text's own rules refuse (a byte-order
# mark, a member named twice, 1e400) never reach these checks in the app:
# a request's body is read by JsonBody first. They are left out.
class CollectionDocumentTest < ActiveSupport::TestCase
  include CollectionCases

  CORPUS = Rails.application.config.x.schema_dir.join("collection-corpus")

  test "every case of the collection corpus is answered as its manifest says" do
    manifest = JSON.parse(CORPUS.join("manifest.json").read)
    answered = manifest.count do |file, expected|
      read = BlockDocument::Rules.parse_json(CORPUS.join(file).binread)
      next false unless read.ok?

      found = read.document
      result = CollectionDocument.check_collection(found["collection"])
      prefix = "/collection"
      if result.ok? && found.key?("entry")
        result = CollectionDocument.check_entry(result.document, found["entry"])
        prefix = "/entry"
      end
      if file.start_with?("valid/")
        assert result.ok?, "#{file}: #{result.errors.map(&:as_json)}"
      else
        assert_not result.ok?, file
        assert_includes result.errors.map { |e| "#{prefix}#{e.pointer} #{e.keyword}" }, "#{expected['pointer']} #{expected['keyword']}", file
      end
      true
    end
    # 124 cases on 15 October 2026, of which the text's rules refuse 7.
    assert_operator answered, :>=, 110
  end

  test "a definition is answered normalised, 2.0 an integer" do
    definition = news_definition
    definition["fields"][4]["max"] = 40.0

    result = CollectionDocument.check_collection(definition)

    assert result.ok?
    assert_kind_of Integer, result.document["fields"][4]["max"]
  end

  test "an entry's faults are answered together, the rules' and the schema's, each once and at its value" do
    entry = news_entry(values: { "day" => "2026-02-30", "places" => 41, "booking" => { "label" => "Book", "href" => "javascript:alert(1)" }, "summery" => "A typo" })
    entry["values"].delete("summary")
    entry["title"] = ""

    errors = CollectionDocument.check_entry(news_definition, entry).errors

    assert_equal [
      [ "/values/summery", "unknownField" ], [ "/values/summary", "required" ], [ "/values/day", "dateExists" ], [ "/values/places", "maximum" ],
      [ "/title", "pattern" ], [ "/values/booking/href", "pattern" ]
    ], errors.map { |e| [ e.pointer, e.keyword ] }
    assert_equal [ nil ], errors.map(&:block_pointer).uniq
    assert_equal "must be at most 40", errors[3].message
  end
end
