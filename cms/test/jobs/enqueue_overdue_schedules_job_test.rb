require "test_helper"

# The sweep that runs every minute while the server is up: a scheduled
# publish whose job was lost, or failed for good, is set going again
# without waiting for the server's next start.
class EnqueueOverdueSchedulesJobTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  NOW = Time.utc(2026, 10, 4, 9, 0)
  AT = Time.utc(2026, 10, 5, 7, 15)

  def scheduled_page(slug, at: AT)
    page = Page.create_with_draft!(title: slug.capitalize, slug: slug)
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: slug.capitalize), save_id: "save-#{slug}")
    schedule, = travel_to(NOW) { page.schedule_publish!(revision: 1, publish_at: at) }
    clear_enqueued_jobs
    schedule
  end

  def sweep(at)
    travel_to(at) { EnqueueOverdueSchedulesJob.perform_now }
  end

  test "a schedule more than a minute late with its page still not live gets its job again, once in five minutes" do
    lost = scheduled_page("lost")

    first = AT + 61.seconds

    assert_equal [], sweep(AT + 59.seconds), "a job that is only seconds behind is left to run"
    assert_equal [ lost.id ], sweep(first)
    assert_enqueued_with(job: PublishPageJob, args: [ lost.id ])
    clear_enqueued_jobs

    assert_equal [], sweep(AT + 3.minutes), "set again a moment ago: left alone for the five minutes"
    assert_equal [], sweep(first + 5.minutes - 1.second)
    assert_equal [ lost.id ], sweep(first + 5.minutes)
    assert_equal 1, enqueued_jobs.size
  end

  test "only a schedule still pending and late is set again: not one that is on time, published or cancelled" do
    late = scheduled_page("late", at: AT)
    scheduled_page("on-time", at: AT + 1.hour)
    cancelled = scheduled_page("cancelled")
    cancelled.cancel!(at: AT - 1.hour)
    done = scheduled_page("done")
    travel_to(AT) { PublishPageJob.perform_now(done.id) }
    assert_equal "published", done.reload.state

    assert_equal [ late.id ], sweep(AT + 10.minutes)
    assert_enqueued_jobs 1, only: PublishPageJob
  end

  test "the start of the queue sets every late schedule going, whatever its lease, and the sweep then leaves it be" do
    late = scheduled_page("late")
    assert_equal [ late.id ], sweep(AT + 2.minutes)
    clear_enqueued_jobs

    travel_to(AT + 3.minutes) { assert_equal [ late.id ], ScheduledPublication.enqueue_overdue! }
    clear_enqueued_jobs

    assert_equal [], sweep(AT + 4.minutes), "the start's job is at work"
  end

  test "the sweep is a recurring task of every environment that runs the queue, and runs every minute" do
    config = ActiveSupport::ConfigurationFile.parse(Rails.root.join("config", "recurring.yml"))
    %w[development e2e production].each do |env|
      task = config.fetch(env).fetch("enqueue_overdue_schedules")
      assert_equal [ "EnqueueOverdueSchedulesJob", "every minute" ], task.values_at("class", "schedule"), env
    end
    cron = Fugit.parse(config.dig("production", "enqueue_overdue_schedules", "schedule"))
    assert_equal Time.utc(2026, 10, 4, 12, 1), cron.next_time(Time.utc(2026, 10, 4, 12, 0, 30)).to_t.utc
    assert_equal Time.utc(2026, 10, 4, 12, 2), cron.next_time(Time.utc(2026, 10, 4, 12, 1)).to_t.utc
  end
end
