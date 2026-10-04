require "test_helper"
require "open3"
require "sqlite3"

# bin/jobs, the command the README gives for the jobs of a production run
# that has none in its server (`ruby bin/jobs`), started for real, in the
# e2e environment on databases in a folder of its own that the test
# deletes. Solid Queue's own default, a supervisor that forks its workers,
# stops with NotImplementedError on Windows: the command has to start
# there too, with its workers as threads (async), and stay up.
class BinJobsTest < ActiveSupport::TestCase
  include OwnDatabases

  def stop(pid)
    if Gem.win_platform?
      system("taskkill", "/PID", pid.to_s, "/T", "/F", out: File::NULL, err: File::NULL)
    else
      Process.kill("TERM", pid)
    end
    Timeout.timeout(30) { Process.wait(pid) }
  rescue Errno::ESRCH, Errno::ECHILD
    nil
  end

  # What the queue's database says is running: the kinds of its processes.
  def kinds(queue_database)
    return [] unless File.exist?(queue_database)

    database = SQLite3::Database.new(queue_database, readonly: true)
    begin
      database.execute("SELECT kind FROM solid_queue_processes ORDER BY id").flatten
    ensure
      database.close
    end
  rescue SQLite3::Exception
    []
  end

  test "ruby bin/jobs starts Solid Queue where it cannot fork too, and stays running" do
    dir = Rails.root.join("tmp", "bin-jobs-#{SecureRandom.hex(4)}")
    FileUtils.mkdir_p(dir)
    env = {
      "RAILS_ENV" => "e2e", "SECRET_KEY_BASE_DUMMY" => "1", "RAILS_LOG_LEVEL" => "info",
      **own_databases("e2e", dir), "CMS_STORAGE_ROOT" => dir.join("storage").to_s
    }
    out, status = Open3.capture2e(env, RbConfig.ruby, "bin/rails", "db:create", "db:schema:load", chdir: Rails.root.to_s)
    assert status.success?, out
    log = dir.join("jobs.log")
    queue = dir.join("queue.sqlite3").to_s

    pid = Process.spawn(env, RbConfig.ruby, "bin/jobs", chdir: Rails.root.to_s, out: log.to_s, err: %i[child out])
    begin
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 90
      exited = nil
      sleep 0.5 until (kinds(queue) & %w[Worker Dispatcher Scheduler]).size == 3 ||
                      (exited = Process.wait2(pid, Process::WNOHANG)) ||
                      Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
      assert_nil exited, "bin/jobs stopped (#{exited&.last}):\n#{log.read}"

      registered = kinds(queue)
      assert_equal %w[Dispatcher Scheduler Worker], registered.grep(/\A(Worker|Dispatcher|Scheduler)\z/).sort, log.read
      assert_includes registered, "Supervisor(#{Gem.win_platform? ? 'async' : 'fork'})", "the supervisor runs in the mode the platform can"
      sleep 3
      assert_nil Process.wait2(pid, Process::WNOHANG), "and it stays up:\n#{log.read}"
      assert_no_match(/unimplemented|NotImplementedError/, log.read)
    ensure
      stop(pid)
      FileUtils.rm_rf(dir)
    end
  end
end
