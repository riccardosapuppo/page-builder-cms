require "test_helper"
require "open3"

# The keys of the page cache: the page's, the release's digest, the site
# style's, and each block's.
class PageCacheModelTest < ActiveSupport::TestCase
  include ReleaseFolder

  # The release's digest as a server computes it, over a folder laid out as
  # the repository is.
  def digest_of(root, key: "s")
    paths = { root: root.join("cms"), schema_dir: root.join("schema") }
    PageCache.release_digest(
      booted: PageCache.files_digest(PageCache.booted_files(**paths), root: root),
      reloaded: PageCache.files_digest(PageCache.reloaded_files(**paths), root: root),
      key: key
    )
  end

  test "the release's digest changes with a file's bytes, a new file, the schema's tokens, the config and the secret, and with nothing else" do
    with_release_folder do |root, edit|
      first = digest_of(root)
      assert_equal first, digest_of(root)

      edit.call("schema/corpus/one.json", "{\"changed\": true}")
      edit.call("cms/tmp/cache.txt", "anything")
      assert_equal first, digest_of(root), "the corpus and tmp/ are not the release"

      seen = [ first ]
      [
        -> { edit.call("cms/app/views/show.html.erb", "<p>page!</p>") },
        -> { edit.call("cms/app/views/new.html.erb", "") },
        -> { edit.call("cms/config/site.yml", "name: Slack Water B") },
        -> { edit.call("cms/Gemfile.lock", "rails (8.1.5)") },
        -> { edit.call("schema/tokens.json", "{\"a\":1}") }
      ].each do |change|
        change.call
        seen << digest_of(root)
      end
      seen << digest_of(root, key: "t")
      assert_equal seen.uniq, seen
    end
  end

  test "a release's files are read again by a reloading server, or once as the process starts, and each is one or the other" do
    with_release_folder do |root, _edit|
      paths = { root: root.join("cms"), schema_dir: root.join("schema") }
      reloaded = PageCache.reloaded_files(**paths).map { |path| Pathname(path).relative_path_from(root).to_s }
      booted = PageCache.booted_files(**paths).map { |path| Pathname(path).relative_path_from(root).to_s }

      assert_equal %w[cms/app/models/thing.rb cms/app/views/show.html.erb cms/config/locales/en.yml cms/config/routes.rb schema/tokens.json], reloaded
      assert_equal %w[cms/Gemfile.lock cms/config/site.yml], booted
      assert_equal PageCache.release_files(**paths).size, reloaded.size + booted.size
    end
  end

  # Development reloads code, and its pages must not be answered with a
  # 304 drawn by a partial that has since been edited, or by an icon that
  # has. Here the release is a folder of its own, so no file of the app is
  # touched.
  test "where code reloads, the release's digest follows an edited file of the code or of the schema and stays put otherwise" do
    with_release_folder(reloading: true) do |root, edit|
      first = PageCache.revision
      assert_equal first, PageCache.revision

      edit.call("cms/app/views/show.html.erb", "<p>page, edited</p>")
      edited = PageCache.revision
      assert_not_equal first, edited

      edit.call("cms/app/views/new.html.erb", "")
      added = PageCache.revision
      assert_not_equal edited, added

      edit.call("cms/config/locales/en.yml", "en: { a: b }")
      localised = PageCache.revision
      assert_not_equal added, localised, "the locales are read again as it reloads"

      edit.call("schema/tokens.json", "{\"a\":1}")
      assert_not_equal localised, PageCache.revision, "the schema's files are read again as it reloads"
    end
  end

  # The models that read the schema's files reload with the code, and the
  # app's reloader watches those files: an edited icon reloads the code
  # that draws it, so the release that names the schema's files among
  # those that reload (above) names what the server draws with. A reader
  # outside the reloading code (an initializer, say) would keep the old
  # file until a restart, and the release would follow the new one.
  test "where code reloads, the app's reloader watches the schema's files, and only reloading code reads them" do
    schema_dir = Rails.application.config.x.schema_dir
    watched = Rails.application.config.watchable_files.map { |path| File.expand_path(path) }
    schema = PageCache.schema_files(schema_dir).map { |path| File.expand_path(path) }

    assert_includes schema.map { |path| File.basename(path) }, "icons.svg"
    assert_equal schema, watched.select { |path| File.dirname(path) == schema_dir.to_s }.sort, "every schema file the release counts as reloading, and no other, is watched"
    assert_equal schema, PageCache.reloaded_files.map { |path| File.expand_path(path) } & schema

    reloading = Rails.autoloaders.main.dirs.map { |dir| File.expand_path(dir) + File::SEPARATOR }
    %w[SiteIcons SiteTokens BlockStyle BlockDocument::Schema].each do |name|
      name.constantize
      source = File.expand_path(Object.const_source_location(name).first)
      assert reloading.any? { |dir| source.start_with?(dir) }, "#{name} (#{source}) reloads with the code"
    end
    readers = Dir.glob("**/*.rb", base: Rails.root.join("config").to_s).select { |file| Rails.root.join("config", file).read.include?("schema_dir") }
    assert_equal [ "application.rb" ], readers, "the config only names the schema's folder, and reads none of its files"
  end

  # What a reloading server has not read again is not what it draws with,
  # whatever the disk holds: config/site.yml is read once, as it starts. A
  # digest that followed the file would name a release the process is not
  # running, and the new release, started later, would find the pages
  # drawn with the old header under its own name.
  test "where code reloads, an edited config file or gem lockfile changes the release's digest only when the process starts again" do
    with_release_folder(reloading: true) do |root, edit|
      first = PageCache.revision

      edit.call("cms/config/site.yml", "name: Slack Water B")
      edit.call("cms/Gemfile.lock", "rails (8.1.5)")
      assert_equal first, PageCache.revision, "the process is still the one that read the old files"
      edit.call("cms/app/views/show.html.erb", "<p>page, edited</p>")
      reloaded = PageCache.revision
      assert_not_equal first, reloaded
      assert_equal reloaded, PageCache.revision

      PageCache.boot!

      assert_not_equal reloaded, PageCache.revision, "started again, it reads the new config"
    end
  end

  # A deploy starts a new process on new files. A process that has not
  # served a page yet is still the process that started on the old ones.
  test "where code does not reload, the release's digest is that of the files the process started on, whenever it is first asked" do
    with_release_folder do |root, edit|
      # The server has started and has been asked for nothing. Its files
      # change, and only then does the first visitor come.
      started = digest_of(root, key: PageCache.release_key)
      edit.call("cms/config/site.yml", "name: Slack Water B")
      edit.call("cms/app/views/show.html.erb", "<p>page, edited</p>")
      edit.call("cms/Gemfile.lock", "rails (8.1.5)")

      on_disk = digest_of(root, key: PageCache.release_key)
      assert_not_equal started, on_disk, "the files on disk are not those it started on"
      assert_equal started, PageCache.revision, "and it names the ones it started on"
      PageCache.boot!
      assert_equal on_disk, PageCache.revision, "the process started afterwards names the files on disk"
    end
  end

  # The digest is made as the process starts (config/initializers/page_cache.rb),
  # not at its first visit: a process of the app's own, asked for nothing.
  test "a process has its release's digest as soon as it has started, before any visit" do
    out, status = Open3.capture2e({ "RAILS_ENV" => "test", "RAILS_LOG_LEVEL" => "warn" }, RbConfig.ruby, "bin/rails", "runner",
                                  "puts JSON.generate(PageCache.instance_variable_get(:@revision))", chdir: Rails.root.to_s)

    assert status.success?, out
    assert_match(/\A"[0-9a-f]{64}"\z/, out.lines.last.to_s.strip, "the digest is there with no visit made: #{out}")
  end

  test "the page's key and ETag name the version by its id and the moment it was put live, to the microsecond" do
    now = Time.utc(2026, 10, 4, 18, 0, 45, 451_234)
    page = Page.new(published_version_id: 7, published_at: now)
    other = Page.new(published_version_id: 7, published_at: Time.utc(2026, 10, 4, 18, 0, 45, 451_235))
    style = SiteStyle.new(palette: SiteTokens.default_palette, type_scale: "balanced")

    assert_equal [ 7, "20261004T180045.451234" ], PageCache.published_key(page)
    assert_equal [ "page", 7, "20261004T180045.451234", PageCache.site_style_key(style) ], PageCache.page_fragment(page, style)
    assert_not_equal PageCache.page_fragment(page, style), PageCache.page_fragment(other, style)
    assert_not_equal PageCache.etag(page, style), PageCache.etag(other, style)
  end

  test "what the release's digest takes from the app's secret is a digest of a key derived from it, never the secret" do
    key = PageCache.release_key

    assert_match(/\A[0-9a-f]{64}\z/, key)
    assert_not_includes key, Rails.application.secret_key_base
    assert_not_equal Digest::SHA256.hexdigest(Rails.application.secret_key_base), key
  end

  test "the token CSS revision is the fingerprint of tokens.css as the page names it" do
    assert_equal File.basename(ActionController::Base.helpers.asset_path("tokens.css"), ".css"), PageCache.token_css_revision
    assert_match(/\Atokens-[0-9a-f]{8,}\z/, PageCache.token_css_revision)
  end

  test "the site style's key follows its tones and its type scale, not the order it was written in" do
    style = ->(palette, scale = "balanced") { SiteStyle.new(palette: palette, type_scale: scale) }
    palette = SiteTokens.default_palette
    reordered = palette.to_a.reverse.to_h
    key = PageCache.site_style_key(style.call(palette))

    assert_equal key, PageCache.site_style_key(style.call(reordered))
    assert_not_equal key, PageCache.site_style_key(style.call(palette.merge("primary" => "site-harbour")))
    assert_not_equal key, PageCache.site_style_key(style.call(palette, "strong"))
  end

  test "a block's key is the digest of its subtree: a widget changed changes it, its column and its section, nothing else" do
    document = page_document(widgets: [ heading_block("h1", "One"), heading_block("h2", "Two") ])
    document["sections"] << section_block("s2", [ heading_block("h3", "Three") ])
    changed = JSON.parse(JSON.generate(document))
    changed["sections"][0]["children"][0]["children"][1]["props"]["text"] = "Two, again"

    before = PageCache::BlockKeys.new(token_css: "tokens-1")
    after = PageCache::BlockKeys.new(token_css: "tokens-1")
    pairs = ->(path) { [ before.call(document.dig(*path)), after.call(changed.dig(*path)) ] }

    s1, c1, h1, h2 = [ [ "sections", 0 ], [ "sections", 0, "children", 0 ], [ "sections", 0, "children", 0, "children", 0 ], [ "sections", 0, "children", 0, "children", 1 ] ].map(&pairs)
    s2 = pairs.call([ "sections", 1 ])
    assert_equal [ false, false, false, true, true ], [ s1, c1, h2, h1, s2 ].map { |a, b| a == b }
    assert_equal "tokens-1", before.call(document["sections"][1]).first
    assert_not_equal before.call(document["sections"][1]), PageCache::BlockKeys.new(token_css: "tokens-2").call(document["sections"][1])
  end

  test "two blocks alike but for their id have different keys, and the order of children counts" do
    keys = PageCache::BlockKeys.new(token_css: "tokens-1")
    a = heading_block("a", "Same")
    b = heading_block("b", "Same")
    one = section_block("s", [ a, b ])
    other = section_block("s", [ b, a ])

    assert_not_equal keys.call(a), keys.call(b)
    assert_not_equal keys.call(one), keys.call(other)
  end
end
