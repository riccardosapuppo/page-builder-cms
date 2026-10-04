require "test_helper"
require "open3"

# lib/queue_orphans.rb, on Solid Queue's real tables: the tests' own
# environment has no queue database (the jobs run on the test adapter), so
# this runs in the e2e environment, in processes of its own, on databases
# in a folder of its own that it deletes. A server stopped abruptly is
# planted as its rows: a worker whose process is gone, holding a job, and a
# dispatcher registered under the process id the new server was given.
class QueueOrphansTest < ActiveSupport::TestCase
  SCRIPT = <<~RUBY
    require "socket"
    dead, running = ARGV.map(&:to_i)
    host = Socket.gethostname
    job = SolidQueue::Job.find_by!(active_job_id: PublishPageJob.perform_later(424242).job_id)
    register = ->(kind, name, pid, hostname = host) { SolidQueue::Process.register(kind: kind, name: name, pid: pid, hostname: hostname, metadata: {}) }

    own = register.call("Supervisor(async)", "own", Process.pid)
    earlier = register.call("Worker", "earlier-worker", dead)
    SolidQueue::ReadyExecution.claim("*", 1, earlier.id)
    register.call("Dispatcher", "earlier-dispatcher", Process.pid)
    register.call("Worker", "running-worker", running)
    register.call("Worker", "other-machine-worker", dead, "another-machine")
    held = SolidQueue::ClaimedExecution.where(job_id: job.id).pluck(:process_id) == [ earlier.id ]

    released = QueueOrphans.release!(own: own.id)

    puts JSON.generate(
      "held" => held,
      "released" => released.map { |_id, kind, pid| [ kind, pid == dead ? "dead" : (pid == Process.pid ? "this" : pid) ] },
      "left" => SolidQueue::Process.order(:id).pluck(:name),
      "ready" => SolidQueue::ReadyExecution.where(job_id: job.id).exists?,
      "claimed" => SolidQueue::ClaimedExecution.where(job_id: job.id).exists?
    )
  RUBY

  test "a new server releases the rows of one stopped abruptly, and their job goes back to the queue" do
    dir = Rails.root.join("tmp", "queue-orphans-#{SecureRandom.hex(4)}")
    FileUtils.mkdir_p(dir)
    folder = dir.relative_path_from(Rails.root)
    env = {
      "RAILS_ENV" => "e2e", "SECRET_KEY_BASE_DUMMY" => "1", "RAILS_LOG_LEVEL" => "warn",
      "DATABASE_URL" => "sqlite3:#{folder}/e2e.sqlite3", "CACHE_DATABASE_URL" => "sqlite3:#{folder}/e2e_cache.sqlite3",
      "QUEUE_DATABASE_URL" => "sqlite3:#{folder}/e2e_queue.sqlite3", "CMS_STORAGE_ROOT" => dir.join("storage").to_s
    }
    rails = ->(*args) { Open3.capture2e(env, RbConfig.ruby, "bin/rails", *args, chdir: Rails.root.to_s) }
    out, status = rails.call("db:create", "db:schema:load")
    assert status.success?, out
    # A process id that no process has any more.
    dead = Process.spawn(RbConfig.ruby, "-e", "exit")
    Process.wait(dead)
    script = dir.join("orphans.rb")
    script.write(SCRIPT)

    out, status = rails.call("runner", script.to_s, dead.to_s, Process.pid.to_s)

    assert status.success?, out
    result = JSON.parse(out.lines.last)
    assert result["held"], "the planted worker held the job: #{out}"
    assert_equal [ [ "Worker", "dead" ], [ "Dispatcher", "this" ] ], result["released"]
    assert_equal [ "own", "running-worker", "other-machine-worker" ], result["left"]
    assert_equal [ true, false ], result.values_at("ready", "claimed"), "the job is back in the queue, held by no one"
  ensure
    FileUtils.rm_rf(dir) if dir
  end
end
