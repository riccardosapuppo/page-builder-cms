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

  test "Gentle, Balanced and Strong give the headings three different sizes on every device" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)
    # The value a scale's rules set for a step: on desktop its first rule,
    # on tablets and phones the rule inside that device's container query.
    size = lambda do |selector, step, query|
      blocks = if query
        css.scan(/@container site \(#{Regexp.escape(query)}\) \{\n  #{Regexp.escape(selector)} \{\n(.*?)\n  \}/m)
      else
        css.scan(/^#{Regexp.escape(selector)} \{\n(.*?)\n\}/m)
      end
      blocks.flatten.filter_map { |block| block[/--fs-#{step}: (\d+)px;/, 1]&.to_i }.first
    end
    selectors = { "gentle" => %(.site[data-type-scale="gentle"] .sw), "balanced" => ".sw", "strong" => %(.site[data-type-scale="strong"] .sw) }

    { "desktop" => nil, "tablet" => "width < 800px", "phone" => "width < 560px" }.each do |device, query|
      %w[display heading-1 heading-2 heading-3].each do |step|
        gentle, balanced, strong = selectors.values.map { |selector| size.call(selector, step, query) }
        assert_operator gentle, :<, balanced, "#{step} on #{device}"
        assert_operator balanced, :<, strong, "#{step} on #{device}"
      end
    end
    assert_equal [ 37, 56, 72 ], selectors.values.map { |selector| size.call(selector, "heading-1", nil) }
    assert_equal [ 25, 33, 39 ], selectors.values.map { |selector| size.call(selector, "heading-1", "width < 560px") }
  end

  test "a type-scale choice that does not size every step is refused" do
    changed = tokens
    changed["type"]["site-strong"].delete("small")

    error = assert_raises(ArgumentError) { SiteTheme::TokenCss.generate(tokens: changed, schema: schema) }

    assert_match(/type scale strong/, error.message)
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

  test "column widths apply wherever the columns stand side by side, one track per part of the preset, a fit part as wide as its content" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)

    desktop = css[/@container site \(width >= 800px\) \{\n(?:  \.widths-.*\n)+\}/]
    assert desktop, "no desktop block of column widths"
    assert_includes desktop, ".widths-3-2 { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }"
    assert_includes desktop, ".widths-1-2-1 { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr); }"
    assert_includes desktop, ".widths-fit-1-fit { grid-template-columns: auto minmax(0, 1fr) auto; }"
    assert_equal 10, desktop.scan(/\.widths-/).size

    # Below the desktop layout, only where the section's stack keeps the
    # columns side by side: phone and never on tablets, never on phones.
    tablet = css[/@container site \(560px <= width < 800px\) \{\n(?:  \.stack-.*\n)+\}/]
    phone = css[/@container site \(width < 560px\) \{\n(?:  \.stack-.*\n)+\}/]
    assert_includes tablet, ".stack-phone.widths-fit-1, .stack-never.widths-fit-1 { grid-template-columns: auto minmax(0, 1fr); }"
    assert_includes phone, ".stack-never.widths-1-fit { grid-template-columns: minmax(0, 1fr) auto; }"
    assert_not_includes phone, ".stack-phone"
    assert_equal 10 + 20 + 10, css.scan(/\.widths-/).size
  end

  test "each letter width gives its three widths, the default's on .sw and the others' on the page root's attribute, and a heading's face is drawn at them" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)
    widths = css.scan(/^(\.sw|\.site\[data-letter-width="(\w+)"\] \.sw) \{ --stretch-display: ([\d.]+%); --stretch-strong: ([\d.]+%); --stretch-ui: ([\d.]+%); \}$/)
                .to_h { |selector, name, *three| [ name || "the default", three ] }

    assert_equal({ "the default" => %w[100% 100% 100%], "narrow" => %w[87.5% 100% 100%], "wide" => %w[112.5% 107.5% 105%], "widest" => %w[125% 115% 110%] }, widths)
    assert_includes css, %(.w.face-heading { font-family: "Archivo", "Helvetica Neue", sans-serif; font-weight: 700; font-stretch: var(--stretch-display, 100%);)
  end

  test "a letter width outside Archivo's width axis, or a default that is not a choice, is refused" do
    wider = tokens
    wider["site-letter-width"]["choices"].last["display"] = "150%"
    error = assert_raises(ArgumentError) { SiteTheme::TokenCss.generate(tokens: wider, schema: schema) }
    assert_match(/widest gives display "150%"/, error.message)

    lost = tokens
    lost["site-letter-width"]["default"] = "extra"
    error = assert_raises(ArgumentError) { SiteTheme::TokenCss.generate(tokens: lost, schema: schema) }
    assert_match(/default extra is not one of its choices/, error.message)
  end

  test "a tablet override applies only between the phone and desktop layouts" do
    css = SiteTheme::TokenCss.generate(tokens: tokens, schema: schema)

    tablet = css[/@container site \(560px <= width < 800px\) \{\n(?:  .*\n)+\}/]
    assert tablet, "no tablet block"
    assert_includes tablet, ".tablet-pad-l { padding: var(--space-l); }"
    assert_not_includes tablet, ".phone-"
  end
end
