require "test_helper"

class Api::DraftTest < ActionDispatch::IntegrationTest
  setup do
    @page = create_page
  end

  test "a save from the current revision is stored and moves the revision on" do
    document = page_document(title: "Cold swims")

    save_draft @page, revision: 0, document: document, save_id: "a1"

    assert_response :ok
    assert_equal({ "revision" => 1, "lastSaveId" => "a1" }, json.slice("revision", "lastSaveId"))
    api :get, "/api/pages/#{@page.id}/draft"
    assert_equal document, json["document"]
    assert_equal 1, json["revision"]
  end

  test "a save from an older revision is a 409 that says where the draft is and who moved it" do
    save_draft @page, revision: 0, document: page_document(title: "Mine"), save_id: "tab-a-1"

    save_draft @page, revision: 0, document: page_document(title: "Theirs"), save_id: "tab-b-1"

    assert_response :conflict
    assert_equal({ "error" => "conflict", "currentRevision" => 1, "lastSaveId" => "tab-a-1" }, json.except("message"))
    assert_equal "Mine", @page.draft.reload.document["title"]
  end

  test "a retry of a save whose answer was lost is a success, not a conflict" do
    save_draft @page, revision: 0, document: page_document(title: "Mine"), save_id: "tab-a-1"

    save_draft @page, revision: 0, document: page_document(title: "Mine"), save_id: "tab-a-1"

    assert_response :ok
    assert_equal 1, json["revision"]
    assert_equal 1, @page.draft.reload.revision
  end

  test "a second tab that reuses the last save id with its own text is a 409, not a false success" do
    save_draft @page, revision: 0, document: page_document(title: "Text of tab A"), save_id: "tab-1"

    save_draft @page, revision: 0, document: page_document(title: "Text of tab B"), save_id: "tab-1"

    assert_response :conflict
    assert_equal({ "error" => "conflict", "currentRevision" => 1, "lastSaveId" => "tab-1" }, json.except("message"))
    api :get, "/api/pages/#{@page.id}/draft"
    assert_equal "Text of tab A", json["document"]["title"]
  end

  test "the last save id with a revision that never was is a 409" do
    save_draft @page, revision: 0, document: page_document(title: "Text of tab A"), save_id: "tab-1"

    save_draft @page, revision: 7, document: page_document(title: "Text of tab A"), save_id: "tab-1"

    assert_response :conflict
    assert_equal 1, json["currentRevision"]
    assert_equal 1, @page.draft.reload.revision
  end

  test "an invalid document is a 422 that points at the value and at its block" do
    document = page_document
    document["sections"][0]["children"][0]["children"][0]["props"]["level"] = 7

    save_draft @page, revision: 0, document: document

    assert_response :unprocessable_content
    assert_equal "invalid_document", json["error"]
    assert_equal [ { "pointer" => "/document#{FIRST_WIDGET}/props/level", "keyword" => "maximum", "blockPointer" => "/document#{FIRST_WIDGET}" } ],
                 json["errors"].map { |e| e.except("message") }
    assert_equal 0, @page.draft.reload.revision
  end

  test "two links on one run of text are refused at its marks: the page would hold one <a> inside another" do
    link = ->(href) { { "type" => "link", "attrs" => { "href" => href } } }
    text = {
      "id" => "t1", "type" => "text", "style" => { "base" => {} }, "children" => [],
      "props" => { "doc" => { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [ { "type" => "text", "text" => "x", "marks" => [ link.call("/a"), link.call("/b") ] } ] } ] } }
    }

    save_draft @page, revision: 0, document: page_document(widgets: [ text ])

    assert_response :unprocessable_content
    assert_equal [ { "pointer" => "/document#{FIRST_WIDGET}/props/doc/content/0/content/0/marks", "keyword" => "not", "blockPointer" => "/document#{FIRST_WIDGET}" } ],
                 json["errors"].map { |e| e.except("message") }
    assert_equal 0, @page.draft.reload.revision
  end

  test "an image from the library that does not exist is refused at its mediaId" do
    save_draft @page, revision: 0, document: page_document(widgets: [ image_block("i1", "gone") ])

    assert_response :unprocessable_content
    assert_equal [ [ "/document#{FIRST_WIDGET}/props/mediaId", "mediaExists" ] ], error_pointers
  end

  test "a document that names a member twice is a 422 with the pointer of the member" do
    body = %({"revision": 0, "saveId": "a1", "document": {"schemaVersion": 1, "title": "Twice", "sections": [{"id": "s1", "id": "s2", "type": "section", "props": {}, "style": {"base": {}}, "children": []}]}})

    api :put, "/api/pages/#{@page.id}/draft", body

    assert_response :unprocessable_content
    assert_equal "duplicate_key", json["error"]
    assert_equal "/document/sections/0/id", json["pointer"]
    assert_equal [ { "pointer" => "/document/sections/0/id", "keyword" => "duplicateKey", "blockPointer" => "/document/sections/0" } ],
                 json["errors"].map { |e| e.except("message") }
    assert_equal 0, @page.draft.reload.revision
  end

  test "a body that is not JSON is a 400, and so is one that is not UTF-8" do
    api :put, "/api/pages/#{@page.id}/draft", %({"revision": 0, "document": {)
    assert_response :bad_request
    assert_equal "malformed_json", json["error"]

    api :put, "/api/pages/#{@page.id}/draft", %({"revision": 0, "saveId": "a1", "document": "\xFF"}).b
    assert_response :bad_request
    assert_equal "malformed_json", json["error"]
  end

  test "the members around the document are checked too" do
    api :put, "/api/pages/#{@page.id}/draft", { "revision" => "0", "saveId" => "has space", "document" => page_document }

    assert_response :unprocessable_content
    assert_equal [ [ "/revision", "type" ], [ "/saveId", "pattern" ] ], error_pointers
  end

  test "a save to a page that does not exist is not found" do
    save_draft Page.new(id: 999_999), revision: 0, document: page_document

    assert_response :not_found
  end

  # An API action that reads params, as a later one might: Rails parses the
  # body itself, and a broken body must still get the API's JSON 400, not
  # an HTML error page.
  class ParamsReadingController < Api::BaseController
    def create
      render json: { "a" => params[:a] }
    end
  end

  test "an action that lets Rails parse a broken body still answers the JSON 400" do
    with_routing do |routes|
      routes.draw { post "/params-reading", to: "api/draft_test/params_reading#create" }

      post "/params-reading", params: +%({"a": 1, "a": 2}), headers: ApiRequests::JSON_HEADERS

      assert_response :bad_request
      assert_equal({ "error" => "malformed_json", "message" => "The body is not valid JSON." }, json)
    end
  end
end
