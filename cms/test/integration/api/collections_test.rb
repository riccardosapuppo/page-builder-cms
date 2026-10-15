require "test_helper"

# The collections through the API, and their templates through the page
# routes, as a part's are. Every answer here is held to openapi.yaml.
class Api::CollectionsTest < ActionDispatch::IntegrationTest
  include CollectionCases

  test "a collection is made from its definition with its template, listed, and read" do
    api :post, "/api/collections", news_definition

    assert_response :created
    assert_equal news_definition, json.slice("name", "prefix", "fields", "sort")
    assert_equal [ 0, 0, 0 ], json.values_at("publishedRevision", "entryCount", "publishedCount")
    template = json["template"]
    assert_equal [ "template", "News", nil, false, 0, nil ], template.values_at("kind", "title", "slug", "home", "revision", "published")
    assert_nil template.dig("links", "live")
    id = json["id"]

    api :get, "/api/collections"
    assert_response :ok
    assert_equal [ [ id, "news", template["id"] ] ], json["collections"].map { |c| [ c["id"], c["prefix"], c.dig("template", "id") ] }
    api :get, "/api/collections/#{id}"
    assert_response :ok
    assert_equal "News", json["name"]
  end

  test "a definition is refused at each fault, the schema's and the rules', in one answer" do
    definition = news_definition
    definition["fields"][4]["min"] = 50
    definition["fields"][7]["options"] = [ "Beginner", "Beginner" ]
    definition["fields"][0]["type"] = "email"
    definition["extra"] = true

    api :post, "/api/collections", definition

    assert_response :unprocessable_content
    assert_equal "invalid_request", json["error"]
    assert_equal [ [ "/fields/4/max", "range" ], [ "/fields/7/options/1", "uniqueOption" ], [ "/extra", "additionalProperties" ], [ "/fields/0/type", "enum" ] ].sort,
                 error_pointers.sort
    assert_equal 0, Collection.count
  end

  test "a prefix taken by another collection or by a page, or one the application answers, is refused at the prefix" do
    create_news(prefix: "news")
    Page.create_with_draft!(title: "Tides", slug: "tides")

    { "news" => "taken", "tides" => "taken", "preview" => "reserved", "sent" => "reserved" }.each do |prefix, keyword|
      api :post, "/api/collections", news_definition(prefix: prefix)
      assert_response :unprocessable_content, prefix
      assert_equal [ [ "/prefix", keyword ] ], error_pointers, prefix
    end
  end

  test "a page cannot take a collection's prefix as its address" do
    create_news(prefix: "news")

    api :post, "/api/pages", { "title" => "News", "slug" => "news" }
    assert_response :unprocessable_content
    assert_equal [ [ "/slug", "taken" ] ], error_pointers
    page = create_page(title: "Latest", slug: "latest")
    api :patch, "/api/pages/#{page.id}", { "slug" => "news" }
    assert_response :unprocessable_content
    assert_equal [ [ "/slug", "taken" ] ], error_pointers
  end

  test "a change of the definition replaces the members given, checked whole, and moves the published revision" do
    collection = create_news

    api :patch, "/api/collections/#{collection.id}", { "name" => "Newsroom", "sort" => { "by" => "places", "direction" => "asc" } }
    assert_response :ok
    assert_equal [ "Newsroom", "news", { "by" => "places", "direction" => "asc" }, 1 ], json.values_at("name", "prefix", "sort", "publishedRevision")

    api :patch, "/api/collections/#{collection.id}", { "fields" => news_definition["fields"].first(3) }
    assert_response :unprocessable_content
    assert_equal [ [ "/sort/by", "sortField" ] ], error_pointers

    api :patch, "/api/collections/#{collection.id}", {}
    assert_response :unprocessable_content
    assert_equal [ [ "", "minProperties" ] ], error_pointers
    api :patch, "/api/collections/#{collection.id}", { "template" => {} }
    assert_response :unprocessable_content
    assert_equal [ [ "/template", "additionalProperties" ], [ "", "minProperties" ] ], error_pointers
  end

  test "deleting a collection deletes its entries and its template, and it is gone" do
    collection = create_news
    Entry.create_checked!(collection, news_entry).publish!
    template = collection.template

    api :delete, "/api/collections/#{collection.id}"
    assert_response :no_content

    api :get, "/api/collections/#{collection.id}"
    assert_response :not_found
    api :get, "/api/pages/#{template.id}"
    assert_response :not_found
    assert_equal 0, Entry.count
  end

  test "the template is read, saved, kept and published by the page routes, with no address, and is not listed with the pages" do
    template = create_news.template

    api :get, "/api/pages/#{template.id}"
    assert_response :ok
    assert_equal({ "kind" => "template", "slug" => nil, "home" => false }, json["page"].slice("kind", "slug", "home"))
    save_draft template, revision: 0, document: page_document(title: "News", widgets: [ heading_block("h", "An entry") ])
    assert_response :ok
    api :post, "/api/pages/#{template.id}/versions", { "name" => "The first template" }
    assert_response :created
    api :post, "/api/pages/#{template.id}/publish", { "revision" => 1 }
    assert_response :ok
    assert_equal [ nil, 1 ], [ json.dig("published", "slug"), json.dig("published", "draftRevision") ]
    assert_nil json.dig("links", "live")

    api :get, "/api/pages"
    assert_response :ok
    assert_not_includes (json["pages"] + json["parts"]).map { |page| page["id"] }, template.id
    api :get, "/api/collections"
    listed = json["collections"].first["template"]
    assert_equal [ 1, 1 ], [ listed["revision"], listed.dig("published", "draftRevision") ]
  end

  test "a template takes no address and no home mark, and holds no form: each refused at its member or block, keyword template" do
    template = create_news.template

    [ { "slug" => "news-template" }, { "home" => true } ].each do |changes|
      api :patch, "/api/pages/#{template.id}", changes
      assert_response :unprocessable_content
      assert_equal [ [ "/#{changes.keys.first}", "template" ] ], error_pointers
    end
    form = { "id" => "f", "type" => "form", "props" => { "items" => [ { "name" => "email", "kind" => "email", "label" => "Email", "required" => true } ],
                                                         "submitLabel" => "Send", "confirmation" => "Thank you." }, "children" => [], "style" => { "base" => {} } }
    save_draft template, revision: 0, document: page_document(widgets: [ heading_block("h", "Join"), form ])
    assert_response :unprocessable_content
    assert_equal [ [ "/document/sections/0/children/0/children/1", "template" ] ], error_pointers
    assert_equal CollectionTemplate::FORM, json.dig("errors", 0, "message")
    assert_equal 0, template.draft.reload.revision
  end

  test "a write from another origin, or not sent as JSON, is refused here too" do
    post "/api/collections", params: news_definition.to_json, headers: { "CONTENT_TYPE" => "text/plain" }
    assert_response :unsupported_media_type
    post "/api/collections", params: news_definition.to_json, headers: { "CONTENT_TYPE" => "application/json", "Origin" => "https://elsewhere.example" }
    assert_response :forbidden
    assert_equal 0, Collection.count
  end
end
