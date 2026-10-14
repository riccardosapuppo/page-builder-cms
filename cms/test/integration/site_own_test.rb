require "test_helper"

# What a site adds of its own to the published page: classes and an anchor
# on any block, which block_root writes after the theme's classes and as
# the element's id (RenderPolicy); a header that stays at the top of the
# window (data-sticky, site.css); and its custom CSS, linked after the
# theme's and the free colours' stylesheets as /custom.css?v=<version>,
# served inside the site, kept for good at its own version only.
class SiteOwnTest < ActionDispatch::IntegrationTest
  include Documents

  def publish(document)
    page = Page.create_with_draft!(title: "Slack Water", slug: "home")
    Draft.save_document!(page_id: page.id, revision: 0, document: document, save_id: "first")
    page.publish!
    page.make_home!
  end

  test "a block's classes of the site's own come after the theme's, and its anchor is its id, on any block" do
    heading = heading_block("h1", "Prices").tap { |block| block["props"].merge!("className" => "lede big", "anchor" => "prices") }
    document = page_document(widgets: [ heading ])
    document["sections"][0]["props"] = { "className" => "hero", "anchor" => "top" }
    document["sections"][0]["children"][0]["props"] = { "className" => "side" }
    publish(document)

    get "/"

    assert_response :ok
    assert_select %(section#top.sec.hero[data-block-id="s1"])
    assert_select %([data-block-id="s1c1"].side:not([id]))
    assert_select %([data-block-id="h1"]#prices.lede.big)
    assert_equal %w[lede big], css_select(%([data-block-id="h1"])).first["class"].split.last(2)
  end

  test "a header that says it stays at the top is drawn with data-sticky and its rows, which the theme keeps there; one that does not, without" do
    publish(page_document)
    get "/"
    assert_select "header.sw-header"
    assert_select "header.sw-header[data-sticky]", count: 0

    header, = Page.parts!
    sticky = page_document(title: "Header", widgets: [ heading_block("hh", "Slack Water") ]).merge("sticky" => true)
    Draft.save_document!(page_id: header.id, revision: header.draft.revision, document: sticky, save_id: "sticky")
    header.publish!
    get "/"

    assert_select %(header.sw-header[data-sticky="1 1 1"]), count: 1
    get css_select("link[rel=stylesheet]").first["href"]
    assert_includes response.body, ".sw-header[data-sticky] { position: sticky; top: 0;"
    assert_includes response.body, "scroll-margin-top: calc(var(--sticky-rows) * var(--sticky-row) + 16px)"
  end

  test "the site's custom CSS is linked last, served inside the site, kept for good at its own version" do
    publish(page_document)
    get "/"
    assert_select %(link[href^="/custom.css"]), count: 0

    SiteStyle.current.tap { |style| style.custom_css = ".hero { letter-spacing: .02em; }" }.save!
    get "/"
    href = css_select("link[rel=stylesheet]").map { |link| link["href"] }.last
    assert_match %r{\A/custom\.css\?v=[0-9a-f]{16}\z}, href
    get href

    assert_response :ok
    assert_equal "text/css", response.media_type
    assert_equal "@scope (.site) {\n.hero { letter-spacing: .02em; }\n}\n", response.body
    assert_equal %w[immutable max-age=31536000 public], response.headers["Cache-Control"].split(", ").sort

    # An address a stale copy of a page may still hold: the rules as they
    # are now, kept by no one.
    get "/custom.css?v=0000000000000000"
    assert_response :ok
    assert_equal "no-cache", response.headers["Cache-Control"]
    assert_includes response.body, ".hero"
  end
end
