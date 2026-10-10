# The test environment is used exclusively to run your application's
# test suite. You never need to work with it otherwise. Remember that
# your test database is "scratch space" for the test suite and is wiped
# and recreated between test runs. Don't rely on the data there!

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # While tests run files are not watched, reloading is not necessary.
  config.enable_reloading = false

  # Eager loading loads your entire application. When running a single test locally,
  # this is usually not necessary, and can slow down your test suite. However, it's
  # recommended that you enable it in continuous integration systems to ensure eager
  # loading is working properly before deploying your code.
  config.eager_load = ENV["CI"].present?

  # The stylesheets and fonts the tests ask for are app/assets' own, as
  # Propshaft's server compiles them, never a production build left in
  # public/assets. tools/check-production.ts and tools/measure-server.ts
  # make one there with assets:precompile and remove it at their end, which
  # a run killed before it never reaches. Two things would read that build:
  # the public file server, which comes before Propshaft's server in the
  # middleware, answers with any file under public/, and Propshaft takes
  # every asset's digest from public/assets/.manifest.json whenever that
  # file exists. On Windows the build is not even the same text: Propshaft
  # 1.3.2 writes the stylesheets it compiles in text mode, so each line
  # ends in CRLF under the source's own digest, and a test that read a rule
  # across two lines failed with a build there and passed without one. So
  # the public file server is off (no test asks it for a file), and the
  # folder Propshaft would build into and read a manifest from is one no
  # command of this repository fills. test/config/build_left_behind_test.rb
  # plants a build in public/assets and shows both.
  config.public_file_server.enabled = false
  config.assets.output_path = Rails.root.join("tmp", "test-assets")

  # Show full error reports.
  config.consider_all_requests_local = true
  config.cache_store = :null_store

  # Counted in memory, so the form submissions' limit fires in the tests
  # (config/application.rb says why it is not the cache store).
  config.x.submission_limit_store = :memory_store

  # Render exception templates for rescuable exceptions and raise for other exceptions.
  config.action_dispatch.show_exceptions = :rescuable

  # Disable request forgery protection in test environment.
  config.action_controller.allow_forgery_protection = false

  # Store uploaded files on the local file system in a temporary directory.
  config.active_storage.service = :test

  # Print deprecation notices to the stderr.
  config.active_support.deprecation = :stderr

  # Raises error for missing translations.
  # config.i18n.raise_on_missing_translations = true

  # Annotate rendered view with file names.
  # config.action_view.annotate_rendered_view_with_filenames = true

  # Raise error when a before_action's only/except options reference missing actions.
  config.action_controller.raise_on_missing_callback_actions = true
end
