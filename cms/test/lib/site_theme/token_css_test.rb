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

  test "the space above and below a section is a spacing step or a section step, on each side alone" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)

    assert_includes css, ".space-above-l { padding-top: var(--space-l); }"
    assert_includes css, ".space-below-section-s { padding-bottom: var(--section-s); }"
    assert_includes css, "  .phone-space-above-none { padding-top: var(--space-none); }"
    assert_equal 2 * 9 * 3, css.scan(/\.(?:tablet-|phone-)?space-(?:above|below)-[a-z-]+ \{ padding-(?:top|bottom): var\(--[a-z-]+\); \}/).size
    assert_no_match(/padding-block: var\(--section/, css)
  end

  test "each crop is the aspect-ratio tokens.json gives it, and original undoes a crop only as an override" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)

    assert_includes css, "\n.aspect-16-9 img { aspect-ratio: 16 / 9; object-fit: cover; }\n"
    assert_includes css, "  .tablet-aspect-1-1 img { aspect-ratio: 1 / 1; object-fit: cover; }\n"
    assert_includes css, "  .phone-aspect-original img { aspect-ratio: auto; object-fit: fill; }\n"
    assert_no_match(/^\.aspect-original/, css)
    changed = tokens
    changed["aspect"]["site"].delete("3:2")
    error = assert_raises(ArgumentError) { SiteTheme::TokenCss.generate(tokens: changed, schema: schema) }
    assert_match(/aspectToken/, error.message)
  end

  test "column widths apply on desktop only, one track per part of the preset" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)

    desktop = css[/@container site \(width >= 800px\) \{\n(?:  \.widths-.*\n)+\}/]
    assert desktop, "no desktop block of column widths"
    assert_includes desktop, ".widths-3-2 { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }"
    assert_includes desktop, ".widths-1-2-1 { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr); }"
    assert_equal 7, desktop.scan(/\.widths-/).size
    assert_equal 7, css.scan(/\.widths-/).size
  end

  test "a tablet override applies only between the phone and desktop layouts" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)

    tablet = css[/@container site \(560px <= width < 800px\) \{\n(?:  .*\n)+\}/]
    assert tablet, "no tablet block"
    assert_includes tablet, ".tablet-pad-l { padding: var(--space-l); }"
    assert_not_includes tablet, ".phone-"
  end
end
