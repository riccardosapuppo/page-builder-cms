require "test_helper"
require "open3"

# lib/tasks/release_connections.rake: db:drop deletes a SQLite file that
# its own environment check has just opened. Run as a person runs it, in
# processes of their own, on a database of their own (DATABASE_URL, which
# also keeps db:drop away from the test database), so the development and
# test databases are never touched.
#
# On Linux and macOS an open file can be deleted, and this passes with or
# without the rake file; on Windows it is what fails without it.
class DbDropTest < ActiveSupport::TestCase
  test "db:drop deletes a SQLite database that db:check_protected_environments has opened" do
    dir = Rails.root.join("tmp", "db-drop-#{SecureRandom.hex(4)}")
    FileUtils.mkdir_p(dir)
    file = dir.join("drop.sqlite3")
    env = { "RAILS_ENV" => "development", "DATABASE_URL" => "sqlite3:#{file.relative_path_from(Rails.root)}" }
    rails = ->(*tasks) { Open3.capture2e(env, RbConfig.ruby, "bin/rails", *tasks, chdir: Rails.root.to_s) }

    out, status = rails.call("db:create", "db:schema:load")
    assert status.success?, out
    assert file.file?, out

    out, status = rails.call("db:drop")
    assert status.success?, out
    assert_not file.exist?, out
  ensure
    FileUtils.rm_rf(dir) if dir
  end
end
