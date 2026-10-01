# frozen_string_literal: true

module Api
  # The media library: the list, a new item from a finished upload, its
  # alt text, and deleting it.
  class MediaController < BaseController
    # GET /api/media, newest first.
    def index
      items = MediaItem.includes(file_attachment: :blob).order(created_at: :desc, id: :desc)
      render json: { "media" => items.map { |item| media_json(item) } }
    end

    # POST /api/media {signedBlobId, width, height, alt?}
    #
    # width and height are the image's size in pixels as the editor read
    # it: the server makes no variants and has no image library to measure
    # with.
    def create
      check = BodyCheck.new(body, allowed: %w[signedBlobId width height alt])
      check.string("signedBlobId", required: true)
      check.integer("width", required: true)
      check.integer("height", required: true)
      check.string("alt")
      check.finish!

      item = MediaItem.create_from_upload!(signed_blob_id: body["signedBlobId"], width: body["width"], height: body["height"], alt: body.fetch("alt", ""))
      render json: media_json(item), status: :created
    end

    # PATCH /api/media/:id {alt}: the alt text proposed for new images. The
    # images already on pages keep their own.
    def update
      check = BodyCheck.new(body, allowed: %w[alt])
      check.string("alt", required: true)
      check.finish!

      item = find_item
      item.update!(alt: body["alt"])
      render json: media_json(item)
    end

    # DELETE /api/media/:id
    #
    # 204 when deleted with its file. 409 while a draft or a kept version
    # still shows it, with who they are: deleting it would leave a hole in
    # those pages.
    def destroy
      find_item.destroy_unless_used!
      head :no_content
    rescue MediaItem::InUse => e
      render_error :conflict, "media_in_use", "Pages still use this image.",
                   usedBy: {
                     "pages" => e.drafts.map { |draft| { "id" => draft.page_id, "title" => draft.document["title"], "slug" => draft.slug } },
                     "versions" => e.versions.map { |version| { "pageId" => version.page_id, "number" => version.number } }
                   }
    end

    private

    def find_item
      MediaItem.find_by!(public_id: path_string(:id, MediaItem::PUBLIC_ID))
    end

    def record_error_pointers
      { file: "/signedBlobId" }
    end
  end
end
