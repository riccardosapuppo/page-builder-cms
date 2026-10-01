require "test_helper"

# A page on another site, open in a browser on this machine, can send the
# API requests that need no CORS preflight: a form POST, or a fetch with
# mode "no-cors" and a text/plain body. The browser delivers them to
# 127.0.0.1 like any other. None of them may write anything.
class Api::OtherSitesTest < ActionDispatch::IntegrationTest
  include StoredFiles

  OWN ="http://www.example.com" # the integration session's host
  ELSEWHERE = "https://evil.example"

  setup do
    @page = create_page
    save_draft @page, revision: 0, document: page_document(title: "Not reviewed yet")
  end

  test "a text/plain body that is JSON does not create a page, with or without an origin" do
    [ {}, { "Origin" => ELSEWHERE, "Sec-Fetch-Site" => "cross-site" } ].each do |browser|
      post "/api/pages", params: +%({"title":"Planted by another site","slug":"planted"}), headers: { "CONTENT_TYPE" => "text/plain" }.merge(browser)

      assert_response(browser.empty? ? :unsupported_media_type : :forbidden)
    end
    assert_equal [ "winter" ], Draft.pluck(:slug)
  end

  test "an empty form post from another site does not publish the draft" do
    post "/api/pages/#{@page.id}/publish", params: +"", headers: { "CONTENT_TYPE" => "application/x-www-form-urlencoded", "Origin" => ELSEWHERE }

    assert_response :forbidden
    assert_equal({ "error" => "forbidden_origin", "message" => "The API takes writes only from the CMS's own origin." }, json)
    assert_nil @page.reload.published_version_id
  end

  test "an empty form post with no origin is refused for its type" do
    post "/api/pages/#{@page.id}/publish", params: +"", headers: { "CONTENT_TYPE" => "application/x-www-form-urlencoded" }

    assert_response :unsupported_media_type
    assert_equal "unsupported_media_type", json["error"]
    assert_nil @page.reload.published_version_id
  end

  test "JSON from another origin, or that the browser calls cross-site or same-site, is refused" do
    [
      { "Origin" => ELSEWHERE },
      { "Origin" => "null" },
      { "Origin" => "http://www.example.com:3901" },
      { "Sec-Fetch-Site" => "cross-site" },
      { "Sec-Fetch-Site" => "same-site", "Origin" => OWN }
    ].each do |browser|
      post "/api/pages/#{@page.id}/versions", params: +"{}", headers: ApiRequests::JSON_HEADERS.merge(browser)
      assert_response :forbidden, browser.inspect

      put "/api/site-style", params: { "palette" => SiteStyle.current.palette, "typeScale" => "strong" }.to_json, headers: ApiRequests::JSON_HEADERS.merge(browser)
      assert_response :forbidden, browser.inspect
    end
    assert_equal 1, @page.versions.count
    assert_nil SiteStyle.find_by(id: SiteStyle::ID)
  end

  test "a delete from another origin leaves the media item" do
    item = MediaItem.create_from_upload!(signed_blob_id: uploaded_blob(png_bytes).signed_id, width: 2, height: 1)

    delete "/api/media/#{item.public_id}", headers: { "Origin" => ELSEWHERE }

    assert_response :forbidden
    assert MediaItem.exists?(item.id)
  end

  test "the CMS's own origin writes, and so does a client that is not a browser" do
    post "/api/pages/#{@page.id}/publish", headers: ApiRequests::JSON_HEADERS.merge("Origin" => OWN, "Sec-Fetch-Site" => "same-origin")
    assert_response :ok

    post "/api/pages/#{@page.id}/versions", headers: ApiRequests::JSON_HEADERS
    assert_response :created
    assert_equal 3, @page.versions.count
  end

  test "reading needs neither" do
    get "/api/pages", headers: { "Origin" => ELSEWHERE, "Sec-Fetch-Site" => "cross-site" }

    assert_response :ok
  end
end
