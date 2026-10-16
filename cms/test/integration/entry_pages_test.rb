require "test_helper"

# The pages of a collection's entries, asked for the way a browser asks:
# /<prefix>/<slug> drawn with the collection's published template and the
# entry's published values, inside the site's header and footer; a draft,
# an unknown slug, an unknown prefix, a template with nothing live, each
# the 404 page; an old address of a live entry moved for good; the
# preview of a template, and of an entry's draft; and the Collection lists
# of a page, drawing what is live.
class EntryPagesTest < ActionDispatch::IntegrationTest
  include CollectionCases
  include StoredFiles

  setup do
    @news = create_news
  end

  def field_block(id, field, level: nil, style: { "base" => {} })
    props = { "field" => field }
    props["level"] = level if level
    { "id" => id, "type" => "field", "props" => props, "style" => style, "children" => [] }
  end

  def list_block(id, collection, **props)
    { "id" => id, "type" => "collectionList", "style" => { "base" => {} }, "children" => [],
      "props" => { "collection" => collection.id, "count" => 3, "order" => { "by" => "day", "direction" => "desc" }, "layout" => "grid", "columns" => 3,
                   "date" => "day", "excerpt" => "summary", "linkLabel" => "Read more", "emptyText" => "Nothing yet." }.merge(props.transform_keys(&:to_s)) }
  end

  # The template of News: the entry's title as the page's heading, its
  # summary, its day and its level.
  def publish_template(collection = @news, widgets: [ field_block("t", "title", level: 1), field_block("s", "summary"), field_block("d", "day"), field_block("l", "level") ])
    template = collection.template
    Draft.save_document!(page_id: template.id, revision: template.draft.revision, document: page_document(title: "News entry", widgets: widgets), save_id: "t#{template.draft.revision}")
    template.publish!
    template.reload
  end

  def publish_entry(title: "Dawn swims start again", slug: "dawn-swims", values: {})
    entry = Entry.create_checked!(@news, news_entry(title: title, slug: slug, values: values))
    entry.publish!
    entry.reload
  end

  def save_entry(entry, **changes)
    Entry.save_checked!(@news, entry.id, revision: entry.reload.revision, save_id: "s#{entry.revision}", entry: news_entry(**changes))
  end

  test "an entry's page is its collection's published template drawn with what it published, under its title, in the site's header and footer" do
    publish_template
    entry = publish_entry(values: { "summary" => "Twice a week at first light.\n\nBring a <bright> cap.", "level" => "Improver" })
    save_entry(entry, title: "Not live yet", values: { "summary" => "A draft." })

    get "/news/dawn-swims"

    assert_response :ok
    assert_select "title", text: "Dawn swims start again"
    assert_select %(meta[name=description][content="Twice a week at first light. Bring a <bright> cap."])
    assert_select "header.sw-header [data-block-type=logo]"
    assert_select "main [data-block-type=field][data-field=title] h1", text: "Dawn swims start again"
    assert_equal [ "Twice a week at first light.", "Bring a <bright> cap." ], css_select("main [data-field=summary] p").map(&:text)
    assert_select "main [data-field=day] time[datetime='2026-05-02']", text: "May 2, 2026"
    assert_select "main [data-field=level] p", text: "Improver"
    assert_no_match "Not live yet", response.body
    assert_no_match "A draft.", response.body
    assert_equal "default-src 'none'", response.headers["Content-Security-Policy"].split(";").first
    assert_no_match(/<script\b/, response.body)
  end

  test "a draft, an unknown slug, an unknown prefix and a template with nothing live are the site's 404 page" do
    publish_template
    publish_entry
    Entry.create_checked!(@news, news_entry(title: "Still a draft", slug: "still-a-draft"))
    events = Collection.create_with_template!(news_definition(prefix: "events", name: "Events"))
    events_entry = Entry.create_checked!(events, news_entry(slug: "dawn-swims"))
    events_entry.publish!

    [ "/news/still-a-draft", "/news/no-such-entry", "/no-such-prefix/dawn-swims", "/events/dawn-swims" ].each do |path|
      get path

      assert_response :not_found, path
      assert_select "h1", { text: "There is no page here" }, path
    end
    get "/news/dawn-swims"
    assert_response :ok
  end

  test "an unpublished entry's page is gone; published again, it is back" do
    publish_template
    entry = publish_entry
    entry.unpublish!

    get "/news/dawn-swims"
    assert_response :not_found

    entry.publish!
    get "/news/dawn-swims"
    assert_response :ok
  end

  test "an entry published under a new slug answers at it, and its old address moves there for good" do
    publish_template
    entry = publish_entry(slug: "dawn-swims")
    save_entry(entry, slug: "dawn-swims-2026")

    get "/news/dawn-swims"
    assert_response :ok, "the old address stays live until the next publish"

    entry.reload.publish!
    get "/news/dawn-swims"
    assert_response :moved_permanently
    assert_equal "/news/dawn-swims-2026", URI(response.location).path
    get "/news/dawn-swims-2026"
    assert_select "main h1", text: "Dawn swims start again"

    entry.reload.unpublish!
    get "/news/dawn-swims"
    assert_response :not_found, "an old address of an entry that is no longer live leads nowhere"
  end

  test "the entry's own description is its first paragraph field's value, on one line, cut at a word; else its template's" do
    publish_template
    publish_entry(slug: "long", values: { "summary" => "#{'Cold water and warm tea. ' * 8}End." })
    template = @news.template
    document = page_document(title: "News entry", widgets: [ field_block("t", "title", level: 1) ]).merge("description" => "News from the club.")
    Draft.save_document!(page_id: template.id, revision: template.draft.reload.revision, document: document, save_id: "described")
    template.publish!

    get "/news/long"
    description = css_select("meta[name=description]").first["content"]
    assert_equal "#{'Cold water and warm tea. ' * 6}Cold…", description
    assert_operator description.length, :<=, Entry::DESCRIPTION_LENGTH

    @news.update_definition!({ "fields" => @news.fields.map { |field| field["key"] == "summary" ? field.merge("required" => false) : field } })
    entry = Entry.create_checked!(@news, { "title" => "No summary", "slug" => "no-summary", "values" => { "day" => "2026-05-03", "level" => "Beginner" } })
    entry.publish!
    get "/news/no-summary"
    assert_select %(meta[name=description][content="News from the club."])
  end

  test "an entry's address is two parts in a slug's form, after every one the site answers itself: a page's, a form's confirmation, the preview" do
    assert_recognizes({ controller: "entry_pages", action: "show", prefix: "news", slug: "dawn-swims" }, "/news/dawn-swims")
    assert_recognizes({ controller: "pages", action: "show", slug: "news" }, "/news")
    assert_recognizes({ controller: "submissions", action: "show", form: "join" }, "/sent/join")
    assert_recognizes({ controller: "previews", action: "show", page_id: "12" }, "/preview/12")
    assert_recognizes({ controller: "submissions", action: "show", slug: "winter", form: "join" }, "/winter/sent/join")
    get "/news/Dawn-Swims"
    assert_response :not_found
    get "/news/dawn.swims"
    assert_response :not_found
  end

  # The usual shape of a site's section: the page that lists the entries at
  # their prefix. A page's address is one part and an entry's two, so the
  # two never meet.
  test "a page at a collection's prefix is that page, and the prefix with an entry's slug is the entry" do
    publish_template
    publish_entry(title: "Dawn swims start again", slug: "dawn-swims")
    page = create_page(title: "News", slug: "news")
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: "News", widgets: [ heading_block("h", "News from the club"), list_block("list", @news) ]), save_id: "n1")
    page.publish!

    get "/news"
    assert_response :ok
    assert_select "title", text: "News"
    assert_select "main [data-block-type=heading] h1", text: "News from the club"
    assert_equal [ [ "Dawn swims start again", "/news/dawn-swims" ] ], css_select("main .sw-entry-title a").map { |a| [ a.text, a["href"] ] }

    get "/news/dawn-swims"
    assert_response :ok
    assert_select "title", text: "Dawn swims start again"
    assert_select "main [data-field=title] h1", text: "Dawn swims start again"
    assert_select "main [data-block-type=collectionList]", false
  end

  test "a page's Collection list draws its collection's published entries, newest by its day first, each card linking to the entry's page" do
    publish_template
    publish_entry(title: "Dawn swims start again", slug: "dawn-swims", values: { "day" => "2026-05-02" })
    publish_entry(title: "Winter series", slug: "winter-series", values: { "day" => "2026-11-01" })
    Entry.create_checked!(@news, news_entry(title: "A draft", slug: "a-draft", values: { "day" => "2026-12-01" }))
    page = create_page(title: "News", slug: "club-news")
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: "News", widgets: [ list_block("list", @news) ]), save_id: "n1")
    page.publish!

    get "/club-news"

    assert_equal [ [ "Winter series", "/news/winter-series" ], [ "Dawn swims start again", "/news/dawn-swims" ] ], css_select(".sw-entry-title a").map { |a| [ a.text, a["href"] ] }
    assert_equal [ "Nov 1, 2026", "May 2, 2026" ], css_select(".sw-entry-date time").map(&:text)
    assert_select ".sw-entry-more[aria-hidden=true]", count: 2
    assert_equal [ @news.id ], page.reload.listed_collections
  end

  test "on an entry's page, a list of its collection leaves that entry out and shows as many others; a list of another collection leaves nothing out" do
    events = create_news(prefix: "events")
    publish_template(widgets: [ field_block("t", "title", level: 1), list_block("more", @news, count: 2), list_block("other", events, count: 2) ])
    publish_entry(title: "Dawn swims start again", slug: "dawn-swims", values: { "day" => "2026-05-02" })
    publish_entry(title: "Winter series", slug: "winter-series", values: { "day" => "2026-11-01" })
    publish_entry(title: "Tide tables", slug: "tide-tables", values: { "day" => "2026-09-01" })
    elsewhere = Entry.create_checked!(events, news_entry(title: "Winter series", slug: "winter-series", values: { "day" => "2026-11-01" }))
    elsewhere.publish!

    get "/news/winter-series"

    assert_equal [ "Tide tables", "Dawn swims start again" ], css_select("[data-block-id=more] .sw-entry-title a").map(&:text)
    assert_equal [ "Winter series" ], css_select("[data-block-id=other] .sw-entry-title a").map(&:text)

    get "/news/tide-tables"

    assert_equal [ "Winter series", "Dawn swims start again" ], css_select("[data-block-id=more] .sw-entry-title a").map(&:text)
  end

  test "an entry's image, which no page names, is drawn from the library on its card and on its page" do
    item = MediaItem.create!(file: uploaded_blob(png_bytes(width: 3, height: 2)), width: 3, height: 2)
    publish_template(widgets: [ field_block("t", "title", level: 1), field_block("p", "picture") ])
    publish_entry(values: { "picture" => { "mediaId" => item.public_id, "alt" => "The jetty at dawn" } })
    page = create_page(title: "News", slug: "club-news")
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: "News", widgets: [ list_block("list", @news, image: "picture") ]), save_id: "n1")
    page.publish!

    [ "/club-news", "/news/dawn-swims" ].each do |path|
      get path

      image = css_select("main img").first
      assert_not_nil image, path
      assert_equal [ "3", "2", "The jetty at dawn" ], [ image["width"], image["height"], image["alt"] ], path
      assert_match %r{\A/rails/active_storage/blobs/proxy/}, image["src"], path
    end
  end

  test "a page or a header refuses a Field block, which only a template holds; a template keeps it" do
    page = create_page(title: "News", slug: "club-news")
    error = assert_raises(BlockDocument::Invalid) { Draft.save_document!(page_id: page.id, revision: 0, document: page_document(widgets: [ field_block("f", "title", level: 1) ]), save_id: "f1") }
    assert_equal [ [ "#{Documents::FIRST_WIDGET}", "field" ] ], error.errors.map { |e| [ e.pointer, e.keyword ] }

    header = Page.part!("header")
    error = assert_raises(BlockDocument::Invalid) { Draft.save_document!(page_id: header.id, revision: header.draft.revision, document: page_document(widgets: [ field_block("f", "title") ]), save_id: "h1") }
    assert_equal [ [ "#{Documents::FIRST_WIDGET}", "field" ] ], error.errors.map { |e| [ e.pointer, e.keyword ] }

    template = publish_template
    assert_equal "field", template.published_version.document.dig("sections", 0, "children", 0, "children", 0, "type")
  end

  test "a template's preview is its draft with an entry's draft: the one its address names, else the first published, else values made up; never stored" do
    template = publish_template
    entry = publish_entry(title: "Dawn swims start again", slug: "dawn-swims", values: { "day" => "2026-05-02" })
    later = Entry.create_checked!(@news, news_entry(title: "A later draft", slug: "later", values: { "day" => "2026-12-01" }))
    save_entry(entry, title: "Dawn swims, the draft")

    get "/preview/#{template.id}"
    assert_response :ok
    assert_equal "no-store", response.headers["Cache-Control"]
    assert_select "title", text: "Preview: Dawn swims, the draft"
    assert_select "main [data-field=title] h1", text: "Dawn swims, the draft"

    get "/preview/#{template.id}?entry=#{later.id}"
    assert_select "main [data-field=title] h1", text: "A later draft"

    get "/preview/#{template.id}?entry=sample"
    assert_select "main [data-field=title] h1", text: CollectionTemplate::SAMPLE_TITLE
    assert_select "main [data-field=summary] p", text: "Summary: a few lines, as each entry writes them."
    assert_select "main [data-field=level] p", text: "Beginner"

    events = Collection.create_with_template!(news_definition(prefix: "events", name: "Events"))
    get "/preview/#{events.template.id}?entry=#{entry.id}"
    assert_select "main", { text: /\A\s*\z/ }, "an entry of another collection is no entry of this one: the made-up values, of a template with no section"
  end
end
