require "test_helper"

# A published page as a browser and the server's cache keep it: what the
# visitor gets back for the validator they hold, after each thing that
# changes the page (a publish, a restore then published, the site style, a
# new release).
class PageCacheTest < ActionDispatch::IntegrationTest
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

  private

  # The server as a later release of it, whose digest is another.
  def as_release(revision)
    current = PageCache.method(:revision)
    PageCache.define_singleton_method(:revision) { revision }
    yield
  ensure
    PageCache.define_singleton_method(:revision, current)
  end
end
