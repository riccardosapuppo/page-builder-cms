# frozen_string_literal: true

# Every minute (config/recurring.yml): sets the job of a scheduled publish
# going again when its time passed by more than a minute and the page is
# still not live (ScheduledPublication.sweep_overdue!). A publish whose job
# was lost, or failed for good after its retries (PublishPageJob), then
# happens while the server runs, and not only at its next start. The time
# is read when the job runs, so a test sets it with travel_to.
class EnqueueOverdueSchedulesJob < ApplicationJob
  queue_as :default

  def perform
    set_again = ScheduledPublication.sweep_overdue!
    logger.info "scheduled publish(es) late with no job at work, set again: #{set_again.join(', ')}" unless set_again.empty?
    set_again
  end
end
