require "test_helper"

class SiteIconsTest < ActiveSupport::TestCase
  SCHEMA = JSON.parse(Rails.application.config.x.schema_dir.join("block-document.schema.json").read)

  test "every icon name the schema allows has a drawing, and the sprite has no other" do
    allowed = SCHEMA.dig("$defs", "iconboxBlock", "properties", "props", "properties", "icon", "enum")

    assert_equal 8, allowed.size
    assert_equal allowed.sort, SiteIcons.names.sort
  end

  test "each drawing is on the 40-unit grid, with exactly one accent shape class in use" do
    SiteIcons.all.each do |name, icon|
      assert_equal "0 0 40 40", icon.view_box, name
      assert icon.shapes.any? { |_, attributes| attributes["class"] == "fill" }, "#{name} has no filled shape"
    end
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
