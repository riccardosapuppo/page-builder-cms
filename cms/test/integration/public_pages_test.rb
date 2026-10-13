require "test_helper"

# The pages a visitor sees, asked for the way a browser asks: the live page
# at / and /<slug>, moved addresses, missing ones, and the draft preview.
class PublicPagesTest < ActionDispatch::IntegrationTest
  include StoredFiles

  CSP = "default-src 'none'; script-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' https:; " \
        "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.openstreetmap.org; " \
        "base-uri 'none'; form-action 'self'; frame-ancestors 'self'"

  def publish(title:, slug:, widgets: nil, home: false)
    page = create_page(title: title, slug: slug)
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: title, widgets: widgets), save_id: "first")
    page.publish!
    page.make_home! if home
    page.reload
  end

  def text_block(id, text)
    { "id" => id, "type" => "text", "props" => { "doc" => { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [ { "type" => "text", "text" => text } ] } ] } },
      "style" => { "base" => {} }, "children" => [] }
  end

  test "/ shows the home page as it was published, not its draft" do
    page = publish(title: "Slack Water", slug: "home", home: true)
    Draft.save_document!(page_id: page.id, revision: 1, document: page_document(title: "Not live yet"), save_id: "later")

    get "/"

    assert_response :ok
    assert_select "main h1", text: "Slack Water"
    assert_select "title", text: "Slack Water"
    assert_no_match "Not live yet", response.body
  end

  test "a published page is at its address, in the site's header and footer, the starters' until the site publishes its own" do
    publish(title: "Winter series", slug: "winter", widgets: [ heading_block("h1", "Winter series"), text_block("t1", "Short, cold swims.") ])

    get "/winter"

    assert_response :ok
    assert_select "header.sw-header [data-block-type=logo] a.w-logo-link[href='/'] span", text: "Slack Water"
    assert_select "header.sw-header [data-block-type=menu] nav[aria-label=Main] .w-menu-links a[href='/#swims']", text: "Swims"
    assert_select "header.sw-header [data-block-type=menu][data-fold='480']"
    assert_select "header.sw-header [data-block-type=button] a.sw-btn[href='/#join']", text: "Join"
    assert_select "main [data-block-type=heading] h1", text: "Winter series"
    assert_select "main [data-block-type=text] p", text: "Short, cold swims."
    assert_select "footer.sw-footer section.bg-text [data-block-type=logo] svg.sw-brand-mark"
    assert_select "footer.sw-footer [data-block-type=text] p", text: "Slack Water swimming club. Tide times are a guide, not a promise."
    assert_select "footer.sw-footer [data-block-type=text] strong", text: "Slack Water swimming club."
  end

  test "the header and footer published are drawn around every page: a published one, the 404 page; a preview draws their drafts" do
    page = publish(title: "Winter series", slug: "winter")
    header, footer = Page.parts!
    menu = { "id" => "m", "type" => "menu", "props" => { "label" => "Main", "items" => [ { "label" => "Tides", "href" => "/tides" }, { "label" => "Join us", "href" => "/winter#join" } ] },
             "style" => { "base" => {} }, "children" => [] }
    Draft.save_document!(page_id: header.id, revision: header.draft.revision, document: page_document(title: "Header", widgets: [ menu ]), save_id: "h1")
    header.publish!
    Draft.save_document!(page_id: footer.id, revision: footer.draft.revision, document: page_document(title: "Footer", widgets: [ text_block("f", "Tide club.") ]), save_id: "f1")
    footer.publish!
    Draft.save_document!(page_id: header.id, revision: header.draft.reload.revision, document: page_document(title: "Header", widgets: [ heading_block("hh", "Draft header") ]), save_id: "h2")

    [ "/winter", "/no-such-page" ].each do |path|
      get path

      assert_equal [ [ "Tides", "/tides" ], [ "Join us", "/winter#join" ] ], css_select("header.sw-header .w-menu-links a").map { |a| [ a.text, a["href"] ] }, path
      assert_equal [ [ "Tides", "/tides" ], [ "Join us", "/winter#join" ] ], css_select("header.sw-header .sw-menu-sheet a").map { |a| [ a.text, a["href"] ] }, path
      assert_select "footer.sw-footer p", { text: "Tide club." }, path
      assert_no_match "Draft header", response.body, path
    end

    get "/preview/#{page.id}"
    assert_select "header.sw-header h1", text: "Draft header"
    assert_select "footer.sw-footer p", text: "Tide club."
  end

  test "a part with no section draws no element: a site may have no footer" do
    publish(title: "Winter series", slug: "winter")
    footer = Page.part!("footer")
    Draft.save_document!(page_id: footer.id, revision: footer.draft.revision, document: { "schemaVersion" => 1, "title" => "Footer", "sections" => [] }, save_id: "f1")
    footer.publish!

    get "/winter"

    assert_select "header.sw-header", 1
    assert_select "footer", false
    assert_select "main h1", text: "Winter series"
  end

  test "the preview of the header or the footer is the home page's draft inside the parts' drafts" do
    publish(title: "Slack Water", slug: "home", home: true)
    header = Page.part!("header")

    get "/preview/#{header.id}"

    assert_response :ok
    assert_select "title", text: "Preview: Header"
    assert_select "header.sw-header [data-block-type=logo]", 1
    assert_select "main h1", text: "Slack Water"
    assert_equal "no-store", response.headers["Cache-Control"]

    Page.home_page.unmake_home!
    get "/preview/#{header.id}"
    assert_response :ok
    assert_select "main section", false
  end

  test "a link a menu could not have, in a part that reached the row another way, is left out as a page leaves it out" do
    publish(title: "Winter series", slug: "winter")
    header = Page.part!("header")
    bad = { "id" => "m", "type" => "menu", "style" => { "base" => {} }, "children" => [],
            "props" => { "label" => "Main", "items" => [ { "label" => "Ours", "href" => "/ours" }, { "label" => "Script", "href" => "javascript:alert(1)" } ] } }
    version = PageVersion.record!(page_id: header.id, document: page_document(title: "Header", widgets: [ bad ]), reason: "publish", at: Time.current)
    header.update_columns(published_version_id: version.id, published_revision: 0, published_at: Time.current)

    get "/winter"

    assert_equal [ [ "Ours", "/ours" ] ], css_select("header.sw-header .w-menu-links a").map { |a| [ a.text, a["href"] ] }
    assert_no_match(/javascript:/, response.body)
  end

  test "an address the page had before its last publish answers 301 to where it is now" do
    page = publish(title: "Winter series", slug: "winter")
    page.draft.update!(slug: "winter-swims")
    page.publish!

    get "/winter"

    assert_response :moved_permanently
    assert_equal "http://www.example.com/winter-swims", response.location
    follow_redirect!
    assert_select "main h1", text: "Winter series"
  end

  test "the home page's own slug answers 301 to /, so the page has one address" do
    publish(title: "Slack Water", slug: "home", home: true)

    get "/home"

    assert_response :moved_permanently
    assert_equal "http://www.example.com/", response.location
  end

  test "an unknown address, or a page never published, is a real 404 in the site's look" do
    create_page(title: "Draft only", slug: "draft-only")

    [ "/nowhere", "/draft-only" ].each do |path|
      get path

      assert_response :not_found
      assert_equal "text/html", response.media_type
      assert_select "header.sw-header .w-logo-link span", text: "Slack Water"
      assert_select "main h1", text: "There is no page here"
      assert_select "main a[href='/']", text: "Go to the home page"
    end
  end

  test "the 404 page's content is a document the schema accepts, like any page's" do
    result = BlockDocument.check(PublicPage::NOT_FOUND)

    assert result.ok?, result.errors.map(&:message).inspect
  end

  test "/ without a home page, or with one not published yet, is the 404 page" do
    get "/"
    assert_response :not_found

    page = create_page(title: "Slack Water", slug: "home")
    page.make_home!
    get "/"
    assert_response :not_found
    assert_select "main h1", text: "There is no page here"
  end

  test "the preview shows the draft through the same partials, never stored and never indexed" do
    page = publish(title: "Winter series", slug: "winter")
    Draft.save_document!(page_id: page.id, revision: 1, document: page_document(title: "Winter series, new dates"), save_id: "later")

    get "/preview/#{page.id}"

    assert_response :ok
    assert_equal "no-store", response.headers["Cache-Control"]
    assert_equal "noindex", response.headers["X-Robots-Tag"]
    assert_select "meta[name=robots][content=noindex]"
    assert_select "title", text: "Preview: Winter series, new dates"
    assert_select "main [data-block-type=heading] h1", text: "Winter series, new dates"

    get "/winter"
    assert_select "main h1", text: "Winter series"
    assert_nil response.headers["X-Robots-Tag"]
  end

  test "the preview of a page that does not exist is a 404, still never stored" do
    get "/preview/999999"

    assert_response :not_found
    assert_equal "no-store", response.headers["Cache-Control"]
    assert_select "main h1", text: "There is no page here"
  end

  test "every public answer carries the static policy: no script, frames only from the providers, no nonce" do
    page = publish(title: "Slack Water", slug: "home", home: true)
    publish(title: "Winter series", slug: "winter")

    [ "/", "/winter", "/nowhere", "/preview/#{page.id}" ].each do |path|
      get path

      assert_equal CSP, response.headers["Content-Security-Policy"], path
      assert_no_match(/nonce/, response.headers["Content-Security-Policy"], path)
      assert_select "script", false, "#{path} has a script element"
      assert_select "meta[name=csrf-token], meta[name=csrf-param], meta[name=csp-nonce]", false, path
      assert_no_match(/ style=/, response.body, "#{path}: an inline style attribute, which style-src 'self' would block")
    end
  end

  # With forgery protection on, as in production: the test environment
  # turns it off, and then csrf_meta_tags writes nothing and opens no
  # session, so a layout that called it would pass here and set a cookie
  # in production. (Shown: with csrf_meta_tags planted in the layout, this
  # test passed until the protection was switched on for it.)
  test "no public or preview answer sets a cookie, redirects and 404s included" do
    page = publish(title: "Slack Water", slug: "home", home: true)
    winter = publish(title: "Winter series", slug: "winter")
    winter.draft.update!(slug: "winter-swims")
    winter.publish!

    with_forgery_protection do
      [ "/", "/home", "/winter", "/winter-swims", "/nowhere", "/preview/#{page.id}", "/preview/999999" ].each do |path|
        get path

        assert_includes [ 200, 301, 404 ], response.status, path
        assert_nil response.headers["Set-Cookie"], "#{path} answered #{response.status} with Set-Cookie: #{response.headers['Set-Cookie']}"
        assert_select "meta[name=csrf-token]", false, path if response.status != 301
      end
    end
  end

  # This test and the next read the attribute and the rule's text; the
  # colour and the size a browser draws from them are measured by
  # tools/check-production.ts and tools/type-scales.ts.
  test "the palette the site style chose reaches the page, by data attribute, not inline style" do
    SiteStyle.create!(id: SiteStyle::ID, palette: SiteTokens.default_palette.merge("primary" => "site-harbour"), type_scale: "balanced")
    publish(title: "Slack Water", slug: "home", home: true)

    get "/"

    assert_select ".site[data-primary=site-harbour][data-accent=site-buoy][data-type-scale=balanced]"
    get css_path("tokens")
    assert_includes response.body, %(.site[data-primary="site-harbour"] { --sw-primary: #1D4E6F; })
  end

  test "the type scale the site style chose reaches the page, and the stylesheet has a rule for it" do
    SiteStyle.create!(id: SiteStyle::ID, palette: SiteTokens.default_palette, type_scale: "strong")
    publish(title: "Slack Water", slug: "home", home: true)

    get "/"

    assert_select ".site[data-type-scale=strong]"
    get css_path("tokens")
    assert_includes response.body, %(.site[data-type-scale="strong"] .sw {\n  --fs-display: 102px;)
  end

  test "the letter width the site style chose reaches the page, and the stylesheet has its widths" do
    SiteStyle.create!(id: SiteStyle::ID, palette: SiteTokens.default_palette, type_scale: "balanced", letter_width: "widest")
    publish(title: "Slack Water", slug: "home", home: true)

    get "/"

    assert_select ".site[data-letter-width=widest]"
    get css_path("tokens")
    assert_includes response.body, %(.sw { --stretch-display: 100%; --stretch-strong: 100%; --stretch-ui: 100%; })
    assert_includes response.body, %(.site[data-letter-width="widest"] .sw { --stretch-display: 125%; --stretch-strong: 115%; --stretch-ui: 110%; })
  end

  test "a library image is served from this site, with its size and alt text" do
    blob = uploaded_blob(png_bytes(width: 4, height: 3))
    item = MediaItem.create_from_upload!(signed_blob_id: blob.signed_id, width: 4, height: 3, alt: "")
    publish(title: "Gallery", slug: "gallery", widgets: [ image_block("i1", item.public_id, alt: "Swimmers at the jetty") ])

    get "/gallery"

    img = css_select("main [data-block-type=image] img").first
    assert_equal [ "4", "3", "Swimmers at the jetty" ], [ img["width"], img["height"], img["alt"] ]
    assert img["src"].start_with?("/rails/active_storage/blobs/proxy/"), img["src"]

    get img["src"]
    assert_response :ok
    assert_equal png_bytes(width: 4, height: 3), response.body
  end

  test "every id on a page is there once, and the skip link reaches the main content, whatever the anchors" do
    page = create_page(title: "Anchors", slug: "anchors")
    document = page_document(title: "Anchors")
    # Every word the anchor pattern allows that the layout itself might
    # use as an id, on the page's sections.
    %w[main content top skip].each_with_index do |anchor, k|
      document["sections"] << section_block("s#{k + 2}", []).tap { |s| s["props"]["anchor"] = anchor }
    end
    Draft.save_document!(page_id: page.id, revision: 0, document: document, save_id: "first")
    page.publish!

    get "/anchors"

    ids = css_select("[id]").map { |element| element["id"] }
    assert_equal ids.uniq, ids
    assert_equal %w[main content top skip], css_select("section[id]").map { |s| s["id"] }
    target = css_select(".sw-skip").first["href"].delete_prefix("#")
    assert_equal [ "main" ], css_select("[id]").select { |element| element["id"] == target }.map(&:name)
  end

  test "the stylesheets the page names are served, with the fonts they name" do
    publish(title: "Slack Water", slug: "home", home: true)
    get "/"
    links = css_select("link[rel=stylesheet]").map { |link| link["href"] }
    assert_equal 2, links.size

    links.each do |href|
      get href
      assert_response :ok
      assert_equal "text/css", response.media_type
    end
    get links.first
    fonts = response.body.scan(/url\("([^"]+\.woff2)"\)/).flatten
    assert_equal 3, fonts.size
    fonts.each do |font|
      get font
      assert_response :ok, font
    end
  end

  private

  def with_forgery_protection
    before = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    yield
  ensure
    ActionController::Base.allow_forgery_protection = before
  end

  # The digested address of a stylesheet, as the layout writes it.
  def css_path(name)
    ActionController::Base.helpers.asset_path("#{name}.css")
  end
end
