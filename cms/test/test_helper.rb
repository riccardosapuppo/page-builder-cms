ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel processes, one per processor, except on Windows,
    # which cannot fork: there they run in one process. Threads are not an
    # option with SQLite, whose transactions break under them once a suite
    # passes about fifty tests.
    parallelize(workers: Gem.win_platform? ? 1 : :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
  end
end
