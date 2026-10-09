require "test_helper"

class Api::SiteTest < ActionDispatch::IntegrationTest
  def change(revision: 0, **members)
    { "revision" => revision }.merge(Site.defaults).merge(members.transform_keys(&:to_s))
  end

  test "until they are changed, the header and footer are config/site.yml's, at revision 0" do
    api :get, "/api/site"

    assert_response :ok
    assert_equal "Slack Water", json["name"]
    assert_equal [ [ "Swims", "/#swims" ], [ "Gallery", "/#gallery" ], [ "Meet us", "/#meet" ], [ "Questions", "/#questions" ] ],
                 json["menu"].map { |link| link.values_at("label", "href") }
    assert_equal({ "label" => "Join", "href" => "/#join" }, json["action"])
    assert_equal({ "lead" => "Slack Water swimming club.", "text" => "Tide times are a guide, not a promise." }, json["footer"])
    assert_equal [ 0, nil ], json.values_at("revision", "updatedAt")
  end

  # The editor sets and shows the time of a scheduled publish in it; the
  # IANA name lets a browser work out the offset of any date.
  test "the site's time zone is the one site.yml names, and the app's own" do
    api :get, "/api/site"

    assert_equal "Europe/London", json["timeZone"]
    assert_equal "Europe/London", Time.zone.tzinfo.name
  end

  test "a change is answered with the header and footer as stored, the next read gives it, and the revision goes up" do
    travel_to Time.utc(2026, 10, 9, 8, 30) do
      menu = [ { "label" => "Tides", "href" => "/tides" }, { "label" => "Winter", "href" => "/winter-series#join" } ]
      api :put, "/api/site", change(name: "Tide club", menu: menu, action: nil, footer: { "lead" => "Tide club.", "text" => "Swims at slack water." })

      assert_response :ok
      assert_equal [ "Tide club", menu, nil, 1, "2026-10-09T08:30:00.000Z" ], json.values_at("name", "menu", "action", "revision", "updatedAt")
      assert_equal "Europe/London", json["timeZone"]
    end
    saved = json

    api :get, "/api/site"
    assert_equal saved, json
    api :put, "/api/site", change(revision: 1, name: "Tide club", menu: [])
    assert_response :ok
    assert_equal [ 2, [] ], json.values_at("revision", "menu")
  end

  test "every fault comes back in one answer, each at its pointer, and nothing is stored" do
    body = change(revision: -1, name: " ", action: { "label" => "Join", "href" => "/#join", "style" => "accent" })
    body["menu"] = [ { "label" => "Script", "href" => "javascript:alert(1)" }, { "label" => "L" * 25, "href" => "//elsewhere.example/" } ]
    body["timeZone"] = "Europe/Rome"

    api :put, "/api/site", body

    assert_response :unprocessable_content
    assert_equal "invalid_request", json["error"]
    assert_equal [
      [ "/action/style", "additionalProperties" ], [ "/menu/0/href", "pattern" ], [ "/menu/1/href", "pattern" ], [ "/menu/1/label", "maxLength" ],
      [ "/name", "pattern" ], [ "/revision", "minimum" ], [ "/timeZone", "additionalProperties" ]
    ], error_pointers.sort
    assert json["errors"].all? { |e| e["blockPointer"].nil? && e["message"].present? }
    assert_nil Site.find_by(id: Site::ID)
  end

  test "a member left out is named, the button too: no button is null" do
    api :put, "/api/site", change.except("action", "footer")

    assert_response :unprocessable_content
    assert_equal [ [ "/action", "required" ], [ "/footer", "required" ] ], error_pointers.sort
  end

  # Without the revision a write has nothing to be compared with: it was
  # answered 500 when it changed anything (nil has no zero?), and "saved"
  # when it asked for what is stored, which a client that forgot the
  # revision would take for a success.
  test "a change with no revision is refused at /revision, whether it changes the values or asks for the stored ones" do
    api :put, "/api/site", change(name: "Tide club").except("revision")
    assert_response :unprocessable_content
    assert_equal [ [ "/revision", "required" ] ], error_pointers
    assert_nil Site.find_by(id: Site::ID)

    api :put, "/api/site", change.except("revision")
    assert_response :unprocessable_content
    assert_equal [ [ "/revision", "required" ] ], error_pointers
    assert_nil Site.find_by(id: Site::ID)

    api :put, "/api/site", change(name: "Tide club")
    assert_response :ok
    stored = Site.find(Site::ID).attributes

    api :put, "/api/site", change(name: "Tide club").except("revision")
    assert_response :unprocessable_content
    assert_equal [ [ "/revision", "required" ] ], error_pointers
    assert_equal stored, Site.find(Site::ID).attributes
  end

  test "a revision that is not a whole number is refused at /revision" do
    [ "0", 0.5, nil, true, [ 0 ] ].each do |revision|
      api :put, "/api/site", change(revision: revision)

      assert_response :unprocessable_content, revision.inspect
      assert_equal [ [ "/revision", "type" ] ], error_pointers, revision.inspect
    end
    assert_nil Site.find_by(id: Site::ID)
  end

  test "the limits the editor says: 8 links, 28 characters for the name, 24 for a link, 18 for the button" do
    links = Array.new(8) { |k| { "label" => "L" * 24, "href" => "/#part-#{k}" } }
    api :put, "/api/site", change(name: "N" * 28, menu: links, action: { "label" => "B" * 18, "href" => "/join" })
    assert_response :ok

    api :put, "/api/site", change(revision: 1, name: "N" * 29, menu: links + [ { "label" => "More", "href" => "/" } ], action: { "label" => "B" * 19, "href" => "/join" })
    assert_response :unprocessable_content
    assert_equal [ [ "/action/label", "maxLength" ], [ "/menu", "maxItems" ], [ "/name", "maxLength" ] ], error_pointers.sort
  end

  test "a change from a revision older than the header and footer's is refused with them as they are now" do
    api :put, "/api/site", change(menu: [ { "label" => "Tides", "href" => "/tides" } ])
    assert_response :ok

    api :put, "/api/site", change(revision: 0, name: "Another tab")

    assert_response :conflict
    assert_equal [ "conflict", 1 ], json.values_at("error", "currentRevision")
    assert_equal({ "name" => "Slack Water", "menu" => [ { "label" => "Tides", "href" => "/tides" } ], "action" => { "label" => "Join", "href" => "/#join" },
                   "footer" => Site.defaults["footer"] }, json["site"])
    api :get, "/api/site"
    assert_equal [ "Slack Water", 1 ], json.values_at("name", "revision")
  end

  test "the same change sent again after its answer was lost is answered as saved" do
    body = change(name: "Tide club")
    api :put, "/api/site", body
    assert_response :ok

    api :put, "/api/site", body

    assert_response :ok
    assert_equal [ "Tide club", 1 ], json.values_at("name", "revision")
  end

  test "a body that is not JSON, or that names a member twice, is refused before anything is read" do
    api :put, "/api/site", "{\"revision\": 0,"
    assert_response :bad_request
    assert_equal "malformed_json", json["error"]

    api :put, "/api/site", %({"revision": 0, "name": "One", "name": "Two", "menu": [], "action": null, "footer": {"lead": "a", "text": "b"}})
    assert_response :unprocessable_content
    assert_equal [ "duplicate_key", "/name" ], json.values_at("error", "pointer")
    assert_nil Site.find_by(id: Site::ID)
  end

  test "it is a read: the rule against writes from other sites does not refuse it" do
    get "/api/site", headers: ApiRequests::JSON_HEADERS.merge("Sec-Fetch-Site" => "cross-site")

    assert_response :ok
    assert_equal "Slack Water", json["name"]
  end
end
