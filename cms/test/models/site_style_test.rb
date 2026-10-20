require "test_helper"

class SiteStyleTest < ActiveSupport::TestCase
  test "until it is changed, the site style is the defaults of tokens.json" do
    style = SiteStyle.current

    assert_not style.persisted?
    assert_equal "site-signal", style.palette["primary"]
    assert_equal "balanced", style.type_scale
    assert_equal "normal", style.letter_width
    assert style.valid?
  end

  test "every slot and every choice comes from tokens.json" do
    tokens = JSON.parse(Rails.application.config.x.schema_dir.join("tokens.json").read)

    assert_equal tokens["site-tones"].keys.reject { |k| k.start_with?("$") }, SiteTokens.slots.keys
    assert_equal tokens["site-tones"]["accent"]["tones"].map { |t| t["color"] }, SiteTokens.slots["accent"].tones
    assert_equal %w[gentle balanced strong], SiteTokens.type_scales
    assert_equal %w[narrow normal wide widest], SiteTokens.letter_widths
  end

  test "a curated tone for a slot is accepted" do
    style = SiteStyle.current
    style.palette = style.palette.merge("primary" => "site-harbour")
    style.type_scale = "strong"

    assert style.save
    assert_equal "site-harbour", SiteStyle.current.palette["primary"]
  end

  test "a colour of the site's own, #rrggbb, is accepted in any slot" do
    style = SiteStyle.current
    style.palette = style.palette.merge("primary" => "#1d4e6f", "text" => "#f4f1ea", "background" => "#101418")

    assert style.save
    assert_equal [ "#1d4e6f", "#f4f1ea" ], SiteStyle.current.palette.values_at("primary", "text")
  end

  test "a tone of another slot, a colour not written #rrggbb, a missing slot or an unknown one is refused" do
    style = SiteStyle.current
    style.palette = style.palette.merge("primary" => "site-lemon", "accent" => "#FF0000", "soft" => "red").except("muted").merge("brand" => "site-sea")

    assert_not style.valid?
    assert_equal({ "palette/primary" => [ :inclusion ], "palette/accent" => [ :inclusion ], "palette/soft" => [ :inclusion ], "palette/muted" => [ :blank ], "palette/brand" => [ :unknown ] },
                 style.errors.details.transform_keys(&:to_s).transform_values { |list| list.map { |d| d[:error] } })
  end

  test "a type scale that is not one of the choices is refused" do
    style = SiteStyle.current
    style.type_scale = "huge"

    assert_not style.valid?
    assert style.errors[:type_scale].any?
  end

  test "a letter width that is not one of the choices is refused" do
    style = SiteStyle.current
    style.letter_width = "125%"

    assert_not style.valid?
    assert style.errors[:letter_width].any?
  end

  test "what is kept to be put back is a style as keepable writes it, or nothing" do
    style = SiteStyle.current
    assert_nil style.kept
    style.kept = style.keepable(Time.utc(2026, 10, 20, 9))

    assert style.valid?
    assert_equal({ "palette" => SiteTokens.default_palette, "typeScale" => "balanced", "letterWidth" => "normal", "keptAt" => "2026-10-20T09:00:00.000Z" }, style.kept)
    style.kept = { "palette" => SiteTokens.default_palette }
    assert_not style.valid?
    assert style.errors[:kept].any?
    style.kept = "the old one"
    assert_not style.valid?
  end

  test "custom CSS is kept when it keeps to the site, and refused with its line when it does not" do
    style = SiteStyle.current
    assert_equal "", style.custom_css
    style.custom_css = ".hero { color: #123456; }"

    assert style.save
    style.custom_css = ".a { color: red;\n.b { color: blue; }"
    assert_not style.valid?
    assert_equal [ "line 1: This { is not closed: end the rule with }." ], style.errors[:custom_css]
    style.custom_css = ".a { color: red; }\n@import url(/x.css);"
    assert_not style.valid?
    assert_equal [ "line 2: @import is not allowed: the page loads only its own stylesheets." ], style.errors[:custom_css]
  end
end
