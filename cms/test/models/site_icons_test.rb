require "test_helper"

class SiteIconsTest < ActiveSupport::TestCase
  SCHEMA = JSON.parse(Rails.application.config.x.schema_dir.join("block-document.schema.json").read)

  # The schema's names: the site's own eight first, then Lucide's forty.
  ALLOWED = SCHEMA.dig("$defs", "iconboxBlock", "properties", "props", "properties", "icon", "enum")

  test "every icon name the schema allows has a drawing, and the sprite has no other" do
    assert_equal 48, ALLOWED.size
    assert_equal ALLOWED.sort, SiteIcons.names.sort
  end

  test "the site's eight are on the 40-unit grid, each with a shape in the accent" do
    ALLOWED.first(8).each do |name|
      icon = SiteIcons[name]
      assert_equal "0 0 40 40", icon.view_box, name
      assert icon.shapes.any? { |_, attributes| attributes["class"] == "fill" }, "#{name} has no filled shape"
    end
  end

  test "Lucide's forty are on Lucide's 24-unit grid, outlines only, with Lucide's licence beside the sprite" do
    ALLOWED.drop(8).each do |name|
      icon = SiteIcons[name]
      assert_equal "0 0 24 24", icon.view_box, name
      assert_predicate icon.shapes, :any?, name
      assert icon.shapes.none? { |_, attributes| attributes.key?("class") }, "#{name} has a shape of its own colour"
    end
    licence = SiteIcons::PATH.dirname.join("LICENSE-Lucide.txt")
    assert_predicate licence, :exist?
    assert_match(/\AISC License\n\nCopyright \(c\) for portions of Lucide/, licence.read)
  end

  test "a sprite with anything but plain shapes is refused when it loads" do
    good = %(<svg xmlns="http://www.w3.org/2000/svg"><symbol id="a" viewBox="0 0 40 40"><path d="M0 0h1"/></symbol></svg>)
    assert_equal [ "a" ], SiteIcons.load(good).keys

    {
      "a script" => %(<svg xmlns="http://www.w3.org/2000/svg"><symbol id="a" viewBox="0 0 40 40"><script>alert(1)</script></symbol></svg>),
      "an event attribute" => %(<svg xmlns="http://www.w3.org/2000/svg"><symbol id="a" viewBox="0 0 40 40"><path d="M0 0" onclick="x()"/></symbol></svg>),
      "a style" => %(<svg xmlns="http://www.w3.org/2000/svg"><symbol id="a" viewBox="0 0 40 40"><path d="M0 0" style="fill:red"/></symbol></svg>),
      "a link" => %(<svg xmlns="http://www.w3.org/2000/svg"><symbol id="a" viewBox="0 0 40 40"><a href="https://x.example"><path d="M0 0"/></a></symbol></svg>),
      "a class the page does not style" => %(<svg xmlns="http://www.w3.org/2000/svg"><symbol id="a" viewBox="0 0 40 40"><path class="loud" d="M0 0"/></symbol></svg>),
      "something beside the symbols" => %(<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>),
      "an attribute on a symbol" => %(<svg xmlns="http://www.w3.org/2000/svg"><symbol id="a" viewBox="0 0 40 40" onload="x()"><path d="M0 0"/></symbol></svg>)
    }.each do |what, text|
      assert_raises(SiteIcons::Invalid, what) { SiteIcons.load(text) }
    end
  end
end
