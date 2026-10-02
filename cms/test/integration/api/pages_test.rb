require "test_helper"

class Api::PagesTest < ActionDispatch::IntegrationTest
  test "a page is created with its title and next address, and nothing is live" do
    api :post, "/api/pages", { "title" => "Winter series", "slug" => "winter" }

    assert_response :created
    assert_equal "Winter series", json.dig("page", "title")
    assert_equal "winter", json.dig("page", "slug")
    assert_equal 0, json.dig("draft", "revision")
    assert_equal({ "schemaVersion" => 1, "title" => "Winter series", "sections" => [] }, json.dig("draft", "document"))
    assert_nil json["published"]
    assert_nil json.dig("links", "live")
    assert_equal "/preview/#{json.dig('page', 'id')}", json.dig("links", "preview")
  end

  test "the list shows every page with its title and what is live" do
    winter = create_page
    create_page(title: "About us", slug: "about")
    winter.publish!(at: Time.utc(2026, 10, 1, 9, 0))

    api :get, "/api/pages"

    assert_response :ok
    assert_equal [ "Winter series", "About us" ], json["pages"].map { |p| p["title"] }
    assert_equal({ "slug" => "winter", "versionNumber" => 1, "draftRevision" => 0, "publishedAt" => "2026-10-01T09:00:00.000Z" }, json["pages"].first["published"])
    assert_nil json["pages"].last["published"]
  end

  test "showing a page gives its draft, what is live and where to go next" do
    page = create_page
    page.publish!

    api :get, "/api/pages/#{page.id}"

    assert_response :ok
    assert_equal "/winter", json.dig("links", "live")
    assert_equal "/api/pages/#{page.id}/draft", json.dig("links", "draft")
    assert_equal 1, json.dig("published", "versionNumber")
  end

  test "an address the application uses itself is refused at /slug" do
    %w[api up assets rails preview 404].each do |slug|
      api :post, "/api/pages", { "title" => "Clash", "slug" => slug }

      assert_response :unprocessable_content
      assert_equal "invalid_request", json["error"]
      assert_equal [ [ "/slug", "reserved" ] ], error_pointers, slug
    end
    assert_equal 0, Page.count
  end

  test "a title the schema refuses is reported at /title" do
    api :post, "/api/pages", { "title" => " ", "slug" => "winter" }

    assert_response :unprocessable_content
    assert_includes error_pointers, [ "/title", "pattern" ]
  end

  test "missing and unknown members are each reported" do
    api :post, "/api/pages", { "name" => "Winter" }

    assert_response :unprocessable_content
    assert_equal [ [ "/name", "additionalProperties" ], [ "/title", "required" ], [ "/slug", "required" ] ], error_pointers
  end

  test "the next address can change, and the live one stays until the publish" do
    page = create_page
    page.publish!

    api :patch, "/api/pages/#{page.id}", { "slug" => "winter-swims" }

    assert_response :ok
    assert_equal "winter-swims", json.dig("page", "slug")
    assert_equal "winter", json.dig("published", "slug")
  end

  test "one page at a time is the home page, and its live address is /" do
    winter = create_page
    about = create_page(title: "About us", slug: "about")
    winter.publish!
    about.publish!

    api :patch, "/api/pages/#{winter.id}", { "home" => true }
    assert_response :ok
    assert_equal true, json.dig("page", "home")
    assert_equal "/", json.dig("links", "live")

    api :patch, "/api/pages/#{about.id}", { "home" => true }
    assert_response :ok
    api :get, "/api/pages"
    assert_equal [ [ "Winter series", false, "/winter" ], [ "About us", true, "/" ] ],
                 json["pages"].map { |p| [ p["title"], p["home"], p.dig("links", "live") ] }

    api :patch, "/api/pages/#{about.id}", { "home" => false }
    api :get, "/api/pages"
    assert_equal [ false, false ], json["pages"].map { |p| p["home"] }
  end

  test "an update must say what to change, and home is true or false" do
    page = create_page

    api :patch, "/api/pages/#{page.id}", {}
    assert_response :unprocessable_content
    assert_equal [ [ "", "minProperties" ] ], error_pointers

    api :patch, "/api/pages/#{page.id}", { "home" => "yes" }
    assert_response :unprocessable_content
    assert_equal [ [ "/home", "type" ] ], error_pointers
    assert_not page.reload.home?
  end

  test "a page that does not exist, or an id that is not one, is not found" do
    [ "/api/pages/999999", "/api/pages/12abc", "/api/pages/0" ].each do |path|
      api :get, path

      assert_response :not_found
      assert_equal "not_found", json["error"]
    end
  end

  test "a body that is not JSON is a 400" do
    api :post, "/api/pages", %({"title": "Winter", "slug": })

    assert_response :bad_request
    assert_equal "malformed_json", json["error"]
  end

  test "a query that is not UTF-8 gets the API's JSON 400, not an HTML page" do
    get "/api/pages?q=%FF", headers: ApiRequests::JSON_HEADERS

    assert_response :bad_request
    assert_equal "malformed_json", json["error"]
  end

  test "a body that names a member twice is refused with a pointer to it" do
    api :post, "/api/pages", %({"title": "Winter", "slug": "winter", "slug": "summer"})

    assert_response :unprocessable_content
    assert_equal "duplicate_key", json["error"]
    assert_equal "/slug", json["pointer"]
    assert_equal 0, Page.count
  end
end
