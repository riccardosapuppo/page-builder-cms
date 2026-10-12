require "test_helper"

# The site through the API: its settings (GET /api/site, the time zone) and
# its parts, the header and footer, which the API lists beside the pages
# and serves, saves and publishes as it does a page.
module Api
  class SiteTest < ActionDispatch::IntegrationTest
    test "the site's settings are its time zone, the one site.yml names and the app's own" do
      api :get, "/api/site"

      assert_response :ok
      assert_equal({ "timeZone" => "Europe/London" }, json)
      assert_equal "Europe/London", Time.zone.tzinfo.name
    end

    test "the list holds the pages and, apart, the header then the footer, made the first time it is asked, with their starters as drafts" do
      page = create_page(title: "Winter series", slug: "winter")

      assert_difference -> { Page.parts.count } => 2 do
        api :get, "/api/pages"
      end
      assert_response :ok
      assert_equal [ [ page.id, "page" ] ], json["pages"].map { |p| [ p["id"], p["kind"] ] }
      header, footer = json["parts"]
      assert_equal [ "header", "Header", nil, false, 0, nil, nil ],
                   header.values_at("kind", "title", "slug", "home", "revision", "published", "scheduled")
      assert_equal "footer", footer["kind"]
      assert_equal({ "preview" => "/preview/#{header['id']}", "live" => nil }, header["links"].slice("preview", "live"))

      assert_no_difference -> { Page.count } do
        api :get, "/api/pages"
      end
      assert_equal [ header["id"], footer["id"] ], json["parts"].map { |p| p["id"] }
    end

    test "a part is read as a page is, its draft the starter until it is changed" do
      header = Page.part!("header")

      api :get, "/api/pages/#{header.id}"

      assert_response :ok
      assert_equal [ "header", nil, false ], json["page"].values_at("kind", "slug", "home")
      assert_equal SiteParts.starter("header"), json["draft"]["document"]
    end

    test "a part has no address and is never the home page: either is refused at its member, and nothing changes" do
      footer = Page.part!("footer")

      api :patch, "/api/pages/#{footer.id}", { "slug" => "footer" }
      assert_response :unprocessable_content
      assert_equal [ [ "/slug", "part" ] ], error_pointers

      api :patch, "/api/pages/#{footer.id}", { "home" => true }
      assert_response :unprocessable_content
      assert_equal [ [ "/home", "part" ] ], error_pointers
      assert_nil footer.draft.reload.slug
      assert_not footer.reload.home?
    end

    test "a part's draft holds no form: the save is refused at the form block, and the draft stays as it was" do
      footer = Page.part!("footer")
      form = { "id" => "news", "type" => "form", "style" => { "base" => {} }, "children" => [],
               "props" => { "items" => [ { "name" => "email", "kind" => "email", "label" => "Email", "required" => true } ], "submitLabel" => "Send", "confirmation" => "Sent." } }

      save_draft footer, revision: 0, document: page_document(title: "Footer", widgets: [ form ])

      assert_response :unprocessable_content
      assert_equal "invalid_document", json["error"]
      assert_equal [ [ "/document/sections/0/children/0/children/0", "part" ] ], error_pointers
      assert_equal "/document/sections/0/children/0/children/0", json["errors"].first["blockPointer"]
      assert_equal 0, footer.draft.reload.revision
    end

    test "a part is saved and published as a page is, and every published page draws it at its next visit" do
      page = create_page(title: "Winter series", slug: "winter")
      save_draft page, revision: 0, document: page_document(title: "Winter series")
      api :post, "/api/pages/#{page.id}/publish"
      header = Page.part!("header")
      get "/winter"
      etag = response.headers["ETag"]

      save_draft header, revision: 0, document: page_document(title: "Header", widgets: [ heading_block("h", "Tide club", level: 2) ])
      assert_response :ok
      api :post, "/api/pages/#{header.id}/publish", { "revision" => 1 }

      assert_response :ok
      assert_equal [ nil, 2 ], json["published"].values_at("slug", "versionNumber")
      assert_nil json["links"]["live"]
      get "/winter", headers: { "If-None-Match" => etag }
      assert_response :ok
      assert_select "header.sw-header h2", text: "Tide club"
    end

    test "a part's versions, restore and scheduled publish are a page's" do
      footer = Page.part!("footer")
      save_draft footer, revision: 0, document: page_document(title: "Footer", widgets: [ heading_block("h", "Goodbye", level: 2) ])

      api :post, "/api/pages/#{footer.id}/versions", { "name" => "Before the summer" }
      assert_response :created
      api :post, "/api/pages/#{footer.id}/schedules", { "revision" => 1, "at" => 2.days.from_now.utc.iso8601 }
      assert_response :created
      api :post, "/api/pages/#{footer.id}/versions/1/restore"
      assert_response :ok
      api :get, "/api/pages/#{footer.id}/versions"
      # The draft was the scheduled version already: nothing to keep before the restore.
      assert_equal %w[auto manual scheduled restore], json["versions"].map { |v| v["reason"] }.reverse
    end
  end
end
