# frozen_string_literal: true

# PageCache over a release of its own: a folder laid out as the repository
# is (cms/ with its app, config and Gemfile.lock, and schema/), so a test
# can edit the files of "the release" without touching a file of the app,
# and start "the server" again with PageCache.boot!, as a deploy does.
#
# While the block runs, PageCache reads that folder instead of the app's.
# Afterwards it is put back and started again on the app's own files.
module ReleaseFolder
  FILES = {
    "cms/app/views/show.html.erb" => "<p>page</p>",
    "cms/app/models/thing.rb" => "class Thing; end",
    "cms/config/routes.rb" => "# routes",
    "cms/config/locales/en.yml" => "en: {}",
    "cms/config/site.yml" => "name: Slack Water A",
    "cms/Gemfile.lock" => "rails (8.1.4)",
    "schema/tokens.json" => "{}",
    "schema/corpus/one.json" => "{}"
  }.freeze

  # reloading: whether the server reloads its code, as development does.
  # Yields the folder's root and a lambda that edits a file of it:
  # edit.call("cms/config/site.yml", "name: B").
  #
  # Rails' checker (what a reloading server watches files with) compares
  # modification times, and a folder's changes when a file is added to it,
  # so the times are set here and not left to the clock: everything starts
  # dated a minute ago, and each edit is dated a second after the one
  # before, on the file and on the folders above it.
  def with_release_folder(reloading: false)
    Dir.mktmpdir("release") do |dir|
      root = Pathname(dir)
      start = Time.now - 60
      edits = 0
      write = lambda do |path, text, time|
        root.join(path).dirname.mkpath
        root.join(path).write(text)
        stamp = root.join(path)
        loop do
          File.utime(time, time, stamp)
          break if stamp == root

          stamp = stamp.dirname
        end
      end
      FILES.each { |path, text| write.call(path, text, start) }
      edit = lambda do |path, text|
        edits += 1
        write.call(path, text, start + edits)
      end
      with_release_paths(root.join("cms"), root.join("schema"), reloading: reloading) { yield root, edit }
    end
  end

  private

  def with_release_paths(cms, schema, reloading:)
    was = Rails.application.config.enable_reloading
    paths = PageCache.method(:release_paths)
    PageCache.define_singleton_method(:release_paths) { { root: cms, schema_dir: schema } }
    Rails.application.config.enable_reloading = reloading
    PageCache.boot!
    yield
  ensure
    PageCache.define_singleton_method(:release_paths, paths)
    Rails.application.config.enable_reloading = was
    PageCache.boot!
  end
end
