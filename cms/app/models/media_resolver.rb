# frozen_string_literal: true

# What the page renderer asks when a block names a library image by its
# mediaId: the address of the file and its size in pixels. The renderer
# takes any object that answers call(media_id) with an Image or nil, so the
# contract tests give it a stub whose answers are the same on every machine:
# this one's addresses carry signed ids, which depend on the app's secret.
class MediaResolver
  Image = Data.define(:src, :width, :height)

  # One query for every image the document names, files included, made at
  # the first image the renderer asks for: on a cached page, the blocks
  # read from the cache ask nothing, and when every block is read, the
  # query is never made.
  def self.for_document(document)
    new do
      ids = BlockDocument.media_refs(document).map(&:last).uniq
      MediaItem.where(public_id: ids).includes(file_attachment: :blob).index_by(&:public_id)
    end
  end

  # items_by_public_id, or a block that returns them when first needed.
  def initialize(items_by_public_id = nil, &load)
    @items = items_by_public_id
    @load = load
  end

  # Served through the app (Active Storage's proxy route), not by a
  # redirect to the storage service: the page then names an address on its
  # own origin, which its Content-Security-Policy already allows. An item
  # that no longer exists, or has no file, gives nil and the renderer
  # leaves the image out.
  def call(media_id)
    @items ||= @load.call
    item = @items[media_id]
    return nil unless item&.file&.attached?

    src = Rails.application.routes.url_helpers.rails_storage_proxy_path(item.file.blob, only_path: true)
    Image.new(src: src, width: item.width, height: item.height)
  end
end
