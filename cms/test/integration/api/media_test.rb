require "test_helper"

class Api::MediaTest < ActionDispatch::IntegrationTest
  include StoredFiles

  # The whole upload as the editor makes it with @rails/activestorage: ask
  # for a blob, PUT the bytes where the answer says, then create the item.
  def upload(bytes, filename: "jetty.png", content_type: "image/png", width: 2, height: 1, alt: "Swimmers at the jetty")
    api :post, "/api/media/direct_uploads", {
      "blob" => { "filename" => filename, "byte_size" => bytes.bytesize, "checksum" => Digest::MD5.base64digest(bytes), "content_type" => content_type }
    }
    assert_response :ok
    target = json["direct_upload"]
    signed_id = json["signed_id"]

    put URI(target["url"]).path, params: bytes.dup, headers: target["headers"]
    assert_response :no_content

    api :post, "/api/media", { "signedBlobId" => signed_id, "width" => width, "height" => height, "alt" => alt }
    response
  end

  test "an image goes from the browser to the library in three requests" do
    upload(png_bytes)

    assert_response :created
    item = json
    assert_equal [ "Swimmers at the jetty", 2, 1, "image/png", png_bytes.bytesize ], item.values_at("alt", "width", "height", "contentType", "byteSize")
    assert_equal png_bytes, MediaItem.find_by!(public_id: item["id"]).file.download

    get item["url"]
    assert_response :redirect
    api :get, "/api/media"
    assert_equal [ item["id"] ], json["media"].map { |m| m["id"] }
  end

  test "Active Storage's own endpoint wants a CSRF token the editor does not have; this one does not" do
    bytes = png_bytes
    blob = { "blob" => { "filename" => "jetty.png", "byte_size" => bytes.bytesize, "checksum" => Digest::MD5.base64digest(bytes), "content_type" => "image/png" } }
    forgery_protection = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true

    post "/rails/active_storage/direct_uploads", params: blob.to_json, headers: ApiRequests::JSON_HEADERS
    assert_response :unprocessable_content

    api :post, "/api/media/direct_uploads", blob
    assert_response :ok
    assert json["signed_id"].present?
  ensure
    ActionController::Base.allow_forgery_protection = forgery_protection
  end

  test "an SVG is refused before its bytes are sent" do
    api :post, "/api/media/direct_uploads", {
      "blob" => { "filename" => "logo.svg", "byte_size" => svg_bytes.bytesize, "checksum" => Digest::MD5.base64digest(svg_bytes), "content_type" => "image/svg+xml" }
    }

    assert_response :unprocessable_content
    assert_equal [ [ "/blob/content_type", "enum" ] ], error_pointers
    assert_equal 0, ActiveStorage::Blob.count
  end

  test "a file over the size limit is refused before its bytes are sent" do
    api :post, "/api/media/direct_uploads", {
      "blob" => { "filename" => "huge.png", "byte_size" => MediaItem::MAX_BYTES + 1, "checksum" => "x", "content_type" => "image/png" }
    }

    assert_response :unprocessable_content
    assert_equal [ [ "/blob/byte_size", "maximum" ] ], error_pointers
  end

  test "an SVG sent under an image type is refused when the item is created" do
    upload(svg_bytes, filename: "logo.png", content_type: "image/png")

    # Attaching the upload makes Active Storage read its first bytes, and it
    # finds an SVG whatever the browser declared.
    assert_response :unprocessable_content
    assert_equal [ [ "/signedBlobId", "contentType" ] ], error_pointers
    assert_equal 0, MediaItem.count
  end

  test "bytes that are no image, sent under an image type, are refused when the item is created" do
    upload("just some text, no picture".b, filename: "photo.png", content_type: "image/png")

    assert_response :unprocessable_content
    assert_equal [ [ "/signedBlobId", "contentMismatch" ] ], error_pointers
  end

  test "an id that is not one this server signed is refused at /signedBlobId" do
    api :post, "/api/media", { "signedBlobId" => "made-up", "width" => 2, "height" => 1 }

    assert_response :unprocessable_content
    assert_equal [ [ "/signedBlobId", "invalid" ] ], error_pointers
  end

  test "the proposed alt text can change, and pages keep their own" do
    upload(png_bytes)
    id = json["id"]
    page = create_page
    save_draft page, revision: 0, document: page_document(widgets: [ image_block("i1", id, alt: "Two swimmers") ])

    api :patch, "/api/media/#{id}", { "alt" => "The jetty at dawn" }

    assert_response :ok
    assert_equal "The jetty at dawn", json["alt"]
    assert_equal "Two swimmers", page.draft.reload.document.dig("sections", 0, "children", 0, "children", 0, "props", "alt")
  end

  test "deleting an image pages still use is a 409 that lists them, and nothing is deleted" do
    upload(png_bytes)
    id = json["id"]
    page = create_page
    save_draft page, revision: 0, document: page_document(widgets: [ image_block("i1", id) ])
    api :post, "/api/pages/#{page.id}/publish"

    api :delete, "/api/media/#{id}"

    assert_response :conflict
    assert_equal "media_in_use", json["error"]
    assert_equal [ { "id" => page.id, "title" => "Winter series", "slug" => "winter" } ], json.dig("usedBy", "pages")
    assert_equal [ { "pageId" => page.id, "number" => 1 }, { "pageId" => page.id, "number" => 2 } ], json.dig("usedBy", "versions")
    assert MediaItem.exists?(public_id: id)
  end

  test "an image nobody uses any more is deleted with its file" do
    upload(png_bytes)
    id = json["id"]
    key = MediaItem.find_by!(public_id: id).file.blob.key

    api :delete, "/api/media/#{id}"

    assert_response :no_content
    assert_not MediaItem.exists?(public_id: id)
    assert_not ActiveStorage::Blob.service.exist?(key)
  end

  test "an image that is not in the library is not found" do
    api :patch, "/api/media/nothere", { "alt" => "x" }
    assert_response :not_found

    api :delete, "/api/media/nothere"
    assert_response :not_found
  end
end
