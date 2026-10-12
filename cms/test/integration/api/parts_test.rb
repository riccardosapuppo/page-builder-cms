require "test_helper"

# The site's header and footer through the API, by a page's own routes: a
# part read, its draft saved, a version kept and restored, published, and
# a publish set for a time and cancelled, each answered as a page's is
# (every answer here is held to openapi.yaml), and none with an address.
class Api::PartsTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  NOW = Time.utc(2026, 10, 12, 9, 0)

  setup do
    @header = Page.part!("header")
  end

  # The header with one heading in its one column.
  def header_document(words)
    heading = { "id" => "h", "type" => "heading", "props" => { "level" => 2, "text" => words }, "children" => [], "style" => { "base" => {} } }
    column = { "id" => "c", "type" => "column", "props" => {}, "style" => { "base" => {} }, "children" => [ heading ] }
    { "schemaVersion" => 1, "title" => "Header", "sections" => [ { "id" => "s", "type" => "section", "props" => {}, "style" => { "base" => {} }, "children" => [ column ] } ] }
  end

  test "a part is read, saved, kept as a version and published by a page's own routes, with no address anywhere" do
    api :get, "/api/pages/#{@header.id}"

    assert_response :ok
    assert_equal({ "kind" => "header", "slug" => nil, "home" => false }, json["page"].slice("kind", "slug", "home"))
    assert_nil json.dig("links", "live")
    assert_equal SiteParts.starter("header"), json.dig("draft", "document")

    save_draft @header, revision: 0, document: header_document("Tide club")
    assert_response :ok
    assert_equal 1, json["revision"]

    api :post, "/api/pages/#{@header.id}/versions", { "name" => "The tide club's header" }
    assert_response :created
    assert_equal [ "manual", "The tide club's header" ], json.values_at("reason", "name")

    api :post, "/api/pages/#{@header.id}/publish", { "revision" => 1 }
    assert_response :ok
    assert_nil json.dig("published", "slug")
    assert_equal 1, json.dig("published", "draftRevision")
    assert_nil json.dig("links", "live")

    api :get, "/api/pages"
    header = json["parts"].find { |part| part["kind"] == "header" }
    assert_equal [ nil, 1 ], [ header["slug"], header.dig("published", "draftRevision") ]
    assert_nil header.dig("links", "live")
  end

  test "a part's version restores into its draft as a page's does" do
    save_draft @header, revision: 0, document: header_document("Old words"), save_id: "part-1"
    api :post, "/api/pages/#{@header.id}/versions", { "name" => "Old words" }
    old = json["number"]
    save_draft @header, revision: 1, document: header_document("New words"), save_id: "part-2"

    api :post, "/api/pages/#{@header.id}/versions/#{old}/restore"

    assert_response :ok
    assert_equal "Old words", json.dig("draft", "document", "sections", 0, "children", 0, "children", 0, "props", "text")
    assert_equal [ "restore", old ], json["version"].values_at("reason", "restoredFrom")
    api :get, "/api/pages/#{@header.id}/versions"
    assert_response :ok
    assert_equal %w[restore before-restore manual], json["versions"].first(3).map { |version| version["reason"] }
  end

  # The header is drawn in every page, beside the page's own sections,
  # whose anchors its own are not checked against: its sections take none.
  test "a part's section anchor is refused at the anchor, keyword part, and the draft stays as it was" do
    with_anchor = header_document("Tide club")
    with_anchor["sections"][0]["props"]["anchor"] = "join"

    save_draft @header, revision: 0, document: with_anchor

    assert_response :unprocessable_content
    assert_equal [ [ "/document/sections/0/props/anchor", "part" ] ], error_pointers
    assert_equal "/document/sections/0", json.dig("errors", 0, "blockPointer")
    assert_equal SiteParts::ANCHOR, json.dig("errors", 0, "message")
    assert_equal 0, @header.draft.reload.revision
  end

  # A form in the header, as only a row written past the API could hold
  # one: a publish, a schedule, a version and a restore check the stored
  # document again, and a part's by a part's rule too.
  test "a form left in a part's draft or version is not published, scheduled, kept or restored: each is refused at the form, keyword part" do
    form = { "id" => "f", "type" => "form", "props" => { "items" => [ { "name" => "email", "kind" => "email", "label" => "Email", "required" => true } ],
                                                         "submitLabel" => "Send", "confirmation" => "Thank you." }, "children" => [], "style" => { "base" => {} } }
    with_form = header_document("Join us")
    with_form["sections"][0]["children"][0]["children"] << form
    at_the_form = [ [ "/document/sections/0/children/0/children/1", "part" ] ]
    PageVersion.create!(page: @header, number: 1, document: with_form, reason: "manual", created_at: Time.current)

    api :post, "/api/pages/#{@header.id}/versions/1/restore"
    assert_response :unprocessable_content
    assert_equal at_the_form, error_pointers
    assert_equal 0, @header.draft.reload.revision

    @header.draft.update_column(:document, with_form)
    { "publish" => { "revision" => 0 }, "versions" => { "name" => "Broken" }, "schedules" => { "revision" => 0, "at" => 1.day.from_now.utc.iso8601(3) } }.each do |route, body|
      api :post, "/api/pages/#{@header.id}/#{route}", body
      assert_response :unprocessable_content, route
      assert_equal at_the_form, error_pointers, route
    end
    assert_nil @header.reload.published_version_id
    assert_equal [ 1 ], @header.versions.pluck(:number)
    assert_empty ScheduledPublication.where(page_id: @header.id)
  end

  test "a part's publish is set for a time, goes live then on every page, and another is cancelled" do
    page = create_page(title: "Tides", slug: "tides")
    page.publish!
    travel_to(NOW) { save_draft @header, revision: 0, document: header_document("Scheduled words") }
    at = NOW + 2.hours

    travel_to(NOW) { api :post, "/api/pages/#{@header.id}/schedules", { "revision" => 1, "at" => at.iso8601(3) } }
    assert_response :created
    assert_equal "pending", json.dig("schedule", "state")
    api :get, "/api/pages/#{@header.id}/schedules"
    assert_response :ok
    assert_equal [ "pending" ], json["schedules"].map { |schedule| schedule["state"] }

    travel_to(at) { perform_enqueued_jobs(at: Time.current) }
    get "/tides"
    assert_select "header.sw-header h2", text: "Scheduled words"

    travel_to(at) { save_draft @header, revision: 1, document: header_document("Later words") }
    travel_to(at) { api :post, "/api/pages/#{@header.id}/schedules", { "revision" => 2, "at" => (at + 1.day).iso8601(3) } }
    assert_response :created
    travel_to(at) { api :post, "/api/pages/#{@header.id}/schedules/#{json.dig('schedule', 'id')}/cancel" }
    assert_response :ok
    assert_equal "cancelled", json.dig("schedule", "state")
    get "/tides"
    assert_select "header.sw-header h2", text: "Scheduled words"
  end
end
