require "test_helper"

# Where the header's links fold, from the widths of their letters. That
# the widths are right, and that the links then fit the bar where they are
# shown, is measured in Chromium by tools/header-metrics.ts and by the
# production check (tools/lib/header-checks.ts); here, the sums and the
# steps.
class HeaderFitTest < ActiveSupport::TestCase
  def site(**changes)
    Site.new(id: Site::ID, revision: 1, **Site.defaults.merge(changes.transform_keys(&:to_s)).symbolize_keys)
  end

  def links(*labels) = labels.map { |label| { "label" => label, "href" => "/" } }

  test "the design's own header fits the bar from 800 up, so it names no fold, with 39 px to spare" do
    needed = HeaderFit.width_needed(Site.current)

    assert_nil HeaderFit.fold(Site.current)
    assert_in_delta 761, needed, 1
  end

  test "a fifth link needs a wider bar: the links fold below the next width site.css has" do
    assert_equal "880", HeaderFit.fold(site(menu: Site.defaults["menu"] + links("Contact")))
  end

  # One more link of 9 letters is about 104 px more bar: each count of them
  # lands on the next width, until no bar holds them.
  test "the step is the narrowest width that holds the bar, each in turn, and a menu no bar holds folds at every width" do
    folds = [ 1, 3, 4, 5, 6, 7, 8, 9 ].map { |n| HeaderFit.fold(site(menu: links(*Array.new(n) { "Timetable" }))) }

    assert_equal [ nil, nil, "880", "960", "1040", "1200", "1248", "all" ], folds
    assert_equal "all", HeaderFit.fold(site(menu: links(*Array.new(8) { "W" * 24 })))
  end

  test "the name and the button count too: the same links fold sooner beside a longer name, and later with no button" do
    menu = Site.defaults["menu"] + links("Contact")

    assert_equal "880", HeaderFit.fold(site(menu: menu))
    assert_equal "1120", HeaderFit.fold(site(menu: menu, name: "The Sea Thrift Swimming Club"))
    assert_nil HeaderFit.fold(site(menu: menu, action: nil))
  end

  test "with no links there is nothing to fold, whatever the name" do
    assert_nil HeaderFit.fold(site(menu: [], name: "W" * 28))
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
  # Chromium, at their widest of four, in each of the three places.
  test "the letters of the scripts the file measured count what they were drawn at, less than a character nothing measured" do
    places = HeaderFit.metrics.values_at("brand", "link", "button")

    places.each do |place|
      assert_equal %w[Greek Cyrillic Hebrew Arabic CJK], place["scripts"].map { |script| script["name"] }
      place["scripts"].each do |script|
        assert_operator script["advance"], :>, 0, script["name"]
        assert_operator script["advance"], :<, place["otherwise"], script["name"]
        assert_equal script["advance"], script["letters"].values.max, script["name"] unless script["letters"].empty?
      end
    end

    link = HeaderFit.metrics["link"]
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

  # A visitor reads the Hebrew, Greek, Cyrillic or Arabic header as short
  # as it is: the same four links, a name and a button, whose letters are no
  # wider than a Latin header's, keep their links in the bar from the
  # design's 800 up, as the design's own header does. Counted at 1.5 em each
  # they folded the Hebrew one below 1200 and the Greek one at every width.
  test "short headers in Hebrew, Greek, Cyrillic and Arabic keep their links in the bar from 800 up, as the design's does" do
    headers = {
      "Hebrew" => site(name: "מים שקטים", menu: links("שחייה", "גלריה", "עלינו", "שאלות"), action: { "label" => "הצטרפו", "href" => "/" }),
      "Greek" => site(name: "Ήρεμα νερά", menu: links("Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις"), action: { "label" => "Γραφτείτε", "href" => "/" }),
      "Cyrillic" => site(name: "Тихая вода", menu: links("Заплывы", "Галерея", "Встречи", "Вопросы"), action: { "label" => "Вступить", "href" => "/" }),
      "Arabic" => site(name: "المياه الهادئة", menu: links("السباحة", "المعرض", "لقاء", "أسئلة"), action: { "label" => "انضم", "href" => "/" }),
      "CJK" => site(name: "潮の会", menu: links("泳ぎ方", "写真", "会合", "質問"), action: { "label" => "参加する", "href" => "/" })
    }

    headers.each do |name, header|
      assert_nil HeaderFit.fold(header), name
      assert_operator HeaderFit.width_needed(header), :<=, HeaderFit.metrics["fold"]["breakpoint"], name
    end
  end

  test "a longer menu in another script folds below the width its letters need, and one no bar holds folds at every width" do
    greek = site(name: "Ήρεμα νερά", menu: links("Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις", "Επικοινωνία", "Τιμές"), action: { "label" => "Γραφτείτε", "href" => "/" })
    cjk = site(name: "潮の会", menu: links(*Array.new(8) { "日本語の案内です" }), action: nil)

    assert_equal "1040", HeaderFit.fold(greek)
    assert_equal "all", HeaderFit.fold(cjk)
  end

  test "a combining accent adds nothing to its letter, as the face draws it" do
    plain = HeaderFit.run(HeaderFit.metrics["brand"], "Cafe")
    accented = HeaderFit.run(HeaderFit.metrics["brand"], "Café")

    assert_in_delta plain, accented, 0.001
  end

  test "the widths the file folds at are the ones site.css gives data-fold, and site.css has a rule for every width" do
    css = Rails.root.join("app", "assets", "stylesheets", "site.css").read
    widths = css.scan(/\.sw-header\[data-fold="(\d+)"\] \.sw-nav-links \{ display: none; \}/).flatten.map(&:to_i)
    menus = css.scan(/\.sw-header\[data-fold="(\d+)"\] \.sw-menu \{ display: block; \}/).flatten.map(&:to_i)
    fold = HeaderFit.metrics["fold"]

    assert_equal fold["steps"], widths
    assert_equal fold["steps"], menus
    assert_includes css, '.sw-header[data-fold="all"] .sw-nav-links { display: none; }'
    assert_equal [ 800, 1248 ], [ fold["breakpoint"], fold["widest"] ]
  end
end
