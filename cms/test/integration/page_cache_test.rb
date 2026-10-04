require "test_helper"

# A published page as a browser and the server's cache keep it: what the
# visitor gets back for the validator they hold, after each thing that
# changes the page (a publish, a restore then published, the site style, a
# new release), and which fragments of the page Solid Cache reads and
# writes on the way.
class PageCacheTest < ActionDispatch::IntegrationTest
  include PageCacheStore

  CACHE_CONTROL = %w[max-age=0 must-revalidate public].freeze

  def text_block(id, text)
    { "id" => id, "type" => "text", "style" => { "base" => {} }, "children" => [],
      "props" => { "doc" => { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [ { "type" => "text", "text" => text } ] } ] } } }
  end

  def column_block(id, widgets)
    { "id" => id, "type" => "column", "props" => {}, "style" => { "base" => {} }, "children" => widgets }
  end

  # Two sections of two columns of three widgets each: 2 + 4 + 12 blocks.
  def grid_document(title: "Tide tables", changed: nil)
    sections = %w[s1 s2].map do |s|
      columns = %w[c1 c2].map do |c|
        widgets = %w[w1 w2 w3].map { |w| text_block("#{s}#{c}#{w}", changed == "#{s}#{c}#{w}" ? "Changed words" : "Words of #{s}#{c}#{w}") }
        column_block("#{s}#{c}", widgets)
      end
      { "id" => s, "type" => "section", "props" => {}, "style" => { "base" => {} }, "children" => columns }
    end
    { "schemaVersion" => 1, "title" => title, "sections" => sections }
  end

  def publish(page, document)
    draft = Draft.find_by!(page_id: page.id)
    Draft.save_document!(page_id: page.id, revision: draft.revision, document: document, save_id: "s#{draft.revision}")
    page.publish!
    page.reload
  end

  def published(slug: "tides", document: grid_document)
    publish(create_page(title: document["title"], slug: slug), document)
  end

  def directives(header) = header.to_s.split(",").map(&:strip).sort

  def assert_cacheable(path)
    assert_equal CACHE_CONTROL, directives(response.headers["Cache-Control"]), path
    assert_match(/\AW\/"[0-9a-f]+"\z/, response.headers["ETag"], path)
    assert_nil response.headers["Last-Modified"], path
    assert_nil response.headers["Set-Cookie"], path
  end

  test "a published page may be kept by anyone, is asked for again at every visit, and has an ETag but no Last-Modified" do
    published

    get "/tides"

    assert_response :ok
    assert_cacheable "/tides"
    assert_select "main [data-block-id=s1c1w1] p", text: "Words of s1c1w1"
  end

  test "the ETag sent back is answered 304, with no body and the same validator" do
    published
    get "/tides"
    etag = response.headers["ETag"]

    get "/tides", headers: { "If-None-Match" => etag }

    assert_response :not_modified
    assert_equal "", response.body
    assert_equal etag, response.headers["ETag"]
    assert_cacheable "/tides"
  end

  test "after a publish, the ETag of the old version gets 200 with the new one" do
    page = published
    get "/tides"
    old = response.headers["ETag"]

    publish(page, grid_document(changed: "s2c1w3"))
    get "/tides", headers: { "If-None-Match" => old }

    assert_response :ok
    assert_select "main [data-block-id=s2c1w3] p", text: "Changed words"
    assert_not_equal old, response.headers["ETag"]
    get "/tides", headers: { "If-None-Match" => response.headers["ETag"] }
    assert_response :not_modified
  end

  test "a restore that is then published is a new page for every browser, even the words of before" do
    page = published
    first = page.published_version.number
    publish(page, grid_document(changed: "s1c1w1"))
    get "/tides"
    held = response.headers["ETag"]
    assert_select "main [data-block-id=s1c1w1] p", text: "Changed words"

    page.restore!(first)
    page.publish!
    get "/tides", headers: { "If-None-Match" => held }

    assert_response :ok
    assert_select "main [data-block-id=s1c1w1] p", text: "Words of s1c1w1"
    assert_nil response.headers["Last-Modified"]
  end

  test "a change of the site style is a new page for every browser" do
    published
    get "/tides"
    held = response.headers["ETag"]
    assert_select ".site[data-primary=site-harbour]", false

    api(:put, "/api/site-style", { "palette" => SiteTokens.default_palette.merge("primary" => "site-harbour"), "typeScale" => SiteTokens.default_type_scale })
    assert_response :ok
    get "/tides", headers: { "If-None-Match" => held }

    assert_response :ok
    assert_select ".site[data-primary=site-harbour]"
    assert_not_equal held, response.headers["ETag"]
  end

  test "a new release is a new page for every browser" do
    published
    get "/tides"
    held = response.headers["ETag"]

    as_release("a-release-after-this-one") do
      get "/tides", headers: { "If-None-Match" => held }
    end

    assert_response :ok
    assert_not_equal held, response.headers["ETag"]
  end

  test "the ETag of one page is no use on another, nor on the home page's address" do
    published(slug: "tides")
    other = published(slug: "swims", document: grid_document(title: "Swims"))
    get "/tides"
    held = response.headers["ETag"]

    get "/swims", headers: { "If-None-Match" => held }
    assert_response :ok
    other.make_home!
    get "/", headers: { "If-None-Match" => held }
    assert_response :ok
    assert_select "title", text: "Swims"
  end

  test "the preview, the 404 page and a moved address are never answered from a validator" do
    page = published
    page.draft.update!(slug: "tide-tables")
    page.publish!

    get "/preview/#{page.id}"
    assert_equal "no-store", response.headers["Cache-Control"]
    get "/nowhere"
    assert_response :not_found
    assert_equal "no-cache", response.headers["Cache-Control"]
    assert_nil response.headers["ETag"]
    get "/tides"
    assert_response :moved_permanently
    assert_equal "no-cache", response.headers["Cache-Control"]
  end

  # The counts below are the cache's reads and writes for a page of 2
  # sections, 4 columns and 12 widgets. Each level is one read_multi: the
  # page's sections at once, then, for a section the cache did not have,
  # its columns at once, and so on down.
  def shape(calls) = calls.map { |call| [ call.operation, call.keys.size, call.hits.size ] }

  test "the first visit draws every block and keeps each; the next is one read of the whole page" do
    published

    calls = with_page_cache { get "/tides" }

    assert_response :ok
    first = response.body
    assert_equal [ 1, 1 + 1 + 2 + 4 ], [ calls.count { |c| c.operation == :read }, reads(calls) ]
    assert_equal 1 + 2 + 4 + 12, written(calls), "the page, its sections, columns and widgets"
    assert_equal 0, found(calls)

    calls = with_page_cache { get "/tides" }

    assert_response :ok
    assert_equal first, response.body
    assert_equal [ [ :read, 1, 1 ] ], shape(calls)
    assert_cacheable "/tides"
  end

  test "one widget changed and published: only it, its column and its section are drawn again, with the new page around them" do
    page = published
    with_page_cache { get "/tides" }

    document = grid_document(changed: "s2c1w3")
    publish(page, document)
    calls = with_page_cache { get "/tides" }

    assert_response :ok
    assert_select "main [data-block-id=s2c1w3] p", text: "Changed words"
    assert_equal 4, reads(calls), "the page, then one read per level down to the widget"
    assert_equal 1 + 2 + 2 + 3, asked(calls)
    assert_equal 1 + 1 + 2, found(calls), "the other section, the other column, the other two widgets"
    assert_equal 4, written(calls), "the widget, its column, its section, and the page"
    assert_equal drawn_directly(document), main_of(response.body)
  end

  test "a change of the site style draws the page around blocks that are all read from the cache" do
    published
    with_page_cache { get "/tides" }

    SiteStyle.create!(id: SiteStyle::ID, palette: SiteTokens.default_palette.merge("primary" => "site-harbour"), type_scale: "strong")
    calls = with_page_cache { get "/tides" }

    assert_select ".site[data-primary=site-harbour][data-type-scale=strong]"
    assert_equal [ [ :read, 1, 0 ], [ :read_multi, 2, 2 ], [ :write, 1, 0 ] ], shape(calls)
    assert_equal drawn_directly(grid_document), main_of(response.body)
  end

  test "a new release finds none of the fragments of the one before" do
    published
    with_page_cache { get "/tides" }

    calls = as_release("a-release-after-this-one") { with_page_cache { get "/tides" } }

    assert_equal 0, found(calls)
    assert_equal 1 + 2 + 4 + 12, written(calls)
  end

  test "the blocks of one page are reused by another that has the same ones" do
    published(slug: "tides")
    with_page_cache { get "/tides" }

    published(slug: "tides-again")
    calls = with_page_cache { get "/tides-again" }

    assert_equal [ [ :read, 1, 0 ], [ :read_multi, 2, 2 ], [ :write, 1, 0 ] ], shape(calls)
  end

  # Every type of block, with media the library does not have, deep text
  # and long pages: the bytes of a cached page are those its partials
  # draw, whether its blocks were drawn, read from the cache one by one,
  # or read with the whole page.
  test "the 500-block page is the same bytes drawn, read block by block, and read whole" do
    document = JSON.parse(Rails.root.join("..", "contract", "fixtures", "large-500.json").read)
    # The library items it names, as rows with no file: a save accepts
    # the document, and the page leaves those images out, cached or not.
    now = Time.current
    MediaItem.insert_all!(BlockDocument.media_refs(document).map(&:last).uniq.map { |id| { public_id: id, alt: "", width: 800, height: 600, created_at: now, updated_at: now } })
    published(document: document)
    expected = drawn_directly(document)

    cold = with_page_cache { get "/tides" }
    assert_equal expected, main_of(response.body)
    SiteStyle.create!(id: SiteStyle::ID, palette: SiteTokens.default_palette, type_scale: "strong")
    blocks = with_page_cache { get "/tides" }
    assert_equal expected, main_of(response.body)
    page = response.body
    whole = with_page_cache { get "/tides" }
    assert_equal page, response.body

    assert_operator written(cold), :>, 500
    assert_equal [ [ :read, 1, 0 ], [ :read_multi, document["sections"].size, document["sections"].size ], [ :write, 1, 0 ] ], shape(blocks)
    assert_equal [ [ :read, 1, 1 ] ], shape(whole)
  end

  test "the preview neither reads nor writes the cache" do
    page = published

    calls = with_page_cache { get "/preview/#{page.id}" }

    assert_response :ok
    assert_equal [], calls
  end

  # With forgery protection on, as in production (see PublicPagesTest).
  test "no answer of a cached page sets a cookie or carries a CSRF token, and one read whole keeps the policy of one drawn" do
    published
    before = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true

    drawn = with_page_cache { get "/tides" }
    assert_response :ok
    assert_nil response.headers["Set-Cookie"]
    assert_select "meta[name=csrf-token], meta[name=csrf-param]", false
    policy = response.headers["Content-Security-Policy"]
    assert_includes policy, "script-src 'none'"
    whole = with_page_cache { get "/tides" }
    assert_response :ok
    assert_nil response.headers["Set-Cookie"]
    assert_select "meta[name=csrf-token], meta[name=csrf-param]", false
    assert_equal policy, response.headers["Content-Security-Policy"], "a page read whole from the cache keeps its policy"
    with_page_cache { get "/tides", headers: { "If-None-Match" => response.headers["ETag"] } }
    assert_response :not_modified
    assert_nil response.headers["Set-Cookie"]

    assert_equal [ 19, 1 ], [ written(drawn), found(whole) ], "the three answers were drawn, read whole, and 304"
  ensure
    ActionController::Base.allow_forgery_protection = before
  end

  # A browser sends this host's cookies to every port of it: another app
  # on 127.0.0.1, or a session cookie of the app's own name, arrives with
  # the visit. A page that looked at the session would answer with one.
  test "a visitor who brings cookies gets none back, from a drawn page, a cached one or a 304" do
    published
    cookies = { "Cookie" => "_cms_session=not-a-session-of-this-app; theme=dark" }

    with_page_cache { get "/tides", headers: cookies }
    assert_response :ok
    assert_nil response.headers["Set-Cookie"]
    with_page_cache { get "/tides", headers: cookies }
    assert_nil response.headers["Set-Cookie"]
    with_page_cache { get "/tides", headers: cookies.merge("If-None-Match" => response.headers["ETag"]) }
    assert_response :not_modified
    assert_nil response.headers["Set-Cookie"]
  end

  private

  # The blocks of a document drawn straight by their partials, with no
  # cache anywhere: what the main element of a cached page must hold.
  def drawn_directly(document)
    ApplicationController.render(inline: "<%= render_document(document, media: media) %>",
                                 locals: { document: document, media: MediaResolver.for_document(document) })
  end

  # The blocks inside the main element, without the two line breaks the
  # layout and pages/show put after them.
  def main_of(body)
    body[%r{<main id="main_content">\n(.*)\n\n</main>}m, 1] or flunk("no main element in:\n#{body}")
  end

  # The server as a later release of it, whose digest is another.
  def as_release(revision)
    current = PageCache.method(:revision)
    PageCache.define_singleton_method(:revision) { revision }
    yield
  ensure
    PageCache.define_singleton_method(:revision, current)
  end
end
