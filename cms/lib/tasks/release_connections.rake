# `ruby bin/rails db:drop` failed on Windows with "Permission denied @
# apply2files - .../storage/development.sqlite3", with no server and no
# other Ruby process running. The process holding the file was db:drop
# itself: its first step, db:check_protected_environments, connects to the
# database to read the environment stored in it, and the connection pool
# keeps that connection open. Windows refuses to delete a file that is
# open; Linux and macOS delete it and let the open handle go stale, so
# there the drop worked. DISABLE_DATABASE_ENVIRONMENT_CHECK=1, which skips
# that step and so never opens the file, made the same drop succeed.
#
# Every connection is closed just before the files are deleted, so the
# check still runs and the drop works everywhere. Nothing changes where
# the drop already worked.
namespace :db do
  task release_connections: :load_config do
    ActiveRecord::Base.connection_handler.clear_all_connections!(:all)
  end
end

# db:drop and db:reset delete through db:drop:_unsafe; db:drop:all deletes
# on its own.
task "db:drop:_unsafe" => "db:release_connections"
task "db:drop:all" => "db:release_connections"
