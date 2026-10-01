require "test_helper"

class SiteStyleTest < ActiveSupport::TestCase
  test "until it is changed, the site style is the defaults of tokens.json" do
    style = SiteStyle.current

    assert_not style.persisted?
    assert_equal "site-sea", style.palette["primary"]
    assert_equal "balanced", style.type_scale
    assert style.valid?
  end

  test "every slot and every choice comes from tokens.json" do
    tokens = JSON.parse(Rails.application.config.x.schema_dir.join("tokens.json").read)

    assert_equal tokens["site-tones"].keys.reject { |k| k.start_with?("$") }, SiteTokens.slots.keys
    assert_equal tokens["site-tones"]["accent"]["tones"].map { |t| t["color"] }, SiteTokens.slots["accent"].tones
    assert_equal %w[gentle balanced strong], SiteTokens.type_scales
  end

  test "a curated tone for a slot is accepted" do
    style = SiteStyle.current
    style.palette = style.palette.merge("primary" => "site-harbour")
    style.type_scale = "strong"

    assert style.save
    assert_equal "site-harbour", SiteStyle.current.palette["primary"]
  end

  test "a tone of another slot, a free colour, a missing slot or an unknown one is refused" do
    style = SiteStyle.current
    style.palette = style.palette.merge("primary" => "site-lemon", "accent" => "#ff0000").except("muted").merge("brand" => "site-sea")

    assert_not style.valid?
    assert_equal({ "palette/primary" => [ :inclusion ], "palette/accent" => [ :inclusion ], "palette/muted" => [ :blank ], "palette/brand" => [ :unknown ] },
                 style.errors.details.transform_keys(&:to_s).transform_values { |list| list.map { |d| d[:error] } })
  end

  test "a type scale that is not one of the choices is refused" do
    style = SiteStyle.current
    style.type_scale = "huge"

    assert_not style.valid?
    assert style.errors[:type_scale].any?
  end
end
