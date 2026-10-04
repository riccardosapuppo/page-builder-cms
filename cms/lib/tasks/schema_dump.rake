# Rails dumps db/schema.rb (and the cache and queue databases' schemas)
# after every migration, the ones db:prepare runs included, through
# File.open in Ruby's text mode: on Windows every line then ends in CRLF.
# The repository holds them with LF (.gitattributes), so a reader's
# npm start that migrated an older development database left
# cms/db/schema.rb modified, nothing changed but its line endings.
#
# The dump is turned back to LF as soon as it is written, whatever the
# system and wherever SCHEMA sends it; where Ruby writes LF already there
# is nothing to turn, and the file is not written twice.
# tools/start/setup-tree.test.ts runs the setup with a migration to run
# and holds the schema and git status to what they were.
module SchemaDumpWithLf
  def dump_schema(db_config, format = db_config.schema_format)
    super
    path = schema_dump_path(db_config, format)
    return unless path && File.file?(path)

    written = File.binread(path)
    File.binwrite(path, written.gsub("\r\n", "\n")) if written.include?("\r\n")
  end
end

ActiveRecord::Tasks::DatabaseTasks.singleton_class.prepend(SchemaDumpWithLf)
