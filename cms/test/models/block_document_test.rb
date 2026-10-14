require "test_helper"

class BlockDocumentTest < ActiveSupport::TestCase
  test "a document from the shared corpus passes and comes back as it was" do
    document = corpus_document("valid/readme-example.json")

    result = BlockDocument.check(document)

    assert result.ok?, result.errors.map(&:as_json).inspect
    assert_equal corpus_document("valid/readme-example.json"), result.document
  end

  test "a value the schema refuses is reported where it is, with the block that holds it" do
    document = page_document
    document["sections"][0]["children"][0]["children"][0]["props"]["level"] = 7

    result = BlockDocument.check(document)

    assert_not result.ok?
    assert_equal [ { "pointer" => "#{FIRST_WIDGET}/props/level", "keyword" => "maximum", "blockPointer" => FIRST_WIDGET } ],
                 result.errors.map { |e| e.as_json.except("message") }
  end

  test "a value outside every block has no block to point at" do
    document = page_document
    document["title"] = ""

    errors = BlockDocument.check(document).errors

    assert_includes errors.map(&:pointer), "/title"
    assert_equal [ nil ], errors.map(&:block_pointer).uniq
  end

  test "the block pointer of a section or a column is the block itself" do
    assert_equal "/sections/2", BlockDocument.block_pointer("/sections/2/style/base/background")
    assert_equal "/sections/0/children/3", BlockDocument.block_pointer("/sections/0/children/3/id")
    assert_equal "/sections/0", BlockDocument.block_pointer("/sections/0/children")
    assert_nil BlockDocument.block_pointer("/sections")
    assert_nil BlockDocument.block_pointer("/sectionsX/0")
  end

  test "the application rules run before the schema: a repeated block id" do
    document = page_document(widgets: [ heading_block("same", "One"), heading_block("same", "Two") ])

    errors = BlockDocument.check(document).errors

    assert_equal [ [ "/sections/0/children/0/children/1/id", "uniqueId", "/sections/0/children/0/children/1" ] ],
                 errors.map { |e| [ e.pointer, e.keyword, e.block_pointer ] }
  end

  test "a section anchor used twice is refused at the second section, which a link could never reach" do
    anchored = ->(id, anchor) { section_block(id, []).tap { |s| s["props"]["anchor"] = anchor if anchor } }
    document = page_document
    document["sections"] += [ anchored.call("s2", "join"), anchored.call("s3", nil), anchored.call("s4", "join"), anchored.call("s5", "faq") ]

    errors = BlockDocument.check(document).errors

    assert_equal [ [ "/sections/3/props/anchor", "uniqueAnchor", "/sections/3" ] ], errors.map { |e| [ e.pointer, e.keyword, e.block_pointer ] }
    assert_equal "The anchor \"join\" is already used by another block.", errors.first.message
    document["sections"][3]["props"]["anchor"] = "join-again"
    assert BlockDocument.check(document).ok?
  end

  test "a number too large to store is refused by the rules, not left to crash the schema" do
    document = page_document
    document["sections"][0]["children"][0]["children"][0]["props"]["level"] = Float::INFINITY

    errors = BlockDocument.check(document).errors

    assert_equal [ [ "#{FIRST_WIDGET}/props/level", "finite" ] ], errors.map { |e| [ e.pointer, e.keyword ] }
  end

  test "2.0 is stored as the integer 2, so a heading never renders as h2.0" do
    document = page_document
    document["sections"][0]["children"][0]["children"][0]["props"]["level"] = 2.0

    result = BlockDocument.check(document)

    assert result.ok?
    level = result.document["sections"][0]["children"][0]["children"][0]["props"]["level"]
    assert_equal 2, level
    assert_kind_of Integer, level
  end

  test "something that is not an object is refused by the schema" do
    errors = BlockDocument.check([ 1, 2 ]).errors

    assert_equal [ [ "", "type" ] ], errors.map { |e| [ e.pointer, e.keyword ] }
  end

  test "media_refs finds every library image, in image blocks and in galleries" do
    gallery = {
      "id" => "g1", "type" => "gallery", "style" => { "base" => {} }, "children" => [],
      "props" => { "items" => [ { "mediaId" => "aaa", "alt" => "One" }, { "url" => "/a.png", "alt" => "Two" }, { "mediaId" => "bbb", "alt" => "Three" } ] }
    }
    document = page_document(widgets: [ image_block("i1", "aaa"), gallery ])

    assert_equal [
      [ "/sections/0/children/0/children/0/props/mediaId", "aaa" ],
      [ "/sections/0/children/0/children/1/props/items/0/mediaId", "aaa" ],
      [ "/sections/0/children/0/children/1/props/items/2/mediaId", "bbb" ]
    ], BlockDocument.media_refs(document)
  end

  test "a version's name or an alt text follows the schema's rule for one line" do
    assert BlockDocument::Schema.line?("Before the winter series", max: 80)
    assert_not BlockDocument::Schema.line?("two\nlines", max: 80)
    assert_not BlockDocument::Schema.line?("  ", max: 80), "only blank characters"
    assert_not BlockDocument::Schema.line?("x" * 81, max: 80)
    assert_not BlockDocument::Schema.line?(nil, max: 80)
  end
end
