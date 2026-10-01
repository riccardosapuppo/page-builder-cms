# frozen_string_literal: true

# One row per media item a draft or a version names. The draft's rows are
# replaced on every save; a version's are written once, with the version.
# Deleting a media item reads them to say who still uses it.
class MediaUsage < ApplicationRecord
  belongs_to :media_item
  belongs_to :draft, optional: true
  belongs_to :page_version, optional: true

  # refs are BlockDocument.media_refs of the draft's document. Every id
  # must be an item of the library: an image that names a missing one is
  # refused with its pointer, so no page can show a hole.
  def self.index_draft!(draft, refs)
    items = items_for!(refs)
    where(draft_id: draft.id).delete_all
    insert_all!(items.map { |item_id| { media_item_id: item_id, draft_id: draft.id } }) if items.any?
  end

  def self.index_version!(version, refs)
    items = items_for!(refs)
    insert_all!(items.map { |item_id| { media_item_id: item_id, page_version_id: version.id } }) if items.any?
  end

  def self.items_for!(refs)
    known = MediaItem.where(public_id: refs.map(&:last).uniq).pluck(:public_id, :id).to_h
    missing = refs.reject { |_pointer, public_id| known.key?(public_id) }
    unless missing.empty?
      raise BlockDocument::Invalid, missing.map { |pointer, public_id|
        BlockDocument::Error.at(pointer, "mediaExists", "The media library has no item #{public_id}.")
      }
    end
    known.values
  end
  private_class_method :items_for!
end
