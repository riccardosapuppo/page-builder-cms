require "test_helper"

class RenderPolicyTest < ActiveSupport::TestCase
  test "a className gives the names that are class names and not the theme's, in order, once each" do
    assert_equal %w[hero big], RenderPolicy.classes("hero big hero")
    assert_equal %w[hero big], RenderPolicy.classes("hero  big")
    assert_equal %w[hero], RenderPolicy.classes("sw-btn hero Hide-desktop sec fill")
    assert_equal [], RenderPolicy.classes("2col hero! café a	b")
    [ nil, 1, {}, [], "" ].each { |value| assert_equal [], RenderPolicy.classes(value), value.inspect }
  end

  test "the links a visitor may follow are kept as written" do
    [
      "https://example.com", "https://tide.example.org:8443/times?day=1&tz=UTC#now", "http://example.com/a",
      "mailto:club@example.org", "mailto:club@example.org?subject=Trial%20swim", "tel:+44-20-7946-0958",
      "/winter", "/", "/a/b?c=d#e", "?season=winter", "#join", "/caf%C3%A9"
    ].each do |href|
      assert_equal href, RenderPolicy.link_href(href), href
    end
  end

  test "an address that runs script, reaches another site in disguise or hides a control character is dropped" do
    [
      "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)",
      "javascript&colon;alert(4)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)",
      "//evil.example/x", "/\\evil.example", "https://user@evil.example/", "https://evil.example\nhttps://ok.example",
      "https://ok.example/ ", "HTTPS://example.com", "ftp://files.example.com/a.txt", "https://exa mple.com",
      "tel:٠١٢", "/a\"onmouseover=\"x", "", nil, 42, { "href" => "/" }, "/#{'a' * 2048}"
    ].each do |href|
      assert_nil RenderPolicy.link_href(href), href.inspect
    end
  end

  test "an image from another site must be https, or a path of this one" do
    assert_equal "https://images.example.org/a.jpg", RenderPolicy.image_src("https://images.example.org/a.jpg")
    assert_equal "/uploads/a.png", RenderPolicy.image_src("/uploads/a.png")
    [ "http://images.example.org/a.jpg", "data:image/png;base64,AAAA", "//images.example.org/a.jpg", "/", "javascript:alert(1)" ].each do |src|
      assert_nil RenderPolicy.image_src(src), src
    end
  end

  test "a player address is built from a known provider and an id of its shape, never taken from the document" do
    assert_equal "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE", RenderPolicy.video_src("youtube", "M7lc1UVf-VE")
    assert_equal "https://player.vimeo.com/video/76979871?dnt=1", RenderPolicy.video_src("vimeo", "76979871")
    [ %w[youtube short], [ "youtube", "M7lc1UVf-VE\n" ], %w[vimeo abc], [ "dailymotion", "x7tgad0" ], [ "youtube", nil ] ].each do |provider, id|
      assert_nil RenderPolicy.video_src(provider, id), [ provider, id ].inspect
    end
  end

  test "a map address frames the point at its zoom, with six decimals and a marker on it" do
    src = RenderPolicy.map_src(54.5, -3.25, 15)

    # At zoom 15 a 256-pixel tile spans 360 / 2^15 degrees of longitude, so
    # 400 pixels either side are 0.0171661 degrees; 225 pixels up and down
    # (a 16:9 area), shrunk by cos(54.5 degrees) = 0.5807030, are 0.0056072
    # degrees.
    assert_equal "https://www.openstreetmap.org/export/embed.html?bbox=-3.267166%2C54.494393%2C-3.232834%2C54.505607&layer=mapnik&marker=54.500000%2C-3.250000", src
    # Zoomed all the way out, the area stops at the edges of the map.
    assert_equal "https://www.openstreetmap.org/export/embed.html?bbox=-180.000000%2C-85.000000%2C180.000000%2C85.000000&layer=mapnik&marker=0.000000%2C0.000000",
                 RenderPolicy.map_src(0, 0, 1)
    assert_nil RenderPolicy.map_src(91, 0, 10)
    assert_nil RenderPolicy.map_src(0, 0, 20)
    assert_nil RenderPolicy.map_src(Float::INFINITY, 0, 10)
    assert_nil RenderPolicy.map_src(0, 0, 10.5)
    assert_nil RenderPolicy.map_src("54.5", 0, 10)
  end

  test "a sticky header's rows: a column's blocks, three for a tall one; a section's tallest column, or all where they stack; at most 9" do
    section = ->(columns, stack = nil) { { "props" => stack ? { "stack" => stack } : {}, "children" => Array.new(columns) { {} } } }
    assert_equal "1 1 1", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ section.(3, "never") ] })
    assert_equal "1 2 2", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ section.(2) ] })
    assert_equal "1 1 3", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ section.(3, "phone") ] })
    assert_equal "3 4 4", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ section.(1), section.(3, "never"), section.(2) ] })
    assert_equal "3 9 9", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ section.(4), section.(4), section.(1) ] })
    holding = ->(stack, *columns) { { "props" => stack ? { "stack" => stack } : {}, "children" => columns.map { |types| { "children" => types.map { |type| { "type" => type } } } } } }
    assert_equal "2 2 2", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ holding.(nil, %w[button button]) ] })
    assert_equal "3 4 4", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ holding.("never", %w[logo], %w[menu], %w[button]), holding.(nil, %w[heading button], %w[heading]) ] })
    assert_equal "3 3 5", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ holding.("phone", %w[image], %w[text text]) ] })
    assert_equal "9 9 9", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ holding.(nil, %w[gallery map video quote]) ] })
    [ { "sections" => [ section.(2) ] }, { "sticky" => false }, { "sticky" => "true" }, nil, [] ].each { |document| assert_nil RenderPolicy.sticky_rows(document) }
  end

  test "the space steps a sticky header counts are the site's own, from tokens.json" do
    assert_equal SiteTokens.section_space, RenderPolicy::SECTION_SPACE
  end

  test "a sticky header's rows count a section's own space above and below, past the header's 20 (12 on a phone) and the 16 to spare, at a row's 88 (68)" do
    spaced = ->(style) { { "props" => { "stack" => "never" }, "children" => [ { "children" => [ { "type" => "button" } ] } ], "style" => style } }
    assert_equal "2 2 3", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ spaced.({ "base" => { "spaceAbove" => "section-s", "spaceBelow" => "section-s" } }) ] })
    assert_equal "3 3 4", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ spaced.({ "base" => { "spaceAbove" => "section-l", "spaceBelow" => "section-l" } }) ] })
    # A device's own step, and a phone that takes the base's, never the tablet's.
    assert_equal "1 3 1", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ spaced.({ "base" => { "spaceAbove" => "m" }, "tablet" => { "spaceAbove" => "section-l", "spaceBelow" => "section-l" } }) ] })
    assert_equal "1 1 2", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ spaced.({ "phone" => { "spaceAbove" => "section-l" } }) ] })
    # No more than the header's own, what the 16 to spare holds, or a step
    # that is not one, adds nothing.
    assert_equal "1 1 1", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ spaced.({ "base" => { "spaceAbove" => "none", "spaceBelow" => "l" } }) ] })
    assert_equal "1 1 2", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ spaced.({ "base" => { "spaceAbove" => "none", "spaceBelow" => "xxl" } }) ] })
    assert_equal "1 1 1", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ spaced.({ "base" => { "spaceAbove" => "huge", "spaceBelow" => 96 } }) ] })
    assert_equal "1 1 1", RenderPolicy.sticky_rows({ "sticky" => true, "sections" => [ spaced.("section-l") ] })
  end

  test "the frames a page may hold are exactly the providers' origins" do
    assert_equal %w[https://www.youtube-nocookie.com https://player.vimeo.com https://www.openstreetmap.org], RenderPolicy::FRAME_ORIGINS
  end
end
