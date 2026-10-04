require "test_helper"
require "open3"

# lib/tasks/release_connections.rake: db:drop deletes a SQLite file that
# its own environment check has just opened. Run as a person runs it, in
# processes of their own, on databases of their own (every database
# development has, OwnDatabases; DATABASE_URL also keeps db:drop away from
# the test database), so the development and test databases are never
# touched: the tasks' own output must name no other file.
#
# On Linux and macOS an open file can be deleted, and this passes with or
# without the rake file; on Windows it is what fails without it.
class DbDropTest < ActiveSupport::TestCase
  include OwnDatabases

  test "db:drop deletes a SQLite database that db:check_protected_environments has opened" do
    dir = Rails.root.join("tmp", "db-drop-#{SecureRandom.hex(4)}")
    FileUtils.mkdir_p(dir)
    file = dir.join("primary.sqlite3")
    env = { "RAILS_ENV" => "development", **own_databases("development", dir) }
    rails = ->(*tasks) { Open3.capture2e(env, RbConfig.ruby, "bin/rails", *tasks, chdir: Rails.root.to_s) }

    out, status = rails.call("db:create", "db:schema:load")
    assert status.success?, out
    assert file.file?, out
    inside, outside = databases_named(out, dir)
    assert_includes inside, file.relative_path_from(Rails.root).to_s, "db:create names the database it made"
    assert_equal [], outside, "db:create made or loaded a database outside the test's folder"

    out, status = rails.call("db:drop")
    assert status.success?, out
    assert_not file.exist?, out
    assert_equal [], databases_named(out, dir).last, "db:drop dropped a database outside the test's folder"
  ensure
    FileUtils.rm_rf(dir) if dir
  end
end
