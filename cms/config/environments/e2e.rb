require "active_support/core_ext/integer/time"

# The CMS the editor's browser tests and its storage battery start for
# themselves (builder/e2e/harness), on 127.0.0.1:3901 by default, beside
# the editor's development server. Production's behaviour where it matters
# to them, on data of its own:
# - three databases, primary, cache and queue, in a folder the harness
#   makes for each run and deletes afterwards (it passes their paths as
#   DATABASE_URL, CACHE_DATABASE_URL and QUEUE_DATABASE_URL; database.yml
#   gives defaults under tmp/e2e);
# - an Active Storage root of its own, CMS_STORAGE_ROOT (storage.yml);
# - forgery protection on, as in production, so a test that uploads
#   through the API's own endpoint shows it needs no CSRF token, while
#   Active Storage's stock endpoint refuses without one;
# - the solid_cache and solid_queue adapters, as in production, with
#   Solid Queue running inside Puma (config/puma.rb), so a scheduled
#   publish really happens at its time while the tests watch.
# The harness sets SECRET_KEY_BASE_DUMMY=1: like production, this
# environment has no credentials file to read a secret from.
Rails.application.configure do
  config.enable_reloading = false
  config.eager_load = true

  # Full error pages: this server only ever answers tests on this machine.
  config.consider_all_requests_local = true
  config.action_controller.perform_caching = true

  # Serve app/assets as development does: nothing is precompiled for a
  # test run, and nothing is left in public/assets after it.
  config.assets.server = true

  config.action_controller.allow_forgery_protection = true

  config.active_storage.service = :e2e

  config.cache_store = :solid_cache_store
  config.active_job.queue_adapter = :solid_queue
  config.solid_queue.connects_to = { database: { writing: :queue } }

  config.logger = ActiveSupport::TaggedLogging.logger(STDOUT)
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")
  config.silence_healthcheck_path = "/up"
  config.active_support.deprecation = :stderr

  # Only this machine's own names, as in production.
  config.hosts = [ "127.0.0.1", "localhost", "[::1]" ]

  config.action_controller.raise_on_missing_callback_actions = true

  # Only for the tests that start this server: every one of them reaches it
  # from 127.0.0.1, so a test says whose forms it sends in X-Forwarded-For
  # and they are counted under that address, each test with a count of its
  # own. Nowhere else does the limit take an address from a header
  # (config/application.rb says why); here it is safe, because this server
  # answers only the harness's tests (127.0.0.1 only, config/puma.rb), and
  # the tests are the ones that choose the address.
  config.x.submission_limit_by = ->(request) { request.remote_ip }
end
