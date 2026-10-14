require "test_helper"

# Free colours on the published page: carried by data attributes, never by
# inline style (the pages' policy is style-src 'self'), and drawn by the
# stylesheet at /colors.css, which a page links only when it has some;
# the address holds every colour, so its answer is kept for good, and an
# address no page writes is a 404.
class FreeColorsPagesTest < ActionDispatch::IntegrationTest
  include Documents

  def publish(document)
    page = Page.create_with_draft!(title: "Slack Water", slug: "home")
    Draft.save_document!(page_id: page.id, revision: 0, document: document, save_id: "first")
    page.publish!
    page.make_home!
  end

  def coloured
    document = page_document(widgets: [
      heading_block("h1", "Swim at slack water").merge("style" => { "base" => { "color" => "#1d4e6f" }, "phone" => { "color" => "#c2352b" } }),
      heading_block("h2", "When we swim").merge("style" => { "base" => { "color" => "primary" } })
    ])
    document["sections"][0]["style"] = { "base" => { "background" => "#e9dcc3" }, "tablet" => { "background" => "soft" } }
    document
  end

  test "a page's free colours reach it by data attribute, and its stylesheet draws them" do
    SiteStyle.create!(id: SiteStyle::ID, palette: SiteTokens.default_palette.merge("primary" => "#2f6f5e"), type_scale: "balanced")
    publish(coloured)

    get "/"

    assert_response :ok
    assert_select %(.site[data-primary="#2f6f5e"])
    assert_select %([data-block-id="s1"][data-bg="#e9dcc3"].tablet-bg-soft)
    assert_select %([data-block-id="h1"][data-fg="#1d4e6f"][data-phone-fg="#c2352b"])
    assert_select %([data-block-id="h2"].fg-primary:not([data-fg]))
    assert_select "[style]", count: 0
    links = css_select("link[rel=stylesheet]").map { |link| link["href"] }
    assert_equal 3, links.size
    colors = links.last
    assert_match %r{\A/colors\.css\?t=0e2a35&b=ffffff&s=primary-2f6f5e&c=1d4e6f,c2352b,e9dcc3&v=\w+\z}, colors

    get colors

    assert_response :ok
    assert_equal "text/css", response.media_type
    assert_equal %w[immutable max-age=31536000 public], response.headers["Cache-Control"].split(", ").sort
    assert_includes response.body, %(.site[data-primary="#2f6f5e"] { --sw-primary: #2f6f5e; })
    assert_includes response.body, %([data-bg="#e9dcc3"] { background-color: #e9dcc3; color: var(--sw-text);)
    assert_includes response.body, %(  [data-phone-fg="#c2352b"][data-phone-fg] { color: #c2352b; })
    assert_includes response.body, %(  :is([data-bg], [data-fg]).tablet-bg-soft { background-color: var(--sw-soft);)
    assert_equal FreeColors.css(text: "#0e2a35", background: "#ffffff", slots: { "primary" => "#2f6f5e" }, colors: %w[#1d4e6f #c2352b #e9dcc3]), response.body
  end

  test "a page with no free colour links no colours' stylesheet" do
    publish(page_document)

    get "/"

    assert_select %(link[href^="/colors.css"]), count: 0
  end

  test "an address no page writes is a 404: a missing or bad tone, an unknown or repeated slot, a bad colour, too many, a list where a word goes" do
    good = "t=0e2a35&b=ffffff"
    get "/colors.css?#{good}&c=e9dcc3"
    assert_response :ok
    [
      "b=ffffff&c=e9dcc3",
      "t=0E2A35&b=ffffff&c=e9dcc3",
      "t=zzzzzz&b=ffffff",
      "#{good}&s=brand-1d4e6f",
      "#{good}&s=primary-1d4e6f,primary-2f6f5e",
      "#{good}&s=primary",
      "#{good}&c=e9dcc3,red",
      "#{good}&c=#{([ 'e9dcc3' ] * 257).join(',')}",
      "#{good}&c[]=e9dcc3"
    ].each do |query|
      get "/colors.css?#{query}"
      assert_response :not_found, query
    end
  end

  test "the stylesheet's answer for colours a page names, without the release, is the same rules" do
    get "/colors.css?t=0e2a35&b=ffffff&c=3b2f5c"

    assert_response :ok
    assert_includes response.body, %([data-bg="#3b2f5c"] { background-color: #3b2f5c; color: var(--sw-background);)
  end
end
