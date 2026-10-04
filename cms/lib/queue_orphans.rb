# frozen_string_literal: true

require "socket"

# The Solid Queue rows a server leaves when it stops abruptly.
#
# Solid Queue registers each of its parts (the supervisor, the workers, the
# dispatcher, the scheduler) as a row of solid_queue_processes, and a
# worker holds each job it is running as a claimed execution of its row.
# A clean stop deletes those rows and gives the claimed jobs back. Windows
# has no clean stop for a console server (taskkill /F, a closed window, a
# test harness's tree kill), so the rows stay. Solid Queue would find them
# by their heartbeat only once it is five minutes old
# (SolidQueue.process_alive_threshold), and would then mark their jobs
# failed, for good: a scheduled publish caught in the middle would never
# happen.
#
# So, as a supervisor starts (config/initializers/solid_queue.rb), every
# row registered on this machine by a process that no longer exists is
# deregistered, which gives its jobs back to the queue to run again. Every
# job of this app may run twice: each looks again at what it is about
# when it runs (PublishPageJob, PruneVersionsJob, PurgeMediaJob).
#
# A row of another machine is left to Solid Queue's own pruning; so is one
# whose process id a new process has taken since (Windows reuses ids).
module QueueOrphans
  module_function

  # own: the id of the starting supervisor's row, never released. Its
  # process is this one; any other row with this process's id is an
  # earlier server's whose id this one was given. Returns the rows
  # released, as [id, kind, pid].
  def release!(own:, hostname: Socket.gethostname, alive: method(:alive?))
    rows = SolidQueue::Process.where(hostname: hostname).where.not(id: own).pluck(:id, :kind, :pid)
    gone = rows.select { |_id, _kind, pid| pid == ::Process.pid || !alive.call(pid) }
    gone.each do |id, _kind, _pid|
      # Each row on its own (pruned: true leaves a supervisor's supervisees
      # to their own turn here); deleting a worker's row gives back the
      # jobs it held. find_by: a row may have gone meanwhile.
      SolidQueue::Process.find_by(id: id)&.deregister(pruned: true)
    end
    gone
  end

  def alive?(pid)
    ::Process.kill(0, pid)
    true
  rescue Errno::ESRCH
    false
  rescue Errno::EPERM
    # It exists, and belongs to someone else.
    true
  end
end
