require "test_helper"

# Free colours (FreeColors): the stylesheet the CMS serves for them, byte for
# byte the editor's (builder/src/render/free-colors-css.ts), on the shared
# cases of contract/free-colors/; the text a free background pairs with;
# the colours a document names; the address of a page's stylesheet.
#
#   UPDATE_GOLDEN=1 ruby bin/rails test test/models/free_colors_test.rb
#
# writes contract/free-colors/<case>.css again from cases.json; the editor's
# half (free-colors.contract.test.ts) reads the same files.
class FreeColorsTest < ActiveSupport::TestCase
  include Documents

  CASES = Rails.root.join("..", "contract", "free-colors").expand_path

  def cases = JSON.parse(CASES.join("cases.json").read).fetch("cases")

  def stylesheet(input)
    FreeColors.css(text: input.fetch("text"), background: input.fetch("background"), slots: input.fetch("slots"), colors: input.fetch("colors"))
  end

  test "the stylesheet of every shared case is its golden, byte for byte" do
    cases.each do |name, input|
      golden = CASES.join("#{name}.css")
      golden.binwrite(stylesheet(input)) if ENV["UPDATE_GOLDEN"] == "1"
      assert_equal golden.binread, stylesheet(input), name
    end
    assert_equal "", CASES.join("none.css").binread
  end

  test "colours no page writes, a slot no palette has and values of the wrong kind are left out" do
    css = stylesheet(cases.fetch("traps"))

    assert_includes css, %([data-bg="#abcdef"])
    assert_includes css, %(.site[data-soft="#e6efea"] { --sw-soft: #e6efea; })
    assert_equal 1, css.scan(%([data-bg="#abcdef"] {)).size
    [ "#FFFFFF", "#12345g", "data-accent", "data-primary", "bogus", "#000\"", "color: red", "data-text" ].each { |trap| assert_not_includes css, trap }
  end

  test "a free background is drawn with the site's tone that reads better on it" do
    site = { text: "#0e2a35", background: "#ffffff" }

    assert_equal "dark", FreeColors.pairing("#3b2f5c", **site)
    assert_equal "ink", FreeColors.pairing("#e9dcc3", **site)
    assert_equal "ink", FreeColors.pairing("#f2c94c", **site)
    css = FreeColors.css(**site, slots: {}, colors: [ "#3b2f5c" ])
    assert_includes css, %([data-bg="#3b2f5c"] { background-color: #3b2f5c; color: var(--sw-background);)
    assert_includes css, %([data-bg="#3b2f5c"] > * { --ring-color: var(--sw-background); })
  end

  test "WCAG's contrast ratio, from 1 to 21" do
    assert_in_delta 21.0, FreeColors.contrast("#000000", "#ffffff"), 0.001
    assert_in_delta 1.0, FreeColors.contrast("#777777", "#777777"), 0.001
    assert_in_delta 4.48, FreeColors.contrast("#777777", "#ffffff"), 0.01
  end

  test "the free colours a document names, as a background or a colour, on any device, its junk aside" do
    document = page_document(widgets: [
      heading_block("h1", "Swim").merge("style" => { "base" => { "color" => "#1d4e6f" }, "phone" => { "color" => "#c2352b" } }),
      heading_block("h2", "Bay").merge("style" => { "base" => { "color" => "primary", "background" => "#FFFFFF" }, "tablet" => "junk" }),
      "not a block"
    ])
    document["sections"][0]["style"] = { "base" => { "background" => "#e9dcc3" } }

    assert_equal [ "#e9dcc3", "#1d4e6f", "#c2352b" ], FreeColors.of_document(document)
    assert_equal [], FreeColors.of_document(nil)
    assert_equal [], FreeColors.of_document({ "sections" => "nope" })
  end

  test "a block's free colours become data attributes named by family and device, its slots stay classes" do
    style = { "base" => { "background" => "#e9dcc3", "color" => "primary" }, "tablet" => { "background" => "soft", "color" => "#1d4e6f" }, "phone" => { "color" => "#c2352b" } }

    assert_equal({ "bg" => "#e9dcc3" }, BlockStyle.free_color_data(style, "background"))
    assert_equal({ "tablet-fg" => "#1d4e6f", "phone-fg" => "#c2352b" }, BlockStyle.free_color_data(style, "color"))
    assert_equal({ "tablet-line" => "#1d4e6f", "phone-line" => "#c2352b" }, BlockStyle.free_color_data(style, "color", family: "line"))
    assert_equal({}, BlockStyle.free_color_data({ "base" => { "background" => "#E9DCC3" } }, "background"))
    assert_equal({}, BlockStyle.free_color_data("junk", "background"))
  end

  # The rules kept under a page's address.
  def kept(path)
    digest = path[%r{\A/colors/([0-9a-f]{64})\.css\z}, 1]
    assert digest, path
    ColorSheet.find_by!(digest: digest).css
  end

  test "a page with no free colour needs no stylesheet; one with some gets the address of its rules, kept once under their digest" do
    style = SiteStyle.current
    plain = page_document

    assert_nil FreeColors.path(style, [ plain, nil ])
    coloured = page_document(widgets: [ heading_block("h1", "Swim").merge("style" => { "base" => { "color" => "#c2352b", "background" => "#1d4e6f" } }) ])
    bay = page_document(widgets: [ heading_block("h2", "Bay").merge("style" => { "base" => { "color" => "#1d4e6f" } }) ])
    path = FreeColors.path(style, [ coloured, bay ])

    assert_equal FreeColors.css(text: "#0e2a35", background: "#ffffff", slots: {}, colors: %w[#1d4e6f #c2352b]), kept(path)
    # The same colours, from other documents: the same address, no second sheet.
    assert_no_difference -> { ColorSheet.count } do
      assert_equal path, FreeColors.path(style, [ bay, coloured, plain ])
    end
  end

  test "Site style's own tones go in the rules by slot, and its Text and Background pair the free backgrounds" do
    style = SiteStyle.current
    style.palette = style.palette.merge("primary" => "#1d4e6f", "text" => "#f4f1ea", "background" => "#101418")

    assert_equal FreeColors.css(text: "#f4f1ea", background: "#101418", slots: { "text" => "#f4f1ea", "background" => "#101418", "primary" => "#1d4e6f" }, colors: []), kept(FreeColors.path(style, [ page_document ]))
  end
end
