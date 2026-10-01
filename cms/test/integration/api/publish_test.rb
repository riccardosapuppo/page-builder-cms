require "test_helper"

class Api::PublishTest < ActionDispatch::IntegrationTest
  setup do
    @page = create_page
  end

  test "publishing puts the draft live as a version, at the draft's address" do
    save_draft @page, revision: 0, document: page_document(title: "Cold swims")

    travel_to(Time.utc(2026, 10, 1, 9, 0)) { api :post, "/api/pages/#{@page.id}/publish" }

    assert_response :ok
    assert_equal({ "slug" => "winter", "versionNumber" => 2, "publishedAt" => "2026-10-01T09:00:00.000Z" }, json["published"])
    assert_equal [ "publish", true ], json["version"].values_at("reason", "published")
    assert_equal "/winter", json.dig("links", "live")
    api :get, "/api/pages/#{@page.id}/versions/2"
    assert_equal "Cold swims", json.dig("document", "title")
  end

  test "a new address takes effect on publish, and the old one is recorded as a redirect to the page" do
    api :post, "/api/pages/#{@page.id}/publish"
    api :patch, "/api/pages/#{@page.id}", { "slug" => "winter-swims" }

    api :post, "/api/pages/#{@page.id}/publish"

    assert_response :ok
    assert_equal "winter-swims", json.dig("published", "slug")
    assert_equal [ [ "winter", @page.id ] ], SlugRedirect.pluck(:from_slug, :page_id)
  end

  test "a page may take an address that is only a redirect now, and the redirect goes" do
    api :post, "/api/pages/#{@page.id}/publish"
    api :patch, "/api/pages/#{@page.id}", { "slug" => "winter-swims" }
    api :post, "/api/pages/#{@page.id}/publish"
    other = create_page(title: "Winter", slug: "winter")

    api :post, "/api/pages/#{other.id}/publish"

    assert_response :ok
    assert_equal "/winter", json.dig("links", "live")
    assert_equal [], SlugRedirect.where(from_slug: "winter").to_a
  end

  test "publishedAt never moves back, even after a restore and a clock that went back" do
    travel_to(Time.utc(2026, 10, 1, 9, 0)) { api :post, "/api/pages/#{@page.id}/publish" }

    travel_to(Time.utc(2026, 9, 30, 9, 0)) do
      api :post, "/api/pages/#{@page.id}/versions/1/restore"
      api :post, "/api/pages/#{@page.id}/publish"
    end

    assert_response :ok
    assert_equal "2026-10-01T09:00:00.000Z", json.dig("published", "publishedAt")
    assert_equal 3, json.dig("published", "versionNumber")
  end

  test "publishing with a revision someone has saved past is a conflict, and nothing goes live" do
    save_draft @page, revision: 0, document: page_document(title: "Someone else's edit"), save_id: "tab-b-1"

    api :post, "/api/pages/#{@page.id}/publish", { "revision" => 0 }

    assert_response :conflict
    assert_equal [ 1, "tab-b-1" ], json.values_at("currentRevision", "lastSaveId")
    api :get, "/api/pages/#{@page.id}"
    assert_nil json["published"]
  end

  test "publishing at the revision seen goes through" do
    save_draft @page, revision: 0, document: page_document

    api :post, "/api/pages/#{@page.id}/publish", { "revision" => 1 }

    assert_response :ok
  end

  test "an address another page has gone live at in the meantime is refused at /slug" do
    other = create_page(title: "Other", slug: "other")
    other.publish!
    other.draft.update!(slug: "other-pages")
    # This draft took "other" while it was free (written straight to the
    # row, as a request that ran just before the other page's publish
    # would have).
    @page.draft.update_column(:slug, "other")

    api :post, "/api/pages/#{@page.id}/publish"

    assert_response :unprocessable_content
    assert_equal [ [ "/slug", "taken" ] ], error_pointers
    assert_nil @page.reload.published_version_id
  end

  test "a page that does not exist is not found" do
    api :post, "/api/pages/999999/publish"

    assert_response :not_found
  end
end
