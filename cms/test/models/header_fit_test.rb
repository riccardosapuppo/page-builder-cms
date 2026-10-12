require "test_helper"

# Where a menu's links fold, from the widths of their letters. That the
# widths are right, and that the links then fit the block where they are
# shown, is measured in Chromium by tools/header-metrics.ts and by the
# production check (tools/lib/header-checks.ts); here, the sums and the
# steps.
class HeaderFitTest < ActiveSupport::TestCase
  DESIGN = [ "Swims", "Gallery", "Meet us", "Questions" ].freeze

  test "the design's four links need 327 px, so they fold in a block narrower than 360" do
    assert_in_delta 327, HeaderFit.width_needed(DESIGN), 1
    assert_equal "360", HeaderFit.menu_fold(DESIGN)
  end

  test "the row is every label and a gap between two: one link more is its word and a gap more" do
    link = HeaderFit.metrics["link"]
    more = HeaderFit.width_needed(DESIGN + [ "Contact" ]) - HeaderFit.width_needed(DESIGN)

    assert_in_delta HeaderFit.run(link, "Contact") + link["gap"], more, 0.001
    assert_equal 28, link["gap"]
  end

  # Each "Timetable" is about 76 px, and a gap 28: each count of them lands
  # on the step of 40 px that holds it (8 need 804 px, 11 need 1116), until
  # no step does.
  test "the step is the narrowest that holds the row, each in turn, and a row no step holds folds at every width" do
    folds = [ 1, 2, 4, 8, 11, 12 ].map { |n| HeaderFit.menu_fold(Array.new(n) { "Timetable" }) }

    assert_in_delta 75.8, HeaderFit.run(HeaderFit.metrics["link"], "Timetable"), 0.1
    assert_equal %w[80 200 400 840 1120 all], folds
    assert_equal "all", HeaderFit.menu_fold(Array.new(12) { "W" * 40 })
  end

  test "a menu with no link has nothing to fold" do
    assert_nil HeaderFit.menu_fold([])
  end

  # What nothing measured is drawn at is anyone's guess: a symbol, an emoji,
  # a ligature. It counts wider than any letter of the face, so such words
  # fold early rather than late.
  test "a character neither the face nor a script has a measure for counts 1.5 times the font size, wider than any letter of the face" do
    link = HeaderFit.metrics["link"]

    assert_equal link["size"] * 1.5, link["otherwise"]
    assert_operator link["otherwise"], :>, link["advances"].values.max
    [ "🌊", "\u{FDFD}", "→", "΅", "Ϗ" ].each do |character|
      assert_equal link["otherwise"], HeaderFit.advance(link, character), character
    end
  end

  # The face is a Latin subset: a letter of another script is drawn by the
  # fonts the browser falls back to, which tools/header-metrics.ts drew in
  # Chromium, at their widest of four.
  test "the letters of the scripts the file measured count what they were drawn at, less than a character nothing measured" do
    link = HeaderFit.metrics["link"]

    assert_equal %w[Greek Cyrillic Hebrew Arabic CJK], link["scripts"].map { |script| script["name"] }
    link["scripts"].each do |script|
      assert_operator script["advance"], :>, 0, script["name"]
      assert_operator script["advance"], :<, link["otherwise"], script["name"]
      assert_equal script["advance"], script["letters"].values.max, script["name"] unless script["letters"].empty?
    end

    scripts = link["scripts"].index_by { |script| script["name"] }
    # Greek, Cyrillic, Hebrew and Arabic list each of their letters: a letter counts its own width.
    { "Greek" => "Ω", "Cyrillic" => "Щ", "Hebrew" => "ש", "Arabic" => "ض" }.each do |name, letter|
      assert_equal scripts[name]["letters"].fetch(letter), HeaderFit.advance(link, letter), name
    end
    # A code point of a script's range that is no letter listed (an
    # unassigned one) counts the script's widest, and CJK, which lists none,
    # counts it for every ideograph, kana, Hangul syllable and fullwidth form.
    assert_equal scripts["Greek"]["advance"], HeaderFit.advance(link, "΋")
    [ "日", "本", "の", "한", "！", "　" ].each { |character| assert_equal scripts["CJK"]["advance"], HeaderFit.advance(link, character), character }
    assert_operator scripts["CJK"]["advance"], :<, link["otherwise"]
  end

  # A visitor reads a Hebrew, Greek, Cyrillic, Arabic or Japanese menu as
  # short as it is: four links whose letters are no wider than the design's
  # fold no later than the design's do (360). Counted at 1.5 em each, the
  # Greek and Cyrillic ones would need 720 px and fold below 720.
  test "short menus in Hebrew, Greek, Cyrillic, Arabic and Japanese fold no later than the design's four links" do
    menus = {
      "Hebrew" => [ "שחייה", "גלריה", "עלינו", "שאלות" ],
      "Greek" => [ "Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις" ],
      "Cyrillic" => [ "Заплывы", "Галерея", "Встречи", "Вопросы" ],
      "Arabic" => [ "السباحة", "المعرض", "لقاء", "أسئلة" ],
      "CJK" => [ "泳ぎ方", "写真", "会合", "質問" ]
    }

    folds = menus.transform_values { |labels| HeaderFit.menu_fold(labels) }
    assert_equal({ "Hebrew" => "240", "Greek" => "360", "Cyrillic" => "360", "Arabic" => "280", "CJK" => "240" }, folds)
  end

  test "a combining accent adds nothing to its letter, as the face draws it" do
    link = HeaderFit.metrics["link"]

    assert_in_delta HeaderFit.run(link, "Cafe"), HeaderFit.run(link, "Café"), 0.001
  end

  test "the steps the file folds at are the ones site.css gives data-fold, and site.css has a rule for every step" do
    css = Rails.root.join("app", "assets", "stylesheets", "site.css").read
    rows = css.scan(/@container menu \(width < (\d+)px\) \{ \.w-menu\[data-fold="\1"\] \.w-menu-links \{ display: none; \}/).flatten.map(&:to_i)
    folds = css.scan(/\.w-menu\[data-fold="(\d+)"\] \.w-menu-fold \{ display: block; \}/).flatten.map(&:to_i)
    steps = HeaderFit.metrics["fold"]["steps"]

    assert_equal (80..1120).step(40).to_a, steps
    assert_equal steps, rows
    assert_equal steps, folds
    assert_includes css, '.w-menu[data-fold="all"] .w-menu-links { display: none; }'
    assert_includes css, '.w-menu[data-fold="all"] .w-menu-fold { display: block; }'
  end
end
