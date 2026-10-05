require_relative "boot"

require "rails"
# Pick the frameworks you want:
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
require "active_storage/engine"
require "action_controller/railtie"
# require "action_mailer/railtie"
# require "action_mailbox/engine"
# require "action_text/engine"
require "action_view/railtie"
# require "action_cable/engine"
require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Cms
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Don't generate system test files.
    config.generators.system_tests = nil

    # No image variants on the server. They need libvips, a system library
    # this project does not ask anyone to install; the editor resizes images
    # in the browser before uploading them instead. :disabled is Active
    # Storage's own setting for this (activestorage 8.1.4, engine.rb): with
    # the 8.1 default, :vips, every boot logs a warning that libvips is
    # missing.
    config.active_storage.variant_processor = :disabled

    # The page document's schema and the design tokens, shared with the
    # editor: they live beside this app in the repository, never copied in.
    config.x.schema_dir = Rails.root.join("..", "schema").expand_path

    # The schema folder's own files (not its corpus) are read by models
    # that reload with the code (SiteIcons, SiteTokens, BlockStyle,
    # BlockDocument::Schema). Where code reloads (development), a change to
    # one reloads the code, as an edited model does: the server then draws
    # with the files on disk, and the release it names follows them
    # (PageCache counts them among the files that reload). Without this,
    # an edited icon waited for the next reload of something else, and the
    # release named the files as they were at the start.
    config.watchable_files.concat(Dir.glob("*.{json,svg}", base: config.x.schema_dir.to_s).sort.map { |name| config.x.schema_dir.join(name).to_s })

    # The site's name, menu and footer line (config/site.yml).
    config.x.site = config_for(:site)

    # The site's time zone, written out (config/site.yml) rather than left
    # to the machine's: a scheduled publish is set in it, the editor shows
    # it beside every such time, and the recurring jobs (config/
    # recurring.yml) run by its clock, Solid Queue's default zone being
    # this one. The database and the API keep UTC.
    config.time_zone = config.x.site.fetch(:time_zone)

    # Where SubmissionsController counts the forms each visitor sends (its
    # rate_limit), named here instead of left to the cache store: the
    # tests' cache is a :null_store, which counts nothing, so the limit
    # would never fire there and no test could show it. Solid Cache keeps
    # one count for every server process and across restarts; test.rb
    # names a memory store, which the tests empty before each one.
    config.x.submission_limit_store = :solid_cache_store

    # The address a form is counted under: the socket's own peer, never
    # what a header says. rate_limit's own default, request.remote_ip,
    # takes X-Forwarded-For or Client-Ip from any peer, not only a
    # proxy's, so a visitor could change one header and have a count of
    # their own at every send, or name another visitor's address and use
    # up that visitor's ten. Behind a front proxy on this machine every
    # visitor's peer is the proxy, so they share one count (the README says
    # so). SubmissionsController calls this with the request; config/
    # environments/e2e.rb gives the harness's tests an address each.
    config.x.submission_limit_by = ->(request) { request.remote_addr }
  end
end
