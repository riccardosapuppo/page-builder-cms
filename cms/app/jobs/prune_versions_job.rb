# frozen_string_literal: true

# Deletes the automatic versions no one needs any more, once a day
# (config/recurring.yml), by the rule of PageVersion.prune!: of each
# page's automatic versions the newest 50 stay, and beyond them those of
# the last 30 days; every other kind stays for good. The time is read when
# the job runs, so a test sets it with travel_to.
class PruneVersionsJob < ApplicationJob
  queue_as :default

  def perform
    pruned = PageVersion.prune!(at: Time.current)
    pruned.each { |page_id, count| logger.info "pruned #{count} automatic version(s) of page #{page_id}" }
    logger.info "pruned no versions" if pruned.empty?
    pruned
  end
end
