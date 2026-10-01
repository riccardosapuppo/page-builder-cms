require "test_helper"

# The block partials, read the way a browser reads their output.
class BlocksTest < ActionView::TestCase
  helper BlocksHelper
  helper RichTextHelper

  MEDIA = ->(id) { id == "gone" ? nil : MediaResolver::Image.new(src: "/media/#{id}.png", width: 800, height: 600) }

  def block(id, type, props = {}, style: { "base" => {} }, children: [])
    { "id" => id, "type" => type, "props" => props, "style" => style, "children" => children }
  end

  def page(*widgets, section_style: { "base" => {} }, column_style: { "base" => {} })
    { "schemaVersion" => 1, "title" => "Test", "sections" => [ block("s1", "section", {}, style: section_style, children: [ block("c1", "column", {}, style: column_style, children: widgets) ]) ] }
  end

  def html_of(document)
    Nokogiri::HTML5.fragment(render_document(document, media: MEDIA))
  end

  def attributes(node, *names)
    names.map { |name| node[name] }
  end

  def every_widget
    [
      block("w-heading", "heading", { "level" => 2, "text" => "From the water" }),
      block("w-text", "text", { "doc" => { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [ { "type" => "text", "text" => "Hello" } ] } ] } }),
      block("w-image", "image", { "mediaId" => "hero", "alt" => "The bay" }),
      block("w-button", "button", { "label" => "Join", "href" => "#join" }),
      block("w-divider", "divider"),
      block("w-spacer", "spacer", { "size" => "l" }),
      block("w-gallery", "gallery", { "items" => [ { "mediaId" => "g1", "alt" => "One" }, { "url" => "https://images.example.org/two.jpg", "alt" => "Two" } ] }),
      block("w-video", "video", { "provider" => "youtube", "videoId" => "M7lc1UVf-VE", "title" => "Watch a dawn swim" }),
      block("w-map", "map", { "latitude" => 54.5, "longitude" => -3.25, "zoom" => 15, "label" => "Meeting point" }),
      block("w-iconbox", "iconbox", { "icon" => "sunrise", "title" => "Dawn swims", "text" => "Twice a week." }),
      block("w-quote", "quote", { "text" => "Cold water, hot tea.", "attribution" => "A member" }),
      block("w-accordion", "accordion", { "items" => [ { "question" => "How cold?", "answer" => "Cold." }, { "question" => "Wetsuit?", "answer" => "No." } ] })
    ]
  end

  test "every block of every type has a root that names its id and its type, in document order" do
    html = html_of(page(*every_widget))

    roots = html.css("[data-block-type]")
    assert_equal %w[section column heading text image button divider spacer gallery video map iconbox quote accordion], roots.map { |r| r["data-block-type"] }
    assert_equal %w[s1 c1] + every_widget.map { |w| w["id"] }, roots.map { |r| r["data-block-id"] }
  end

  test "style tokens become classes, overrides become device classes, and data-style repeats what is stored" do
    heading = block("h", "heading", { "level" => 1, "text" => "Swim" },
                    style: { "base" => { "textSize" => "display", "align" => "center" }, "phone" => { "textSize" => "heading-1" } })
    html = html_of(page(heading, column_style: { "base" => { "spaceInside" => "none", "verticalAlign" => "bottom" }, "tablet" => { "spaceInside" => "l" } }))

    root = html.at_css("[data-block-id=h]")
    assert_equal %w[w w-heading size-display phone-size-heading-1 align-center], root["class"].split
    assert_equal "base.align=center;base.textSize=display;phone.textSize=heading-1", root["data-style"]
    column = html.at_css("[data-block-id=c1]")
    assert_equal %w[col pad-none tablet-pad-l valign-bottom], column["class"].split
  end

  test "a heading takes its level's step unless its style names another" do
    html = html_of(page(block("a", "heading", { "level" => 1, "text" => "A" }), block("b", "heading", { "level" => 4, "text" => "B" })))

    assert_includes html.at_css("[data-block-id=a]")["class"].split, "size-heading-1"
    assert_includes html.at_css("[data-block-id=b]")["class"].split, "size-large"
    assert_nil html.at_css("[data-block-id=a]")["data-style"]
  end

  test "a block hidden on one device carries the class that hides it there only" do
    html = html_of(page(block("x", "divider", {}, style: { "base" => { "visibility" => "hidden" }, "tablet" => { "visibility" => "visible" } })))

    assert_equal %w[w w-divider hide-desktop hide-phone], html.at_css("[data-block-id=x]")["class"].split
  end

  test "a value the schema does not list never becomes a class" do
    html = html_of(page(block("x", "heading", { "level" => 2, "text" => "T" }, style: { "base" => { "textSize" => "huge onclick", "color" => "primary" } })))

    assert_equal %w[w w-heading size-heading-2 fg-primary], html.at_css("[data-block-id=x]")["class"].split
  end

  test "the accordion is details and summary, the first one open, and needs no script" do
    html = html_of(page(every_widget.last))

    details = html.css("[data-block-type=accordion] details")
    assert_equal [ "How cold?", "Wetsuit?" ], details.map { |d| d.at_css("summary").text }
    assert_equal [ true, false ], details.map { |d| d.key?("open") }
    assert_empty html.css("script")
  end

  test "the video and the map are closed details holding a lazy frame, and nothing else names the provider" do
    html = html_of(page(*every_widget))

    { "video" => "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE", "map" => "https://www.openstreetmap.org/export/embed.html?" }.each do |type, src|
      embed = html.at_css("[data-block-type=#{type}] details.sw-embed")
      assert embed, type
      assert_not embed.key?("open"), "#{type} starts open"
      frame = embed.at_css("iframe")
      assert_equal "lazy", frame["loading"], type
      assert frame["src"].start_with?(src), frame["src"]
      assert frame["title"].present?, type
    end
    addresses = html.css("[src], [href]").map { |node| node["src"] || node["href"] }
    assert_equal 2, addresses.count { |a| a.include?("youtube") || a.include?("openstreetmap") }, addresses.inspect
  end

  test "library images get their size; others keep their url; decorative ones an empty alt; a missing one nothing" do
    html = html_of(page(
      block("a", "image", { "mediaId" => "hero", "alt" => "The bay" }),
      block("b", "image", { "url" => "https://images.example.org/b.jpg", "alt" => "Buoys" }),
      block("c", "image", { "mediaId" => "hero", "decorative" => true }),
      block("d", "image", { "mediaId" => "gone", "alt" => "Deleted" }),
      block("e", "image", { "url" => "javascript:alert(1)", "alt" => "Bad" })
    ))

    img = ->(id) { html.at_css("[data-block-id=#{id}] img") }
    assert_equal [ "/media/hero.png", "800", "600", "The bay" ], attributes(img.call("a"), "src", "width", "height", "alt")
    assert_equal [ "https://images.example.org/b.jpg", nil, "Buoys" ], attributes(img.call("b"), "src", "width", "alt")
    assert_equal "", img.call("c")["alt"]
    assert_nil img.call("d")
    assert_nil img.call("e")
    assert_equal "hero", html.at_css("[data-block-id=a]")["data-media-id"]
  end

  test "an address RenderPolicy refuses leaves the label or the heading without a link" do
    html = html_of(page(
      block("b", "button", { "label" => "Click", "href" => "javascript:alert(1)" }),
      block("h", "heading", { "level" => 2, "text" => "Title", "href" => "//evil.example" })
    ))

    button = html.at_css("[data-block-id=b] .sw-btn")
    assert_equal [ "a", "Click", nil ], [ button.name, button.text, button["href"] ]
    assert_nil html.at_css("[data-block-id=h] a")
    assert_equal "Title", html.at_css("[data-block-id=h] h2").text
  end

  test "the tree stays strict: a widget outside a column, a section inside one, or an unknown type is left out" do
    stray = block("stray", "heading", { "level" => 2, "text" => "Stray" })
    document = page(block("inner", "section"), block("odd", "carousel"), block("ok", "divider"))
    document["sections"] << stray
    document["sections"].first["children"] << stray

    html = html_of(document)

    assert_equal %w[s1 c1 ok], html.css("[data-block-id]").map { |r| r["data-block-id"] }
  end

  test "an icon box draws its icon inline from the sprite, and an unknown name draws none" do
    html = html_of(page(block("a", "iconbox", { "icon" => "pin", "title" => "Meet", "text" => "Here." }),
                        block("b", "iconbox", { "icon" => "<svg onload=x>", "title" => "Odd", "text" => "No icon." })))

    svg = html.at_css("[data-block-id=a] svg.sw-icon")
    assert_equal [ "0 0 40 40", "true" ], attributes(svg, "viewBox", "aria-hidden")
    assert_equal SiteIcons["pin"].shapes.size, svg.element_children.size
    assert_nil html.at_css("[data-block-id=b] svg")
    assert_nil html.at_css("[data-block-id=b]")["data-icon"]
  end

  test "markup in any text the author typed reaches the visitor as text, never as an element" do
    trap = %(<b class="x">bold</b><img src=x onerror=alert(1)>)
    html = html_of(page(
      block("h", "heading", { "level" => 2, "text" => trap }),
      block("t", "text", { "doc" => { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [ { "type" => "text", "text" => trap } ] } ] } }),
      block("b", "button", { "label" => trap, "href" => "/" }),
      block("i", "iconbox", { "icon" => "cup", "title" => trap, "text" => trap }),
      block("q", "quote", { "text" => trap, "attribution" => trap }),
      block("a", "accordion", { "items" => [ { "question" => trap, "answer" => trap } ] }),
      block("v", "video", { "provider" => "vimeo", "videoId" => "76979871", "title" => trap }),
      block("m", "map", { "latitude" => 1, "longitude" => 2, "zoom" => 3, "label" => trap }),
      block("p", "image", { "mediaId" => "hero", "alt" => trap })
    ))

    assert_empty html.css("b, [onerror]")
    assert_equal [ "hero.png" ], html.css("img").map { |img| img["src"].split("/").last }
    %w[h t b i q a v m].each { |id| assert_includes html.at_css("[data-block-id=#{id}]").text, trap, id }
    assert_equal trap, html.at_css("[data-block-id=p] img")["alt"]
  end

  test "no block writes an inline style, which the pages' Content-Security-Policy would block" do
    html = render_document(page(*every_widget), media: MEDIA)

    assert_no_match(/\sstyle=/, html)
  end
end
