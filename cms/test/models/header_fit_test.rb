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
    assert_equal "1120", HeaderFit.fold(site(menu: menu, name: "The Northfield Swimming Club"))
    assert_nil HeaderFit.fold(site(menu: menu, action: nil))
  end

  test "with no links there is nothing to fold, whatever the name" do
    assert_nil HeaderFit.fold(site(menu: [], name: "W" * 28))
  end

  test "a letter the face lacks counts wider than any it has, so words in another script fold no later than Latin ones" do
    latin = HeaderFit.run(HeaderFit.metrics["link"], "abcdef")
    other = HeaderFit.run(HeaderFit.metrics["link"], "日本語の案内")
    widest = HeaderFit.metrics["link"]["advances"].values.max

    assert_operator HeaderFit.metrics["link"]["otherwise"], :>, widest
    assert_operator other, :>, latin
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
