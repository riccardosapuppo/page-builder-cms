# This configuration file will be evaluated by Puma. The top-level methods that
# are invoked here are part of Puma's configuration DSL. For more information
# about methods provided by the DSL, see https://puma.io/puma/Puma/DSL.html.
#
# Puma starts a configurable number of processes (workers) and each process
# serves each request in a thread from an internal thread pool.
#
# You can control the number of workers using ENV["WEB_CONCURRENCY"]. You
# should only set this value when you want to run 2 or more workers. The
# default is already 1. You can set it to `auto` to automatically start a worker
# for each available processor.
#
# The ideal number of threads per worker depends both on how much time the
# application spends waiting for IO operations and on how much you wish to
# prioritize throughput over latency.
#
# As a rule of thumb, increasing the number of threads will increase how much
# traffic a given process can handle (throughput), but due to CRuby's
# Global VM Lock (GVL) it has diminishing returns and will degrade the
# response time (latency) of the application.
#
# The default is set to 3 threads as it's deemed a decent compromise between
# throughput and latency for the average Rails application.
#
# Any libraries that use a connection pool or another resource pool should
# be configured to provide at least as many connections as the number of
# threads. This includes Active Record's `pool` parameter in `database.yml`.
threads_count = ENV.fetch("RAILS_MAX_THREADS", 3)
threads threads_count, threads_count

# Every server of this project listens on this machine only: the API has
# no authentication. Started with no address and no port (`puma` itself),
# it listens on 127.0.0.1:3900, the project's port; `ruby bin/rails server`
# gets the same from bin/rails, and -p changes only the port.
port ENV.fetch("PORT", 3900), "127.0.0.1"

# And it refuses to start anywhere else: -b 0.0.0.0, BINDING=0.0.0.0, a
# bind line or a host name stop the boot here, before any socket is
# opened (plugins start before Puma binds). Loopback addresses
# (127.0.0.0/8, ::1), localhost and unix sockets are let through.
require "ipaddr"
require "uri"
Puma::Plugins.register("loopback_only", Class.new(Puma::Plugin) {
  def self.loopback?(bind)
    uri = URI.parse(bind)
    return true if uri.scheme == "unix"

    host = uri.hostname.to_s
    host == "localhost" || IPAddr.new(host).loopback?
  rescue URI::Error, IPAddr::Error
    false
  end

  def start(launcher)
    outside = Array(launcher.options[:binds]).reject { |bind| self.class.loopback?(bind) }
    return if outside.empty?

    abort "Refusing to listen on #{outside.join(', ')}: this server has no authentication and listens on " \
          "this machine only. Use -b 127.0.0.1 (the default) and -p for the port."
  end
})
plugin :loopback_only

# Allow puma to be restarted by `bin/rails restart` command.
plugin :tmp_restart

# The jobs (a scheduled publish, the pruning of old versions) run in Solid
# Queue's supervisor inside Puma, so one server is all there is to start
# and to stop: always in development and in e2e, where the editor's
# browser tests need a scheduled publish to really happen, and anywhere
# else with SOLID_QUEUE_IN_PUMA set (production otherwise runs bin/jobs).
# Windows cannot fork: there the supervisor and its workers are threads
# of Puma's own process (:async); elsewhere a child process (:fork).
# RAILS_ENV is set by `ruby bin/rails server` before Puma reads this file.
if ENV["SOLID_QUEUE_IN_PUMA"] || %w[development e2e].include?(ENV["RAILS_ENV"] || ENV["RACK_ENV"] || "development")
  plugin :solid_queue
  solid_queue_mode(Gem.win_platform? ? :async : :fork)
end

# Specify the PID file. Defaults to tmp/pids/server.pid in development.
# In other environments, only set the PID file if requested.
pidfile ENV["PIDFILE"] if ENV["PIDFILE"]
