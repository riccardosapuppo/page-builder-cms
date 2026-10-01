ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

Dir[File.join(__dir__, "support", "*.rb")].sort.each { |file| require file }

module ActiveSupport
  class TestCase
    # Run tests in parallel processes, one per processor, except on Windows,
    # which cannot fork: there they run in one process. Threads are not an
    # option with SQLite, whose transactions break under them once a suite
    # passes about fifty tests.
    parallelize(workers: Gem.win_platform? ? 1 : :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    include Documents
  end
end

module ActionDispatch
  class IntegrationTest
    include ApiRequests
  end
end

# The test storage service has a root of its own (config/storage.yml). Tests
# that upload delete their files as they finish (StoredFiles); what is left
# at the end are the empty folders the disk service made, removed here. A
# file still there means a test forgot to clean up: the run fails, since the
# next one would find it.
Minitest.after_run do
  root = ActiveStorage::Blob.services.fetch(:test).root
  next unless File.directory?(root)

  left = Dir.glob(File.join(root, "**", "*")).select { |path| File.file?(path) && File.basename(path) != ".keep" }
  Dir.glob(File.join(root, "**", "*")).select { |path| File.directory?(path) }.sort_by { |path| -path.length }.each do |dir|
    Dir.rmdir(dir) if Dir.empty?(dir)
  end
  abort "test storage: #{left.size} file(s) left behind under #{root}" unless left.empty?
end
