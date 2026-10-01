# frozen_string_literal: true

module Api
  # The first step of an image upload: a blob, and the address and headers
  # the browser sends the bytes to.
  #
  # Active Storage has this endpoint already, but on ActionController::Base
  # with forgery protection: it wants a CSRF token from a page the editor
  # does not have. This one is on the API's base, and takes the same request
  # and gives the same answer, so @rails/activestorage's DirectUpload works
  # with it unchanged; that is also why its members are snake_case.
  class DirectUploadsController < BaseController
    # Without it, the disk service cannot build the upload address ("Cannot
    # generate URL"): it takes the host from the current request.
    include ActiveStorage::SetCurrent

    # POST /api/media/direct_uploads {blob: {filename, byte_size, checksum, content_type}}
    #
    # Only the image types and the size the media library accepts: a file
    # it would refuse is refused before its bytes are sent. The checksum and
    # the size are then enforced by the storage service when the bytes
    # arrive.
    def create
      outer = BodyCheck.new(body, allowed: %w[blob])
      outer.object("blob", required: true)
      outer.finish!

      check = BodyCheck.new(body["blob"], allowed: %w[filename byte_size checksum content_type], prefix: "/blob")
      check.string("filename", required: true, max_length: 255)
      check.integer("byte_size", required: true, minimum: 1, maximum: MediaItem::MAX_BYTES)
      check.string("checksum", required: true, max_length: 255)
      check.string("content_type", required: true)
      check.finish!
      if MediaItem::CONTENT_TYPES.exclude?(body["blob"]["content_type"])
        raise BodyCheck::Failed, [ BlockDocument::Error.new(pointer: "/blob/content_type", keyword: "enum", block_pointer: nil,
                                                            message: "must be one of #{MediaItem::CONTENT_TYPES.join(', ')}") ]
      end

      blob = ActiveStorage::Blob.create_before_direct_upload!(**body["blob"].slice("filename", "byte_size", "checksum", "content_type").symbolize_keys)
      render json: {
        "signed_id" => blob.signed_id,
        "filename" => blob.filename.to_s,
        "content_type" => blob.content_type,
        "byte_size" => blob.byte_size,
        "checksum" => blob.checksum,
        "direct_upload" => { "url" => blob.service_url_for_direct_upload, "headers" => blob.service_headers_for_direct_upload }
      }
    end
  end
end
