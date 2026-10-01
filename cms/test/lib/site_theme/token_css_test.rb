require "test_helper"

class SiteTheme::TokenCssTest < ActiveSupport::TestCase
  SCHEMA_DIR = Rails.application.config.x.schema_dir

  def tokens = JSON.parse(SCHEMA_DIR.join("tokens.json").read)
  def schema = JSON.parse(SCHEMA_DIR.join("block-document.schema.json").read)

  test "the committed tokens.css is exactly what `ruby bin/rails tokens:css` writes" do
    committed = Rails.root.join(SiteTheme::TokenCss::OUTPUT).binread

    assert committed == SiteTheme::TokenCss.from_schema_dir(SCHEMA_DIR),
           "app/assets/stylesheets/tokens.css is stale: run `ruby bin/rails tokens:css` and commit the result"
  end

  test "a token changed in tokens.json makes the committed file stale" do
    changed = tokens
    changed["space"]["site"]["l"] = 25

    css = SiteTheme::TokenCss.generate(tokens: changed, schema: schema)

    assert_includes css, "--space-l: 25px;"
    assert_not_equal Rails.root.join(SiteTheme::TokenCss::OUTPUT).binread, css
  end

  test "every curated tone of a slot is reachable from the site style, by a data attribute" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)

    SiteTokens.slots.each_value do |slot|
      (slot.tones - [ slot.default ]).each do |tone|
        assert_includes css, %(.site[data-#{slot.name}="#{tone}"] { --sw-#{slot.name}: #{tokens.dig('color', tone)}; }), tone
      end
    end
  end

  test "the desktop type grows from its tablet size at 800 to its desktop size at 1280" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)

    # Display: 52 at 800 and 76 at 1280, so 12px + 5cqi (1cqi is 1% of the page).
    assert_includes css, "--fs-display: clamp(52px, 12px + 5cqi, 76px);"
    { 800 => 52, 1280 => 76 }.each { |width, size| assert_in_delta size, 12 + 5 * width / 100.0, 0.001 }
  end

  test "a step the schema names and tokens.json lacks is refused, not written as a dead class" do
    changed = schema
    changed["$defs"]["spaceToken"]["enum"] += [ "xxxl" ]

    error = assert_raises(ArgumentError) { SiteTheme::TokenCss.generate(tokens: tokens, schema: changed) }

    assert_match(/spaceToken/, error.message)
  end

  test "a tablet override applies only between the phone and desktop layouts" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)

    tablet = css[/@container site \(560px <= width < 800px\) \{\n(?:  .*\n)+\}/]
    assert tablet, "no tablet block"
    assert_includes tablet, ".tablet-pad-l { padding: var(--space-l); }"
    assert_not_includes tablet, ".phone-"
  end
end
