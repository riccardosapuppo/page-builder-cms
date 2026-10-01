require "test_helper"

# Input no editor sends, and failures no handler names: every one is
# answered in the API's error shape, described by openapi.yaml, never with
# Rails' HTML error page.
class Api::UnexpectedInputTest < ActionDispatch::IntegrationTest
  include StoredFiles

  NUL = "\u0000"

  # SQLite stops reading a statement's text at U+0000. Development writes
  # every value into the statement's text, because its query log tags turn
  # prepared statements off (Active Record's railtie), and there these
  # values failed with a 500. The tests run each request the same way, on
  # the test's own connection, so a NUL that reached a query would fail
  # here as it did there.
  setup do
    @page = create_page
    @connection = ActiveRecord::Base.lease_connection
  end

  def api(...)
    @connection.unprepared_statement { super }
  end

  test "a NUL in the slug of a new page is a 422 at /slug" do
    api :post, "/api/pages", { "title" => "ok", "slug" => "ls-f#{NUL}" }

    assert_response :unprocessable_content
    assert_equal [ [ "/slug", "pattern" ] ], error_pointers
    assert_equal 1, Page.count
  end

  test "a NUL in the next address of a page is a 422 at /slug" do
    api :patch, "/api/pages/#{@page.id}", { "slug" => "winter#{NUL}" }

    assert_response :unprocessable_content
    assert_equal [ [ "/slug", "pattern" ] ], error_pointers
    assert_equal "winter", @page.draft.reload.slug
  end

  test "a NUL in the file name or the checksum of an upload is a 422 at its member" do
    blob = { "filename" => "a#{NUL}b.png", "byte_size" => 10, "checksum" => "AAAA#{NUL}AAAAAAAAAAAAAAAAA==", "content_type" => "image/png" }

    api :post, "/api/media/direct_uploads", { "blob" => blob }

    assert_response :unprocessable_content
    assert_equal [ [ "/blob/filename", "pattern" ], [ "/blob/checksum", "pattern" ] ], error_pointers
    assert_equal 0, ActiveStorage::Blob.count
  end

  test "a NUL in any other string member is a 422 at that member" do
    item = MediaItem.create_from_upload!(signed_blob_id: uploaded_blob(png_bytes).signed_id, width: 2, height: 1, alt: "")

    api :post, "/api/media", { "signedBlobId" => "x", "width" => 2, "height" => 1, "alt" => "a#{NUL}" }
    assert_equal [ [ "/alt", "pattern" ] ], error_pointers

    api :patch, "/api/media/#{item.public_id}", { "alt" => "a#{NUL}" }
    assert_equal [ [ "/alt", "pattern" ] ], error_pointers

    api :post, "/api/pages/#{@page.id}/versions", { "name" => "a#{NUL}" }
    assert_equal [ [ "/name", "pattern" ] ], error_pointers

    api :put, "/api/site-style", { "palette" => SiteStyle.current.palette, "typeScale" => "balanced#{NUL}" }
    assert_equal [ [ "/typeScale", "pattern" ] ], error_pointers

    api :put, "/api/pages/#{@page.id}/draft", { "revision" => 0, "saveId" => "a#{NUL}", "document" => page_document }
    assert_equal [ [ "/saveId", "pattern" ] ], error_pointers
  end

  test "a NUL in a palette tone is refused by the site style's own check" do
    palette = SiteStyle.current.palette.merge("primary" => "sea#{NUL}")

    api :put, "/api/site-style", { "palette" => palette, "typeScale" => "balanced" }

    assert_response :unprocessable_content
    assert_equal [ "/palette/primary" ], error_pointers.map(&:first)
  end

  test "a media id that is not in the form of one is not found, NUL or not" do
    [ "a%00b", "a%20b", "a.b" ].each do |id|
      api :patch, "/api/media/#{id}", { "alt" => "x" }
      assert_response :not_found, "PATCH #{id}"

      api :delete, "/api/media/#{id}"
      assert_response :not_found, "DELETE #{id}"
    end
  end

  # An action of the API that fails in a way nothing foresaw, at an address
  # openapi.yaml describes, so the hook holds its answer to the document.
  class FailingController < Api::BaseController
    def index
      raise ActiveRecord::StatementInvalid, "planted failure"
    end
  end

  test "a failure no handler names is a 500 in the error shape, and logged" do
    logged = StringIO.new
    previous = Api::BaseController.logger
    Api::BaseController.logger = ActiveSupport::Logger.new(logged)
    with_routing do |routes|
      routes.draw { get "/api/pages", to: "api/unexpected_input_test/failing#index" }

      api :get, "/api/pages"

      assert_response :internal_server_error
      assert_equal "application/json", response.media_type
      assert_equal({ "error" => "internal_error", "message" => "The server failed to answer this request." }, json)
    end
    assert_includes logged.string, "ActiveRecord::StatementInvalid: planted failure"
  ensure
    Api::BaseController.logger = previous
  end
end
