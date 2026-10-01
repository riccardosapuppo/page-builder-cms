require "test_helper"

class RenderPolicyTest < ActiveSupport::TestCase
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
    # 400 pixels either side are 0.0171661 degrees; 250 pixels up and down,
    # shrunk by cos(54.5 degrees) = 0.5807030, are 0.0062303 degrees.
    assert_equal "https://www.openstreetmap.org/export/embed.html?bbox=-3.267166%2C54.493770%2C-3.232834%2C54.506230&layer=mapnik&marker=54.500000%2C-3.250000", src
    assert_nil RenderPolicy.map_src(91, 0, 10)
    assert_nil RenderPolicy.map_src(0, 0, 20)
    assert_nil RenderPolicy.map_src(Float::INFINITY, 0, 10)
    assert_nil RenderPolicy.map_src(0, 0, 10.5)
    assert_nil RenderPolicy.map_src("54.5", 0, 10)
  end

  test "the frames a page may hold are exactly the providers' origins" do
    assert_equal %w[https://www.youtube-nocookie.com https://player.vimeo.com https://www.openstreetmap.org], RenderPolicy::FRAME_ORIGINS
  end
end
