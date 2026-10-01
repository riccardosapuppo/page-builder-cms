require "test_helper"

class Api::VersionsTest < ActionDispatch::IntegrationTest
  setup do
    @page = create_page
  end

  test "while someone keeps saving, an automatic version is kept every ten minutes, no more" do
    start = Time.utc(2026, 10, 1, 9, 0)
    [ 0, 3, 6, 9, 12 ].each_with_index do |minute, revision|
      travel_to(start + minute.minutes) { save_draft @page, revision: revision, document: page_document(title: "Edit #{revision}") }
      assert_response :ok
    end

    api :get, "/api/pages/#{@page.id}/versions"

    assert_equal [ [ 2, "auto", "2026-10-01T09:12:00.000Z" ], [ 1, "auto", "2026-10-01T09:00:00.000Z" ] ],
                 json["versions"].map { |v| v.values_at("number", "reason", "createdAt") }
    api :get, "/api/pages/#{@page.id}/versions/2"
    assert_equal "Edit 4", json.dig("document", "title")
  end

  test "Save version keeps the draft under the name given" do
    save_draft @page, revision: 0, document: page_document(title: "Before the summer")

    api :post, "/api/pages/#{@page.id}/versions", { "name" => "Before the summer changes" }

    assert_response :created
    assert_equal [ "manual", "Before the summer changes" ], json.values_at("reason", "name")
    api :get, "/api/pages/#{@page.id}/versions/#{json['number']}"
    assert_equal "Before the summer", json.dig("document", "title")
  end

  test "Save version without a body keeps a version with no name" do
    api :post, "/api/pages/#{@page.id}/versions"

    assert_response :created
    assert_nil json["name"]
  end

  test "a name on two lines is refused at /name" do
    api :post, "/api/pages/#{@page.id}/versions", { "name" => "two\nlines" }

    assert_response :unprocessable_content
    assert_equal [ [ "/name", "invalid" ] ], error_pointers
    assert_equal 0, @page.versions.count
  end

  test "restoring puts an older document back in the draft, and another tab's next save is a conflict" do
    save_draft @page, revision: 0, document: page_document(title: "Old words"), save_id: "tab-a-1"
    api :post, "/api/pages/#{@page.id}/versions", { "name" => "Old words" }
    old = json["number"]
    save_draft @page, revision: 1, document: page_document(title: "New words"), save_id: "tab-a-2"

    api :post, "/api/pages/#{@page.id}/versions/#{old}/restore"

    assert_response :ok
    assert_equal "Old words", json.dig("draft", "document", "title")
    assert_equal 3, json.dig("draft", "revision")
    assert_equal [ "restore", old ], json["version"].values_at("reason", "restoredFrom")

    save_draft @page, revision: 2, document: page_document(title: "Stale tab"), save_id: "tab-b-1"
    assert_response :conflict
    assert_equal 3, json["currentRevision"]
    assert_nil json["lastSaveId"]
  end

  test "a version kept under an older schema is upgraded when it is restored" do
    stored = page_document.except("title").merge("schemaVersion" => 0, "name" => "From the archive")
    PageVersion.create!(page: @page, number: 1, document: stored, reason: "manual", created_at: Time.current)
    BlockDocument::Upgrade.steps = { 0 => ->(doc) { doc.except("name").merge("schemaVersion" => 1, "title" => doc["name"]) } }

    api :post, "/api/pages/#{@page.id}/versions/1/restore"

    assert_response :ok
    assert_equal [ 1, "From the archive" ], json.dig("draft", "document").values_at("schemaVersion", "title")
  ensure
    BlockDocument::Upgrade.steps = BlockDocument::Upgrade::STEPS
  end

  test "a version this server cannot upgrade is refused, and the draft is untouched" do
    PageVersion.create!(page: @page, number: 1, document: page_document.merge("schemaVersion" => 7), reason: "manual", created_at: Time.current)

    api :post, "/api/pages/#{@page.id}/versions/1/restore"

    assert_response :unprocessable_content
    assert_equal [ [ "/document/schemaVersion", "upgrade" ] ], error_pointers
    assert_equal 0, @page.draft.reload.revision
  end

  test "a version that does not exist is not found" do
    api :get, "/api/pages/#{@page.id}/versions/5"
    assert_response :not_found

    api :post, "/api/pages/#{@page.id}/versions/5/restore"
    assert_response :not_found
  end
end
