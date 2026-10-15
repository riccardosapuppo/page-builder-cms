require "test_helper"

# A collection's entries through the API: made, listed, searched and
# ordered, read, saved at a revision, published, unpublished and deleted.
# Every answer here is held to openapi.yaml.
class Api::EntriesTest < ActionDispatch::IntegrationTest
  include CollectionCases
  include StoredFiles

  setup do
    @news = create_news
    @base = "/api/collections/#{@news.id}/entries"
  end

  def make(**entry)
    api :post, @base, news_entry(**entry)
    assert_response :created
    json
  end

  def put_entry(id, revision:, save_id:, **entry)
    api :put, "#{@base}/#{id}", { "revision" => revision, "saveId" => save_id, **news_entry(**entry) }
  end

  test "an entry is made, read back, and refused at each value its fields refuse" do
    made = make(values: { "places" => 24, "booking" => { "label" => "Book a place", "href" => "/join" } })
    assert_equal [ "Dawn swims start again", "dawn-swims", 0, nil, nil ], made.values_at("title", "slug", "revision", "lastSaveId", "published")
    assert_equal @news.id, made["collectionId"]

    api :get, "#{@base}/#{made['id']}"
    assert_response :ok
    assert_equal made, json

    api :post, @base, news_entry(slug: "second", values: { "level" => "Expert", "day" => "2026-02-30", "summery" => "x" })
    assert_response :unprocessable_content
    assert_equal "invalid_request", json["error"]
    assert_equal [ [ "/values/summery", "unknownField" ], [ "/values/day", "dateExists" ], [ "/values/level", "enum" ] ], error_pointers
    api :post, @base, news_entry(slug: "dawn-swims")
    assert_response :unprocessable_content
    assert_equal [ [ "/slug", "taken" ] ], error_pointers
  end

  test "an entry is found only under its own collection" do
    made = make
    events = create_news(prefix: "events")

    api :get, "/api/collections/#{events.id}/entries/#{made['id']}"
    assert_response :not_found
    api :get, "/api/collections/987654321/entries"
    assert_response :not_found
  end

  test "a save at the revision is kept; from a revision another tab has moved past it is a conflict naming where the entry is; the same save sent again is saved" do
    id = make["id"]

    put_entry(id, revision: 0, save_id: "s-1", title: "Dawn swims, from May")
    assert_response :ok
    assert_equal [ 1, "s-1", "Dawn swims, from May" ], json.values_at("revision", "lastSaveId", "title")
    put_entry(id, revision: 0, save_id: "s-1", title: "Dawn swims, from May")
    assert_response :ok
    assert_equal 1, json["revision"]
    put_entry(id, revision: 0, save_id: "s-2", title: "Another tab's")
    assert_response :conflict
    assert_equal [ "conflict", 1, "s-1" ], json.values_at("error", "currentRevision", "lastSaveId")
    assert_equal "The entry has changed since the revision sent.", json["message"]

    api :put, "#{@base}/#{id}", { "revision" => -1, "saveId" => "not one", **news_entry }
    assert_response :unprocessable_content
    assert_equal [ [ "/revision", "minimum" ], [ "/saveId", "pattern" ] ], error_pointers
  end

  test "a publish puts the draft live, at a revision or as it is, and later saves wait for the next" do
    id = make["id"]
    put_entry(id, revision: 0, save_id: "s-1", title: "Live words")

    api :post, "#{@base}/#{id}/publish", { "revision" => 1 }
    assert_response :ok
    assert_equal [ "Live words", "dawn-swims", 1 ], json["published"].values_at("title", "slug", "draftRevision")
    put_entry(id, revision: 1, save_id: "s-2", title: "Not live yet", slug: "dawn-swims-may")
    api :post, "#{@base}/#{id}/publish", { "revision" => 1 }
    assert_response :conflict
    assert_equal 2, json["currentRevision"]

    api :get, "/api/collections/#{@news.id}"
    assert_equal [ 1, 1, 1 ], json.values_at("publishedRevision", "entryCount", "publishedCount")
    api :post, "#{@base}/#{id}/publish"
    assert_response :ok
    assert_equal [ "Not live yet", "dawn-swims-may", 2 ], json["published"].values_at("title", "slug", "draftRevision")
    assert_equal [ [ "dawn-swims", id ] ], EntryRedirect.pluck(:from_slug, :entry_id)

    api :post, "#{@base}/#{id}/unpublish"
    assert_response :ok
    assert_nil json["published"]
    api :get, "/api/collections/#{@news.id}"
    assert_equal [ 3, 0 ], json.values_at("publishedRevision", "publishedCount")
  end

  test "a publish of an entry its fields no longer take is refused at the value" do
    id = make["id"]
    fields = news_definition["fields"]
    fields[4]["required"] = true
    api :patch, "/api/collections/#{@news.id}", { "fields" => fields }
    assert_response :ok

    api :post, "#{@base}/#{id}/publish"

    assert_response :unprocessable_content
    assert_equal [ [ "/values/places", "required" ] ], error_pointers
  end

  test "an entry deleted is gone, and deleting a live one moves the published revision" do
    id = make["id"]
    api :post, "#{@base}/#{id}/publish"

    api :delete, "#{@base}/#{id}"
    assert_response :no_content
    api :get, "#{@base}/#{id}"
    assert_response :not_found
    api :delete, "#{@base}/#{id}"
    assert_response :not_found
    assert_equal 2, @news.reload.published_revision
  end

  test "the entries are searched by title, and ordered by title, by a date field, by when they went live, or by the collection's sort" do
    tides = make(title: "Tide tables", slug: "tides", values: { "day" => "2026-03-01" })
    dawn = make(title: "Dawn swims", slug: "dawn", values: { "day" => "2026-05-02" })
    winter = make(title: "Winter series", slug: "winter", values: { "day" => "2026-11-20" })
    api :post, "#{@base}/#{tides['id']}/publish"
    api :post, "#{@base}/#{dawn['id']}/publish"
    listed = ->(query = "") { api(:get, "#{@base}#{query}") && json["entries"].map { |e| e["slug"] } }

    assert_equal %w[winter dawn tides], listed.call
    assert_equal %w[dawn tides winter], listed.call("?order=title")
    assert_equal %w[winter tides dawn], listed.call("?order=-title")
    assert_equal %w[tides dawn winter], listed.call("?order=day")
    assert_equal %w[dawn tides winter], listed.call("?order=-publishedAt")
    assert_equal %w[tides dawn winter], listed.call("?order=publishedAt")
    assert_equal %w[winter], listed.call("?q=WIN&order=title")
    assert_equal %w[dawn tides], listed.call("?q=a&order=title")
    assert_equal %w[winter], listed.call("?q=series")
    assert_equal [], listed.call("?q=nothing")
  end

  test "a query the list does not take is refused, naming its parameter" do
    { "?page=2" => "page", "?q=a&q=b" => "q", "?order=summary" => "order", "?order=Title" => "order", "?q=#{'x' * 201}" => "q" }.each do |query, parameter|
      api :get, "#{@base}#{query}"
      assert_response :bad_request, query
      assert_equal [ "invalid_query", parameter ], json.values_at("error", "parameter"), query
    end
  end

  test "an image an entry shows is not deleted: the refusal names the entry" do
    item = MediaItem.create!(file: uploaded_blob(png_bytes), width: 2, height: 1)
    made = make(values: { "picture" => { "mediaId" => item.public_id, "alt" => "The jetty" } })

    api :delete, "/api/media/#{item.public_id}"

    assert_response :conflict
    assert_equal "Pages or entries still use this image.", json["message"]
    assert_equal({ "pages" => [], "versions" => [], "entries" => [ { "collectionId" => @news.id, "id" => made["id"], "title" => "Dawn swims start again" } ] }, json["usedBy"])
  end
end
