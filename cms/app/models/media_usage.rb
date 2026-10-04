# frozen_string_literal: true

# One row per media item a draft or a version names. The draft's rows are
# replaced on every save; a version's are written once, with the version.
# Deleting a media item reads them to say who still uses it.
#
# Each time a draft save or a new version names an item, the item's
# last_used_at becomes that time: PurgeMediaJob lets an item go only once
# nothing has named it for a while.
class MediaUsage < ApplicationRecord
  belongs_to :media_item
  belongs_to :draft, optional: true
  belongs_to :page_version, optional: true

  # refs are BlockDocument.media_refs of the draft's document. Every id
  # must be an item of the library: an image that names a missing one is
  # refused with its pointer, so no page can show a hole.
  def self.index_draft!(draft, refs, at: Time.current)
    items = items_for!(refs, at)
    where(draft_id: draft.id).delete_all
    insert_all!(items.map { |item_id| { media_item_id: item_id, draft_id: draft.id } }) if items.any?
  end

  def self.index_version!(version, refs, at: Time.current)
    items = items_for!(refs, at)
    insert_all!(items.map { |item_id| { media_item_id: item_id, page_version_id: version.id } }) if items.any?
  end

  def self.items_for!(refs, at)
    known = MediaItem.where(public_id: refs.map(&:last).uniq).pluck(:public_id, :id).to_h
    missing = refs.reject { |_pointer, public_id| known.key?(public_id) }
    unless missing.empty?
      raise BlockDocument::Invalid, missing.map { |pointer, public_id|
        BlockDocument::Error.at(pointer, "mediaExists", "The media library has no item #{public_id}.")
      }
    end
    MediaItem.where(id: known.values).update_all(last_used_at: at) if known.any?
    known.values
  end
  private_class_method :items_for!
end
