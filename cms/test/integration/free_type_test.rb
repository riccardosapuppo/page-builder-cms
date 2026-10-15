require "test_helper"

# Free type on the published page: carried by data attributes, never by
# inline style (the pages' policy is style-src 'self'), and drawn by the
# stylesheet at /type/<digest>.css, after the free colours', which a page
# links only when it has some: its rules, kept under their digest when the
# page is drawn, so the answer is kept for good; an address no page links
# is a 404, a sheet of free colours' digest too.
class FreeTypePagesTest < ActionDispatch::IntegrationTest
  include Documents

  def publish(document)
    page = Page.create_with_draft!(title: "Slack Water", slug: "home")
    Draft.save_document!(page_id: page.id, revision: 0, document: document, save_id: "first")
    page.publish!
    page.make_home!
  end

  def typed
    page_document(widgets: [
      heading_block("h1", "Swim at slack water").merge("style" => {
        "base" => { "textSize" => "display", "fontSize" => "6vw", "fontWeight" => 800, "letterSpacing" => -0.02, "lineHeight" => 0.95, "letterWidth" => 80, "color" => "#1d4e6f" },
        "tablet" => { "fontSize" => "4vw" },
        "phone" => { "fontSize" => "32px", "fontWeight" => 700 }
      }),
      heading_block("h2", "When we swim")
    ])
  end

  test "a page's free type reaches it by data attribute, and its stylesheet draws it, after the free colours'" do
    publish(typed)

    get "/"

    assert_response :ok
    assert_select %([data-block-id="h1"].size-display[data-font-size="6vw"][data-tablet-font-size="4vw"][data-phone-font-size="32px"][data-font-weight="800"][data-phone-font-weight="700"][data-letter-spacing="-0.02"][data-line-height="0.95"][data-font-stretch="80"])
    assert_select %([data-block-id="h2"]:not([data-font-size]))
    assert_select "[style]", count: 0
    links = css_select("link[rel=stylesheet]").map { |link| link["href"] }
    assert_equal 4, links.size
    assert_match %r{\A/colors/[0-9a-f]{64}\.css\z}, links[2]
    type = links.last
    assert_match %r{\A/type/[0-9a-f]{64}\.css\z}, type

    get type

    assert_response :ok
    assert_equal "text/css", response.media_type
    assert_equal %w[immutable max-age=31536000 public], response.headers["Cache-Control"].split(", ").sort
    assert_includes response.body, %(.w[data-font-size="6vw"] { font-size: 6cqw; })
    assert_includes response.body, %(  .w[data-tablet-font-size="4vw"][data-tablet-font-size] { font-size: 4cqw; })
    assert_includes response.body, %(  .w[data-phone-font-weight="700"][data-phone-font-weight] { font-weight: 700; })
    assert_equal FreeType.css(FreeType.of_document(typed)), response.body
  end

  test "a page with no free type links no type's stylesheet, and the CSP is the pages' own" do
    publish(page_document)

    get "/"

    assert_select %(link[href^="/type/"]), count: 0
    assert_includes response.headers["Content-Security-Policy"], "style-src 'self'"
  end

  test "an address no page links is a 404: a digest no sheet is kept under, a colours' sheet, or no digest" do
    document = typed
    document["sections"][0]["style"] = { "base" => { "background" => "#e9dcc3" } }
    publish(document)
    get "/"
    colors, type = css_select("link[rel=stylesheet]").map { |link| link["href"] }.last(2)
    get type
    assert_response :ok
    get colors
    assert_response :ok

    [
      "/type/#{Digest::SHA256.hexdigest('no sheet')}.css",
      colors.sub("/colors/", "/type/"),
      type.sub("/type/", "/colors/"),
      type.sub(".css", ""),
      type.sub(/\h{8}\.css/, ".css"),
      "/type.css",
      "/type/#{'g' * 64}.css"
    ].each do |address|
      get address
      assert_response :not_found, address
    end
  end
end
