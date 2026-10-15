require "test_helper"

# Free type (FreeType): the stylesheet the CMS serves for it, byte for byte
# the editor's (builder/src/render/free-type-css.ts), on the shared cases
# of contract/free-type/; each value as the page writes it, and only those
# the schema and the rules take; the values a document's headings, texts
# and quotes hold; a block's data attributes; the address of a page's
# stylesheet.
#
#   UPDATE_GOLDEN=1 ruby bin/rails test test/models/free_type_test.rb
#
# writes contract/free-type/<case>.css again from cases.json; the editor's
# half (free-type.contract.test.ts) reads the same files.
class FreeTypeTest < ActiveSupport::TestCase
  include Documents

  CASES = Rails.root.join("..", "contract", "free-type").expand_path

  def cases = JSON.parse(CASES.join("cases.json").read).fetch("cases")

  test "the stylesheet of every shared case is its golden, byte for byte" do
    cases.each do |name, input|
      golden = CASES.join("#{name}.css")
      golden.binwrite(FreeType.css(input)) if ENV["UPDATE_GOLDEN"] == "1"
      assert_equal golden.binread, FreeType.css(input), name
    end
    assert_equal "", CASES.join("none.css").binread
  end

  test "a page's values are drawn per device on the attributes its blocks carry, a vw as a cqw, each value once" do
    css = FreeType.css(cases.fetch("blocks"))

    assert css.start_with?("#{FreeType::HEAD}\n")
    assert_includes css, %(.w[data-font-size="6vw"] { font-size: 6cqw; })
    assert_includes css, %(.w[data-font-size="2.25rem"] { font-size: 2.25rem; })
    assert_includes css, %(.w[data-font-weight="800"] { font-weight: 800; })
    assert_includes css, %(.w[data-letter-spacing="-0.02"] { letter-spacing: -0.02em; })
    assert_includes css, %(.w[data-line-height="0.95"] { line-height: 0.95; })
    assert_includes css, %(.w[data-font-stretch="62.5"] { font-stretch: 62.5%; })
    assert_includes css, %(@container site (560px <= width < 800px) {\n  .w[data-tablet-font-size="4vw"][data-tablet-font-size] { font-size: 4cqw; })
    assert_includes css, %(@container site (width < 560px) {\n  .w[data-phone-font-size="25vw"][data-phone-font-size] { font-size: 25cqw; })
    assert_equal 1, css.scan(%(.w[data-font-size="6vw"] {)).size
    assert_not_includes css, "vw;"
  end

  test "values the schema or the rules refuse, keys no block takes and devices there are none of write nothing" do
    css = FreeType.css(cases.fetch("traps"))

    [ "color: red", "calc(", "url(", "48PX", "48.50px", "08px", ".5rem", "3em", "321px", "7.99px", "0px", "26cqw", "850", "bold", "1000", "700.5",
      "0.025", "-0.11", "0.51", "0.02em\"", "1.125", "0.79", "3.01", "87.555", "62.4", "125.5", "Archivo", "data-tablet", "data-phone", "@container", "desktop" ].each do |trap|
      assert_not_includes css, trap, trap
    end
    assert_equal [ "48px", "700", "0", "0.02", "1.5", "2", "100", "87.5" ].sort, css.scan(/="([^"]+)"\]/).flatten.sort
  end

  test "a value as the page writes it: the size as the schema writes it, a weight, a number with no zero ending its decimals" do
    assert_equal "6vw", FreeType.text("fontSize", "6vw")
    assert_equal "0.5rem", FreeType.text("fontSize", "0.5rem")
    assert_equal "320px", FreeType.text("fontSize", "320px")
    assert_nil FreeType.text("fontSize", "320.01px")
    assert_nil FreeType.text("fontSize", "48.50px")
    assert_equal "700", FreeType.text("fontWeight", 700.0)
    assert_nil FreeType.text("fontWeight", 750)
    assert_equal "-0.02", FreeType.text("letterSpacing", -0.02)
    assert_equal "0", FreeType.text("letterSpacing", -0.0)
    assert_equal "0.5", FreeType.text("letterSpacing", 0.5)
    assert_nil FreeType.text("letterSpacing", 0.025)
    assert_equal "1.33", FreeType.text("lineHeight", 1.33)
    assert_equal "62.5", FreeType.text("letterWidth", 62.5)
    assert_equal "100", FreeType.text("letterWidth", 100.0)
    assert_nil FreeType.text("letterWidth", Float::INFINITY)
    assert_nil FreeType.text("color", "#1d4e6f")
  end

  test "the values of a document's headings, texts and quotes, on every device, its junk aside" do
    document = page_document(widgets: [
      heading_block("h1", "Swim").merge("style" => { "base" => { "fontSize" => "6vw", "fontWeight" => 800 }, "phone" => { "fontSize" => "32px" } }),
      heading_block("h2", "Bay").merge("style" => { "base" => { "letterSpacing" => 0.1 }, "tablet" => "junk" }),
      { "id" => "b", "type" => "button", "props" => {}, "children" => [], "style" => { "base" => { "fontSize" => "48px" } } },
      "not a block"
    ])

    found = FreeType.of_document(document)
    assert_equal [ "6vw" ], found.dig("base", "fontSize")
    assert_equal [ 800 ], found.dig("base", "fontWeight")
    assert_equal [ 0.1 ], found.dig("base", "letterSpacing")
    assert_equal [ "32px" ], found.dig("phone", "fontSize")
    assert_equal [], found.dig("tablet", "fontSize")
    assert_equal FreeType::KEYS.to_h { |key| [ key, [] ] }, FreeType.of_document(nil).fetch("base")
  end

  test "a block's free type becomes data attributes named after the property and the device, and data-style holds it" do
    style = { "base" => { "textSize" => "display", "fontSize" => "6vw", "fontWeight" => 800, "letterSpacing" => -0.02, "lineHeight" => 0.95, "letterWidth" => 80 }, "tablet" => { "fontSize" => "4vw" }, "phone" => { "fontWeight" => 700.0, "lineHeight" => 1.125 } }

    assert_equal(
      { "font-size" => "6vw", "tablet-font-size" => "4vw", "font-weight" => "800", "phone-font-weight" => "700", "letter-spacing" => "-0.02", "line-height" => "0.95", "font-stretch" => "80" },
      BlockStyle.free_type_data(style)
    )
    assert_equal "base.fontSize=6vw;base.fontWeight=800;base.letterSpacing=-0.02;base.letterWidth=80;base.lineHeight=0.95;base.textSize=display;tablet.fontSize=4vw;phone.fontWeight=700",
                 BlockStyle.data_attribute(style)
    assert_equal({}, BlockStyle.free_type_data({ "base" => { "fontSize" => "1px;color:red" } }))
    assert_equal({}, BlockStyle.free_type_data("junk"))
  end

  # The rules kept under a page's address.
  def kept(path)
    digest = path[%r{\A/type/([0-9a-f]{64})\.css\z}, 1]
    assert digest, path
    ColorSheet.find_by!(digest: digest).css
  end

  test "a page with no free type needs no stylesheet; one with some gets the address of its rules, kept once under their digest" do
    assert_nil FreeType.path([ page_document, nil ])
    sized = page_document(widgets: [ heading_block("h1", "Swim").merge("style" => { "base" => { "fontSize" => "6vw" } }) ])
    weighted = page_document(widgets: [ heading_block("h2", "Bay").merge("style" => { "base" => { "fontWeight" => 800 } }) ])
    path = FreeType.path([ sized, weighted ])

    assert_equal FreeType.css({ "base" => { "fontSize" => [ "6vw" ], "fontWeight" => [ 800 ] } }), kept(path)
    # The same values, from other documents: the same address, no second sheet.
    assert_no_difference -> { ColorSheet.count } do
      assert_equal path, FreeType.path([ weighted, sized, page_document ])
    end
  end

  test "the queries are the colours' and tokens.css's, from tokens.json's container breakpoints" do
    assert_equal FreeColors.queries, FreeType::QUERIES
  end
end
