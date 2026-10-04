# frozen_string_literal: true

# Puts a scheduled publish live when its time comes (Page#schedule_publish!
# enqueues it for that time). The job only carries the schedule's id:
# whether to publish, and what, is read from the row when the job runs
# (ScheduledPublication#run!), because by then the schedule may have been
# cancelled or replaced, or the page published by hand. Whatever it finds,
# it says so in one log line.
class PublishPageJob < ApplicationJob
  queue_as :default

  def perform(schedule_id)
    schedule = ScheduledPublication.find_by(id: schedule_id)
    outcome = schedule ? schedule.run!(at: Time.current) : :missing
    said = "scheduled publish #{schedule_id}"

    case outcome
    when :published
      logger.info "#{said} of page #{schedule.page_id}: published revision #{schedule.revision} as version #{schedule.published_version.number}"
    when :early
      # Run before its time: the queue never does this, so something ran
      # the job by hand. It is set again for its time.
      logger.info "#{said} of page #{schedule.page_id}: not due until #{schedule.publish_at.utc.iso8601}; set again for then"
      self.class.set(wait_until: schedule.publish_at).perform_later(schedule_id)
    when :not_pending
      logger.info "#{said} of page #{schedule.page_id}: #{schedule.state} at #{schedule.settled_at.utc.iso8601}, nothing to do"
    when :superseded
      logger.info "#{said} of page #{schedule.page_id}: revision #{schedule.revision} or a later one is already live, nothing to do"
    when :failed
      logger.warn "#{said} of page #{schedule.page_id}: the scheduled document no longer passes the checks, nothing was published"
    when :missing
      logger.info "#{said}: no longer exists, nothing to do"
    end
    outcome
  end
end
