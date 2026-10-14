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
    assert_equal "normal", json["letterWidth"]
    assert_equal "", json["customCss"]
    assert_nil json["updatedAt"]
    assert_equal [ [ "site-signal", "Signal", "#C2352B" ], [ "site-sea", "Sea", "#1E5B4C" ], [ "site-harbour", "Harbour", "#1D4E6F" ], [ "site-kelp", "Kelp", "#3B5A23" ], [ "site-basalt", "Basalt", "#4A4F57" ] ],
                 json.dig("choices", "palette", "primary").map { |t| t.values_at("color", "label", "hex") }
    assert_equal %w[gentle balanced strong], json.dig("choices", "typeScales").map { |c| c["name"] }
    assert_equal [ %w[narrow Narrow], %w[normal Normal], %w[wide Wide], %w[widest Widest] ], json.dig("choices", "letterWidths").map { |c| c.values_at("name", "label") }
  end

  test "a letter width is accepted and stays; a change that does not name one keeps it" do
    api :put, "/api/site-style", { "palette" => palette, "typeScale" => "balanced", "letterWidth" => "widest" }

    assert_response :ok
    assert_equal "widest", json["letterWidth"]
    api :put, "/api/site-style", { "palette" => palette(primary: "site-harbour"), "typeScale" => "balanced" }
    assert_response :ok
    api :get, "/api/site-style"
    assert_equal [ "site-harbour", "widest" ], [ json.dig("palette", "primary"), json["letterWidth"] ]
  end

  test "a curated tone and a type-scale choice are accepted, and stay" do
    api :put, "/api/site-style", { "palette" => palette(primary: "site-harbour", accent: "site-lemon"), "typeScale" => "strong" }

    assert_response :ok
    api :get, "/api/site-style"
    assert_equal [ "site-harbour", "site-lemon", "strong" ], [ json.dig("palette", "primary"), json.dig("palette", "accent"), json["typeScale"] ]
  end

  test "a colour of the site's own is accepted in a slot, and stays" do
    api :put, "/api/site-style", { "palette" => palette(primary: "#2f6f5e", soft: "#e9f2ef"), "typeScale" => "balanced" }

    assert_response :ok
    api :get, "/api/site-style"
    assert_equal [ "#2f6f5e", "#e9f2ef" ], [ json.dig("palette", "primary"), json.dig("palette", "soft") ]
  end

  test "anything that is not a curated value or a colour as #rrggbb is refused, each at its place" do
    api :put, "/api/site-style", { "palette" => palette(primary: "#FF0000").except("muted").merge("brand" => "site-sea"), "typeScale" => "huge", "letterWidth" => "95%" }

    assert_response :unprocessable_content
    assert_equal [ [ "/palette/primary", "inclusion" ], [ "/palette/muted", "blank" ], [ "/palette/brand", "unknown" ], [ "/typeScale", "inclusion" ], [ "/letterWidth", "inclusion" ] ],
                 error_pointers
    api :get, "/api/site-style"
    assert_equal "site-signal", json.dig("palette", "primary")
  end

  test "a tone of another slot is refused" do
    api :put, "/api/site-style", { "palette" => palette(text: "site-paper"), "typeScale" => "balanced" }

    assert_response :unprocessable_content
    assert_equal [ [ "/palette/text", "inclusion" ] ], error_pointers
  end

  test "the site's custom CSS is kept and stays; a change that does not name it keeps it, and \"\" takes it out" do
    css = ".hero { letter-spacing: .02em; }\n.price::after { content: \"}\"; }"
    api :put, "/api/site-style", { "palette" => palette, "typeScale" => "balanced", "customCss" => css }

    assert_response :ok
    assert_equal css, json["customCss"]
    api :put, "/api/site-style", { "palette" => palette(primary: "site-harbour"), "typeScale" => "balanced" }
    api :get, "/api/site-style"
    assert_equal css, json["customCss"]
    api :put, "/api/site-style", { "palette" => palette, "typeScale" => "balanced", "customCss" => "" }
    assert_equal "", json["customCss"]
  end

  test "custom CSS that does not keep to the site is refused at /customCss, with its line, and the style keeps its own" do
    api :put, "/api/site-style", { "palette" => palette, "typeScale" => "balanced", "customCss" => ".a { color: red; }" }
    api :put, "/api/site-style", { "palette" => palette, "typeScale" => "balanced", "customCss" => ".a { color: red; }\n}\nbody { display: none; }" }

    assert_response :unprocessable_content
    assert_equal [ [ "/customCss", "invalid" ] ], error_pointers
    assert_equal "line 2: This } closes nothing.", json.fetch("errors").first["message"]
    api :put, "/api/site-style", { "palette" => palette, "typeScale" => "balanced", "customCss" => 7 }
    assert_response :unprocessable_content
    assert_equal [ [ "/customCss", "type" ] ], error_pointers
    api :get, "/api/site-style"
    assert_equal ".a { color: red; }", json["customCss"]
  end
end
