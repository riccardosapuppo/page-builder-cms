# frozen_string_literal: true

# Every minute (config/recurring.yml): sets the job of a scheduled publish
# going again when its time passed by more than a minute and the page is
# still not live (ScheduledPublication.sweep_overdue!). A publish whose job
# was lost, or failed for good after its retries (PublishPageJob), then
# happens while the server runs, and not only at its next start. Then it
# discards the failed jobs of schedules settled since
# (ScheduledPublication.discard_settled_failures!), so Solid Queue's list
# of failures holds no publish that has happened. The time is read when the
# job runs, so a test sets it with travel_to.
class EnqueueOverdueSchedulesJob < ApplicationJob
  queue_as :default

  def perform
    set_again = ScheduledPublication.sweep_overdue!
    logger.info "scheduled publish(es) late with no job at work, set again: #{set_again.join(', ')}" unless set_again.empty?
    discarded = ScheduledPublication.discard_settled_failures!
    logger.info "failed job(s) of scheduled publish(es) settled since, discarded: #{discarded.join(', ')}" unless discarded.empty?
    set_again
  end
end
