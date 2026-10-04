# frozen_string_literal: true

# For a test that runs bin/rails in another environment, in processes of
# its own: every database of that environment sent to a folder of the
# test's own, as the variables Rails reads (DATABASE_URL for the primary,
# CACHE_DATABASE_URL, QUEUE_DATABASE_URL and so on for the others). Read
# from config/database.yml, so a database added there is covered: one left
# out is the environment's own file, which db:create makes,
# db:schema:load empties and db:drop deletes. The development queue, with
# a person's scheduled publishes in it, went that way at every run of the
# suite until this was used.
module OwnDatabases
  # The variables for every database of env_name, each a file of dir named
  # after the database ("primary.sqlite3", "queue.sqlite3").
  def own_databases(env_name, dir)
    folder = dir.relative_path_from(Rails.root)
    ActiveRecord::Base.configurations.configs_for(env_name: env_name).to_h do |config|
      variable = config.name == "primary" ? "DATABASE_URL" : "#{config.name.upcase}_DATABASE_URL"
      [ variable, "sqlite3:#{folder}/#{config.name}.sqlite3" ]
    end
  end

  # The database files the database tasks name in their output ("Created
  # database '...'", "Dropped database '...'", "Database '...' already
  # exists"), as [inside dir, outside it].
  def databases_named(output, dir)
    inside = File.expand_path(dir.to_s) + File::SEPARATOR
    output.scan(/database '([^']+)'/i).flatten.uniq.partition do |path|
      File.expand_path(path, Rails.root.to_s).start_with?(inside)
    end
  end
end
