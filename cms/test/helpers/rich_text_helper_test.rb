require "test_helper"

class RichTextHelperTest < ActionView::TestCase
  def doc(*content)
    { "type" => "doc", "content" => content }
  end

  def paragraph(*inline)
    { "type" => "paragraph", "content" => inline }
  end

  def text(value, *marks)
    node = { "type" => "text", "text" => value }
    node["marks"] = marks unless marks.empty?
    node
  end

  def link(href)
    { "type" => "link", "attrs" => { "href" => href, "target" => "_blank", "rel" => "noopener noreferrer nofollow", "class" => nil } }
  end

  test "the author's text reaches the page as text, markup and entities included" do
    html = rich_text(doc(paragraph(text(%(Tom & Jerry's <script>alert(1)</script> "café" &amp; &copy)))))

    assert_equal %(<p>Tom &amp; Jerry&#39;s &lt;script&gt;alert(1)&lt;/script&gt; &quot;café&quot; &amp;amp; &amp;copy</p>), html
    assert_kind_of ActiveSupport::SafeBuffer, html
  end

  test "marks nest in the order they are stored, the first innermost" do
    html = rich_text(doc(paragraph(text("both", { "type" => "bold" }, { "type" => "italic" }), text(" and "), text("link", { "type" => "italic" }, link("/winter")))))

    assert_equal %(<p><em><strong>both</strong></em> and <a href="/winter"><em>link</em></a></p>), html
  end

  test "a link's address is escaped in the attribute, and the renderer adds no target or rel" do
    html = rich_text(doc(paragraph(text("times", link("https://tide.example.org/?a=1&b='2'")))))

    assert_equal %(<p><a href="https://tide.example.org/?a=1&amp;b=&#39;2&#39;">times</a></p>), html
  end

  test "a link RenderPolicy refuses is dropped, and its text stays" do
    [ "javascript:alert(1)", " JaVaScRiPt:alert(2)", "java\tscript:alert(3)", "//evil.example" ].each do |href|
      html = rich_text(doc(paragraph(text("click", { "type" => "bold" }, link(href)))))

      assert_equal "<p><strong>click</strong></p>", html, href.inspect
    end
  end

  test "lists nest, a numbered list says where it starts only when that is not 1, and line breaks are kept" do
    item = ->(*content) { { "type" => "listItem", "content" => content } }
    nested = { "type" => "orderedList", "attrs" => { "start" => 3, "type" => nil }, "content" => [ item.call(paragraph(text("three"))) ] }
    html = rich_text(doc(
      { "type" => "bulletList", "content" => [ item.call(paragraph(text("one")), nested) ] },
      { "type" => "orderedList", "attrs" => { "start" => 1, "type" => "a" }, "content" => [ item.call(paragraph(text("a"), { "type" => "hardBreak" }, text("b"))) ] },
      paragraph
    ))

    assert_equal %(<ul><li><p>one</p><ol start="3"><li><p>three</p></li></ol></li></ul><ol type="a"><li><p>a<br>b</p></li></ol><p></p>), html
  end

  test "a node or a mark the schema does not know is left out, its text kept" do
    html = rich_text(doc(paragraph(text("plain", { "type" => "underline" })), { "type" => "heading", "content" => [ text("big") ] }, "not a node"))

    assert_equal "<p>plain</p>", html
  end

  test "anything that is not a document renders nothing" do
    [ nil, "<p>hi</p>", { "type" => "paragraph" }, [] ].each do |value|
      assert_equal "", rich_text(value), value.inspect
    end
  end

  test "plain text with line breaks keeps each line as escaped text" do
    assert_equal "a &lt;b&gt;<br>c<br>", text_with_breaks("a <b>\nc\n")
  end
end
