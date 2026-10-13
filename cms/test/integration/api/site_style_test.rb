require "test_helper"

class Api::SiteStyleTest < ActionDispatch::IntegrationTest
  def palette(**changes)
    SiteTokens.default_palette.merge(changes.transform_keys(&:to_s))
  end

  test "until it is changed, the site style is the defaults, with the values each part may take" do
    api :get, "/api/site-style"

    assert_response :ok
    assert_equal "site-signal", json.dig("palette", "primary")
    assert_equal "balanced", json["typeScale"]
    assert_nil json["updatedAt"]
    assert_equal [ [ "site-signal", "Signal", "#C2352B" ], [ "site-sea", "Sea", "#1E5B4C" ], [ "site-harbour", "Harbour", "#1D4E6F" ], [ "site-kelp", "Kelp", "#3B5A23" ], [ "site-basalt", "Basalt", "#4A4F57" ] ],
                 json.dig("choices", "palette", "primary").map { |t| t.values_at("color", "label", "hex") }
    assert_equal %w[gentle balanced strong], json.dig("choices", "typeScales").map { |c| c["name"] }
  end

  test "a curated tone and a type-scale choice are accepted, and stay" do
    api :put, "/api/site-style", { "palette" => palette(primary: "site-harbour", accent: "site-lemon"), "typeScale" => "strong" }

    assert_response :ok
    api :get, "/api/site-style"
    assert_equal [ "site-harbour", "site-lemon", "strong" ], [ json.dig("palette", "primary"), json.dig("palette", "accent"), json["typeScale"] ]
  end

  test "anything that is not a curated value is refused, each at its place" do
    api :put, "/api/site-style", { "palette" => palette(primary: "#ff0000").except("muted").merge("brand" => "site-sea"), "typeScale" => "huge" }

    assert_response :unprocessable_content
    assert_equal [ [ "/palette/primary", "inclusion" ], [ "/palette/muted", "blank" ], [ "/palette/brand", "unknown" ], [ "/typeScale", "inclusion" ] ],
                 error_pointers
    api :get, "/api/site-style"
    assert_equal "site-signal", json.dig("palette", "primary")
  end

  test "a tone of another slot is refused" do
    api :put, "/api/site-style", { "palette" => palette(text: "site-paper"), "typeScale" => "balanced" }

    assert_response :unprocessable_content
    assert_equal [ [ "/palette/text", "inclusion" ] ], error_pointers
  end
end
