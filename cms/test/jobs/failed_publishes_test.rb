require "test_helper"
require "open3"

# The failed jobs of scheduled publishes that the sweep discards
# (ScheduledPublication.discard_settled_failures!), on Solid Queue's real
# tables: the tests' own environment has no queue database (the jobs run on
# the test adapter), so this runs in the e2e environment, in processes of
# its own, on databases in a folder of its own that it deletes. Four
# schedules each get a PublishPageJob failed for good (a database busy
# past every try, as Solid Queue records it), and another kind of job
# fails too; then three of the schedules are settled or gone, and the
# sweep runs.
class FailedPublishesTest < ActiveSupport::TestCase
  include OwnDatabases

  SCRIPT = <<~RUBY
    now = Time.current
    schedules = %w[live waiting cancelled gone].to_h do |name|
      page = Page.create_with_draft!(title: name.capitalize, slug: "failed-\#{name}")
      schedule, = page.schedule_publish!(revision: 0, publish_at: now + 1.hour, at: now)
      [ name, schedule ]
    end
    failed_for_good = lambda do |job_class, *arguments|
      job = SolidQueue::Job.find_by!(active_job_id: job_class.perform_later(*arguments).job_id)
      SolidQueue::ReadyExecution.where(job_id: job.id).delete_all
      begin
        raise ActiveRecord::StatementTimeout, "SQLite3::BusyException: database is locked"
      rescue ActiveRecord::StatementTimeout => error
        job.failed_with(error)
      end
      job.id
    end
    planted = schedules.transform_values { |schedule| failed_for_good.call(PublishPageJob, schedule.id) }
    other = failed_for_good.call(PurgeMediaJob)
    failed_before = SolidQueue::FailedExecution.count
    scheduled_before = SolidQueue::ScheduledExecution.count

    schedules["live"].settle!("published", at: now)
    schedules["cancelled"].cancel!(at: now)
    ScheduledPublication.where(id: schedules["gone"].id).delete_all
    set_again = EnqueueOverdueSchedulesJob.perform_now

    failed_jobs = SolidQueue::FailedExecution.pluck(:job_id).sort
    puts JSON.generate(
      "failed_before" => failed_before,
      "set_again" => set_again,
      "failed_left" => planted.select { |_name, id| failed_jobs.include?(id) }.keys + (failed_jobs.include?(other) ? [ "other kind" ] : []),
      "jobs_left" => planted.select { |_name, id| SolidQueue::Job.exists?(id) }.keys,
      "scheduled_kept" => SolidQueue::ScheduledExecution.count == scheduled_before,
      "states" => ScheduledPublication.order(:id).pluck(:state)
    )
  RUBY

  test "the sweep discards the failed job of a schedule since published, cancelled or gone, and keeps the one of a schedule still waiting" do
    dir = Rails.root.join("tmp", "failed-publishes-#{SecureRandom.hex(4)}")
    FileUtils.mkdir_p(dir)
    env = {
      "RAILS_ENV" => "e2e", "SECRET_KEY_BASE_DUMMY" => "1", "RAILS_LOG_LEVEL" => "warn",
      **own_databases("e2e", dir), "CMS_STORAGE_ROOT" => dir.join("storage").to_s
    }
    rails = ->(*args) { Open3.capture2e(env, RbConfig.ruby, "bin/rails", *args, chdir: Rails.root.to_s) }
    out, status = rails.call("db:create", "db:schema:load")
    assert status.success?, out
    inside, outside = databases_named(out, dir)
    assert_equal [ "cache.sqlite3", "primary.sqlite3", "queue.sqlite3" ], inside.map { |path| File.basename(path) }.sort, out
    assert_equal [], outside, "no database outside the test's folder is touched"
    script = dir.join("failed.rb")
    script.write(SCRIPT)

    out, status = rails.call("runner", script.to_s)

    assert status.success?, out
    result = JSON.parse(out.lines.last)
    assert_equal 5, result["failed_before"], "four publishes and one other job failed for good: #{out}"
    assert_equal [], result["set_again"], "no schedule is late: the sweep sets none going"
    assert_equal [ "waiting", "other kind" ], result["failed_left"], "only the waiting schedule's failure, and the other kind's, are kept"
    assert_equal [ "waiting" ], result["jobs_left"], "a discarded failure takes its job with it"
    assert result["scheduled_kept"], "the jobs still coming at their time are not touched"
    assert_equal %w[published pending cancelled], result["states"]
  ensure
    FileUtils.rm_rf(dir) if dir
  end
end
