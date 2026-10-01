require "active_support/core_ext/integer/time"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Secrets. No credentials file and no master key are committed (see
  # cms/.gitignore), so production takes secret_key_base from the
  # SECRET_KEY_BASE environment variable, which Rails reads before any
  # credentials. Without it, production does not boot ("Missing
  # `secret_key_base`"). For a local production run with nothing to protect,
  # such as measurements and CI, SECRET_KEY_BASE_DUMMY=1 makes Rails use a
  # throwaway secret from tmp/local_secret.txt instead. Development and test
  # fall back to that file on their own.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Turn on fragment caching in view templates.
  config.action_controller.perform_caching = true

  # Cache assets for far-future expiry since they are all digest stamped.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # The fingerprinted files under /assets never change once written, so a
  # browser may keep them a year without asking again: immutable, scoped to
  # /assets alone (robots.txt and the error pages keep the header above).
  # cascade: true hands a request for a file that does not exist on to the
  # rest of the app, which answers 404 without this header; without it,
  # Rack::Static answered the miss itself, with the year-long header on the
  # 404.
  config.middleware.insert_before ActionDispatch::Static, Rack::Static,
                                  urls: [ "/assets" ], root: Rails.root.join("public").to_s, cascade: true,
                                  header_rules: [ [ :all, { "cache-control" => "public, max-age=31536000, immutable" } ] ]

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Store uploaded files on the local file system (see config/storage.yml for options).
  config.active_storage.service = :local

  # Assume all access to the app is happening through a SSL-terminating
  # reverse proxy, and force all access over SSL, with
  # Strict-Transport-Security and secure cookies. CMS_FORCE_SSL=0 turns both
  # off, for a local production run over plain HTTP on 127.0.0.1 (the checks
  # of tools/check-production.ts, measurements, CI): there, HSTS would pin
  # 127.0.0.1 to HTTPS in the browser that visited it.
  plain_http = ENV["CMS_FORCE_SSL"] == "0"
  config.assume_ssl = !plain_http
  config.force_ssl = !plain_http

  # Skip http-to-https redirect for the default health check endpoint.
  # config.ssl_options = { redirect: { exclude: ->(request) { request.path == "/up" } } }

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Replace the default in-process memory cache store with a durable alternative.
  config.cache_store = :solid_cache_store

  # Replace the default in-process and non-durable queuing backend for Active Job.
  config.active_job.queue_adapter = :solid_queue
  config.solid_queue.connects_to = { database: { writing: :queue } }

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # The server listens on 127.0.0.1 only, so the only names it is reached
  # by are this machine's. Any other Host is refused with 403: a page on
  # another site whose name was made to resolve to 127.0.0.1 (DNS
  # rebinding) would otherwise be the API's "own origin" in the browser's
  # eyes and in Api::BaseController's. Any port.
  config.hosts = [ "127.0.0.1", "localhost", "[::1]" ]
end
