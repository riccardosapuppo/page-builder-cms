require "test_helper"

# Custom CSS checked before it is kept (CustomCss), on the cases the editor's
# check reads too (contract/custom-css/cases.json): the problem each case
# has, or none, the same on both sides; and the stylesheet drawn inside the
# site.
class CustomCssTest < ActiveSupport::TestCase
  CASES = Rails.root.join("..", "contract", "custom-css", "cases.json").expand_path

  test "every shared case finds the problem the editor finds, or none" do
    cases = JSON.parse(CASES.read).fetch("cases")

    assert_operator cases.size, :>, 15
    cases.each do |each|
      css = each["css"] || (each.dig("repeat", "text") * each.dig("repeat", "times"))
      expected = each["problem"] && CustomCss::Problem.new(message: each["problem"]["message"], line: each["problem"]["line"])
      if expected
        assert_equal expected, CustomCss.check(css), each["name"]
      else
        assert_nil CustomCss.check(css), each["name"]
      end
    end
  end

  test "the stylesheet is drawn inside the site, and nothing for none" do
    assert_equal "@scope (.site) {\n.a { color: red; }\n}\n", CustomCss.scoped("  .a { color: red; }\n")
    assert_equal "", CustomCss.scoped(" \n ")
    assert_equal "", CustomCss.scoped(nil)
  end

  test "a stylesheet's version is the start of its SHA-256, the same bytes the same version" do
    scoped = CustomCss.scoped(".a { color: red; }")

    assert_equal Digest::SHA256.hexdigest(scoped)[0, 16], CustomCss.digest(scoped)
    assert_match(/\A[0-9a-f]{16}\z/, CustomCss.digest(""))
    assert_not_equal CustomCss.digest(scoped), CustomCss.digest(CustomCss.scoped(".a { color: blue; }"))
  end
end
