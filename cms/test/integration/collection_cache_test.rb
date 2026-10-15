require "test_helper"

# The pages that draw a collection's entries as a browser and the server's
# cache keep them: a page holding a Collection list is a new page at every
# change a visitor could see of its collection (a publish, an unpublish, a
# delete, a new address, a change of its fields), and at none of the
# others (a save of a draft); an entry's page at every change of what the
# entry, its template or its collection's fields give it. Solid Cache
# draws again only the list and what holds it.
class CollectionCacheTest < ActionDispatch::IntegrationTest
  include CollectionCases
  include PageCacheStore

  # The header and footer with no section, so the counts are the page's.
  EMPTY_PARTS = %w[header footer].to_h { |kind| [ kind, { "schemaVersion" => 1, "title" => kind.capitalize, "sections" => [] }.freeze ] }.freeze

  setup do
    @starters = Rails.configuration.x.parts
    Rails.configuration.x.parts = EMPTY_PARTS
    @news = create_news
  end

  teardown do
    Rails.configuration.x.parts = @starters
  end

  def list_block(id)
    { "id" => id, "type" => "collectionList", "style" => { "base" => {} }, "children" => [],
      "props" => { "collection" => @news.id, "count" => 3, "order" => { "by" => "day", "direction" => "desc" }, "layout" => "list", "columns" => 3, "date" => "day", "linkLabel" => "", "emptyText" => "Nothing yet." } }
  end

  def field_block(id, field, level: nil)
    { "id" => id, "type" => "field", "props" => { "field" => field, **(level ? { "level" => level } : {}) }, "style" => { "base" => {} }, "children" => [] }
  end

  # A page of one section and one column: a heading, the list, a heading.
  def publish_page(slug, widgets)
    page = create_page(title: slug.capitalize, slug: slug)
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: slug.capitalize, widgets: widgets), save_id: "p1")
    page.publish!
    page.reload
  end

  def publish_entry(title:, slug:, day: "2026-05-02")
    entry = Entry.create_checked!(@news, news_entry(title: title, slug: slug, values: { "day" => day }))
    entry.publish!
    entry.reload
  end

  def publish_template(widgets)
    template = Page.includes(:draft).find(@news.template.id)
    Draft.save_document!(page_id: template.id, revision: template.draft.revision, document: page_document(title: "Entry", widgets: widgets), save_id: "t#{template.draft.revision}")
    template.publish!
  end

  # The ETag of a visit now, and whether the one held still stands.
  def visit(path, held = nil)
    get path, headers: held ? { "If-None-Match" => held } : {}
    response.headers["ETag"]
  end

  test "a page listing a collection is a new page at every change a visitor could see of it, and at none other; a page listing none keeps its own" do
    publish_page("club-news", [ heading_block("h1", "News"), list_block("list") ])
    publish_page("plain", [ heading_block("h1", "Plain") ])
    entry = publish_entry(title: "Dawn swims", slug: "dawn-swims")
    held = visit("/club-news")
    assert_select ".sw-entry-title", text: "Dawn swims"
    plain = visit("/plain")

    Entry.save_checked!(@news, entry.id, revision: entry.revision, save_id: "draft", entry: news_entry(title: "Dawn swims, a draft", slug: "dawn-swims"))
    visit("/club-news", held)
    assert_response :not_modified, "a save of a draft changes nothing a visitor sees"

    changes = {
      "a new entry published" => -> { publish_entry(title: "Winter series", slug: "winter-series", day: "2026-11-01") },
      "an entry published again" => -> { entry.reload.publish! },
      "an entry unpublished" => -> { entry.reload.unpublish! },
      "an entry deleted" => -> { Entry.find_by!(slug: "winter-series").delete_entry! },
      "a field renamed" => -> { @news.update_definition!({ "fields" => @news.reload.fields.map { |f| f["key"] == "day" ? f.merge("label" => "Date") : f } }) }
    }
    changes.each do |what, change|
      change.call
      now = visit("/club-news", held)
      assert_response :ok, what
      assert_not_equal held, now, what
      held = now
      visit("/plain", plain)
      assert_response :not_modified, "#{what}: a page listing no collection keeps its validator"
    end
    visit("/club-news")
    assert_select ".sw-entries-empty", text: "Nothing yet."
  end

  test "an entry published redraws the list, its column, its section and the page; the other blocks are read back" do
    publish_page("club-news", [ heading_block("h1", "News"), list_block("list"), heading_block("h2", "More") ])
    publish_entry(title: "Dawn swims", slug: "dawn-swims")
    first = with_page_cache { get "/club-news" }
    assert_equal 6, written(first), "the page, its section, its column and its three widgets"

    publish_entry(title: "Winter series", slug: "winter-series", day: "2026-11-01")
    second = with_page_cache { get "/club-news" }

    assert_equal [ "Winter series", "Dawn swims" ], css_select(".sw-entry-title a").map(&:text)
    assert_equal 4, written(second), "the list, its column, its section and the page"
    assert_equal 2, found(second), "the two headings"
  end

  test "an entry's page is a new page when it is published with other values, its template is published, or its collection's fields change; a save of its draft changes nothing" do
    publish_template([ field_block("t", "title", level: 1), field_block("d", "day") ])
    entry = publish_entry(title: "Dawn swims", slug: "dawn-swims")
    held = visit("/news/dawn-swims")
    assert_response :ok
    visit("/news/dawn-swims", held)
    assert_response :not_modified

    Entry.save_checked!(@news, entry.id, revision: entry.revision, save_id: "draft", entry: news_entry(title: "Dawn swims, in May", slug: "dawn-swims"))
    visit("/news/dawn-swims", held)
    assert_response :not_modified, "a save of a draft changes nothing a visitor sees"

    changes = {
      "the entry published with its new title" => -> { entry.reload.publish! },
      "the template published" => -> { publish_template([ field_block("t", "title", level: 2), field_block("d", "day") ]) },
      "a field of the collection renamed" => -> { @news.update_definition!({ "fields" => @news.reload.fields.map { |f| f["key"] == "summary" ? f.merge("label" => "In short") : f } }) },
      "another entry published, which a list on the entry's page shows" => lambda {
        publish_template([ field_block("t", "title", level: 2), list_block("more") ])
        held = visit("/news/dawn-swims")
        publish_entry(title: "Winter series", slug: "winter-series", day: "2026-11-01")
      }
    }
    changes.each do |what, change|
      change.call
      now = visit("/news/dawn-swims", held)
      assert_response :ok, what
      assert_not_equal held, now, what
      held = now
    end
    assert_select "main h2", text: "Dawn swims, in May"
    assert_select ".sw-entry-title", text: "Winter series"
  end

  test "an entry's page is cached as a page is: drawn once, then read whole; its fields share what two entries draw alike" do
    publish_template([ field_block("t", "title", level: 1), field_block("d", "day") ])
    publish_entry(title: "Dawn swims", slug: "dawn-swims")
    publish_entry(title: "Night swims", slug: "night-swims")

    first = with_page_cache { get "/news/dawn-swims" }
    again = with_page_cache { get "/news/dawn-swims" }
    other = with_page_cache { get "/news/night-swims" }

    assert_equal 5, written(first), "the page, its section, its column and its two fields"
    assert_equal [ 1, 1, 0 ], [ reads(again), found(again), written(again) ]
    assert_select "main h1", text: "Night swims"
    assert_equal 4, written(other), "a page, a section, a column and the title of its own; the day, the same as the other entry's, is read back"
  end

  test "an entry's page's list of its collection, cached, still leaves out the entry each page is drawn with" do
    publish_template([ field_block("t", "title", level: 1), list_block("more") ])
    publish_entry(title: "Dawn swims", slug: "dawn-swims", day: "2026-05-02")
    publish_entry(title: "Night swims", slug: "night-swims", day: "2026-06-02")

    with_page_cache { get "/news/dawn-swims" }
    assert_equal [ "Night swims" ], css_select("[data-block-id=more] .sw-entry-title").map(&:text)
    with_page_cache { get "/news/night-swims" }
    assert_equal [ "Dawn swims" ], css_select("[data-block-id=more] .sw-entry-title").map(&:text)
  end
end
