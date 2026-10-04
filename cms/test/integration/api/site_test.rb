require "test_helper"

class Api::SiteTest < ActionDispatch::IntegrationTest
  def with_site(site)
    saved = Rails.configuration.x.site
    Rails.configuration.x.site = site
    yield
  ensure
    Rails.configuration.x.site = saved
  end

  test "the theme's parts are the ones config/site.yml gives every page" do
    api :get, "/api/site"

    assert_response :ok
    assert_equal "Slack Water", json["name"]
    assert_equal [ [ "Swims", "/#swims" ], [ "Gallery", "/#gallery" ], [ "Meet us", "/#meet" ], [ "Questions", "/#questions" ] ],
                 json["menu"].map { |link| link.values_at("label", "href") }
    assert_equal({ "label" => "Join", "href" => "/#join" }, json["action"])
    assert_equal({ "lead" => "Slack Water swimming club.", "text" => "Tide times are a guide, not a promise." }, json["footer"])
  end

  # The editor sets and shows the time of a scheduled publish in it; the
  # IANA name lets a browser work out the offset of any date.
  test "the site's time zone is the one site.yml names, and the app's own" do
    api :get, "/api/site"

    assert_equal "Europe/London", json["timeZone"]
    assert_equal "Europe/London", Time.zone.tzinfo.name
  end

  test "a link the published page would leave out is left out here too, and no action is null" do
    site = {
      name: "Elsewhere",
      menu: [ { label: "Ours", href: "/ours" }, { label: "Script", href: "javascript:alert(1)" }, "not a link" ],
      action: { label: "Bad", href: "javascript:alert(1)" },
      footer: { lead: "Lead.", text: "Text." }
    }
    with_site(site) do
      api :get, "/api/site"

      assert_response :ok
      assert_equal [ { "label" => "Ours", "href" => "/ours" } ], json["menu"]
      assert_nil json["action"]

      get "/no-such-page"
      assert_includes response.body, '<a href="/ours">Ours</a>'
      assert_not_includes response.body, "javascript:"
    end
  end

  test "it is a read: the rule against writes from other sites does not refuse it" do
    get "/api/site", headers: ApiRequests::JSON_HEADERS.merge("Sec-Fetch-Site" => "cross-site")

    assert_response :ok
    assert_equal "Slack Water", json["name"]
  end
end
