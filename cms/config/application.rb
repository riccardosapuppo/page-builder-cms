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
  end
end
