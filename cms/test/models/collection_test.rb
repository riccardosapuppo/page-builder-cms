require "test_helper"

class CollectionTest < ActiveSupport::TestCase
  include CollectionCases
  include StoredFiles

  test "a collection is made with its template: a page of kind template, its own, an empty document with its name, no address and nothing live" do
    collection = create_news

    template = collection.template
    assert_equal [ "template", collection.id, nil, false, nil ], [ template.kind, template.collection_id, template.slug, template.home, template.published_version_id ]
    assert_equal({ "schemaVersion" => 1, "title" => "News", "sections" => [] }, template.draft.document)
    assert_nil template.draft.slug
    assert_equal [ 0, 0 ], [ template.draft.revision, collection.published_revision ]
    assert_equal news_definition, collection.definition
  end

  test "a definition the schema or the rules refuse is refused whole, every fault at its pointer, and nothing is made" do
    definition = news_definition
    definition["fields"][1]["key"] = "summary"
    definition["fields"][3]["label"] = ""
    definition["sort"]["by"] = "booking"

    error = assert_raises(CollectionDocument::Invalid) { Collection.create_with_template!(definition) }

    assert_equal [ [ "/fields/1/key", "uniqueKey" ], [ "/sort/by", "sortField" ], [ "/fields/3/label", "pattern" ] ], error.errors.map { |e| [ e.pointer, e.keyword ] }
    assert_equal 0, Collection.count
    assert_equal 0, Page.where(kind: "template").count
  end

  test "a prefix another collection has, a page's next or live address, or one the application answers itself is refused at the prefix" do
    create_news(prefix: "news")
    live = Page.create_with_draft!(title: "Tides", slug: "tides")
    live.publish!
    live.draft.update!(slug: "tide-times")

    { "news" => "is already the prefix of another collection", "tides" => "is already the address of a page", "tide-times" => "is already the address of a page",
      "api" => "is an address the application uses itself", "404" => "is an address the application uses itself", "sent" => "is an address the application uses itself" }.each do |prefix, words|
      error = assert_raises(ActiveRecord::RecordInvalid, prefix) { create_news(prefix: prefix) }
      assert_equal [ words ], error.record.errors[:prefix], prefix
    end
    assert_equal [ "news" ], Collection.pluck(:prefix)
  end

  test "a page cannot take a collection's prefix as its address, new or next" do
    create_news(prefix: "news")

    error = assert_raises(ActiveRecord::RecordInvalid) { Page.create_with_draft!(title: "News", slug: "news") }
    assert_equal [ "is already the prefix of a collection" ], error.record.errors[:slug]
    page = Page.create_with_draft!(title: "Latest", slug: "latest")
    assert_not page.draft.update(slug: "news")
    assert_equal [ "is already the prefix of a collection" ], page.draft.errors[:slug]
  end

  test "a change of the definition counts as a change visitors may see, and one that changes nothing does not" do
    collection = create_news

    collection.update_definition!({ "name" => "Newsroom" })
    assert_equal [ "Newsroom", 1 ], [ collection.name, collection.published_revision ]
    collection.update_definition!({ "name" => "Newsroom", "prefix" => "news" })
    assert_equal 1, collection.reload.published_revision
    collection.update_definition!({ "fields" => news_definition["fields"].first(4), "sort" => { "by" => "title", "direction" => "asc" } })
    assert_equal [ 4, 2 ], [ collection.reload.fields.size, collection.published_revision ]
  end

  # Two requests that load one collection: one changes its fields, the
  # other only its name. The second merges its change into the definition
  # as it is when its transaction runs, not as it was loaded, so neither
  # change is lost.
  test "a change of one member merges into the definition as it stands, not as it was loaded" do
    collection = create_news
    loaded_early = Collection.find(collection.id)

    Collection.find(collection.id).update_definition!({ "fields" => news_definition["fields"].first(4), "sort" => { "by" => "title", "direction" => "asc" } })
    loaded_early.update_definition!({ "name" => "Newsroom" })

    collection.reload
    assert_equal [ "Newsroom", 4, "title" ], [ collection.name, collection.fields.size, collection.default_sort["by"] ]
    assert_equal 2, collection.published_revision
  end

  test "a field the sort follows does not go without a new sort" do
    collection = create_news

    error = assert_raises(CollectionDocument::Invalid) { collection.update_definition!({ "fields" => news_definition["fields"].first(3) }) }

    assert_equal [ [ "/sort/by", "sortField" ] ], error.errors.map { |e| [ e.pointer, e.keyword ] }
    assert_equal 8, collection.reload.fields.size
  end

  test "deleting a collection deletes its entries, their old addresses, its template with its draft and versions, and their images' record" do
    item = MediaItem.create!(file: uploaded_blob(png_bytes), width: 2, height: 1)
    collection = create_news
    entry = Entry.create_checked!(collection, news_entry(values: { "picture" => { "mediaId" => item.public_id, "alt" => "The jetty" } }))
    entry.publish!
    Entry.save_checked!(collection, entry.id, revision: 0, save_id: "s1", entry: news_entry(slug: "dawn-swims-again"))
    entry.reload.publish!
    template = collection.template
    Draft.save_document!(page_id: template.id, revision: 0, document: page_document(widgets: [ image_block("i1", item.public_id) ]), save_id: "t1")
    template.publish!
    assert_equal 1, EntryRedirect.count

    collection.destroy!

    assert_equal [ 0, 0, 0, 0, 0, 0 ], [ Entry.count, EntryRedirect.count, Page.where(kind: "template").count, Draft.where(page_id: template.id).count,
                                         PageVersion.where(page_id: template.id).count, MediaUsage.where(media_item: item).count ]
    item.destroy_unless_used!
    assert_not MediaItem.exists?(item.id)
  end

  test "a template's document is a page's, held to a page's rules and with no form, refused at the form block, keyword template" do
    form = { "id" => "f", "type" => "form", "props" => { "items" => [ { "name" => "email", "kind" => "email", "label" => "Email", "required" => true } ],
                                                         "submitLabel" => "Send", "confirmation" => "Thank you." }, "children" => [], "style" => { "base" => {} } }
    anchored = page_document
    anchored["sections"][0]["props"]["anchor"] = "top"

    assert CollectionTemplate.check(anchored).ok?
    errors = CollectionTemplate.check(page_document(widgets: [ heading_block("h", "Join"), form ])).errors
    assert_equal [ [ "/sections/0/children/0/children/1", "template", "/sections/0/children/0/children/1" ] ], errors.map { |e| [ e.pointer, e.keyword, e.block_pointer ] }
    assert_equal CollectionTemplate::FORM, errors.first.message
  end

  test "a template has no address and is never the home page, and only a template belongs to a collection" do
    template = create_news.template

    assert_raises(Page::Part) { template.make_home! }
    template.slug = "news-template"
    assert_not template.valid?
    assert_equal [ "is not for a template, which draws its entries at theirs" ], template.errors[:slug]
    page = Page.create_with_draft!(title: "Tides", slug: "tides")
    page.collection_id = template.collection_id
    assert_not page.valid?
    assert page.errors[:collection_id].any?
  end
end
