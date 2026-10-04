# frozen_string_literal: true

# Deletes the media no page needs any more, once a day (config/
# recurring.yml), with their files:
# - library images that no draft and no kept version names, and none has
#   named for 30 days (MediaItem.purge_unused!): once PruneVersionsJob has
#   deleted the last old version that showed an image, nothing else will;
# - uploads that never became a library image, the bytes of an upload the
#   editor started and never finished, after two days: an upload under
#   way takes seconds, and its blob is attached as it ends.
# The time is read when the job runs, so a test sets it with travel_to.
class PurgeMediaJob < ApplicationJob
  queue_as :default

  # How old an upload that never became an image must be to go.
  ABANDONED_AFTER = 2.days

  def perform
    at = Time.current
    purged = MediaItem.purge_unused!(at: at)
    logger.info "purged #{purged.size} unused image(s)#{purged.empty? ? '' : ": #{purged.join(', ')}"}"
    abandoned = ActiveStorage::Blob.unattached.where(created_at: ...(at.utc - ABANDONED_AFTER))
    count = 0
    abandoned.find_each do |blob|
      blob.purge
      count += 1
    end
    logger.info "purged #{count} upload(s) that never became an image"
    { images: purged, uploads: count }
  end
end
