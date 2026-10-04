require "test_helper"

# The keys of the page cache: the release's digest, the site style's, and
# each block's.
class PageCacheModelTest < ActiveSupport::TestCase
  def with_release
    Dir.mktmpdir("release") do |dir|
      root = Pathname(dir)
      FileUtils.mkdir_p(root.join("cms", "app", "views"))
      FileUtils.mkdir_p(root.join("schema", "corpus"))
      root.join("cms", "app", "views", "show.html.erb").write("<p>page</p>")
      root.join("cms", "Gemfile.lock").write("rails (8.1.4)")
      root.join("schema", "tokens.json").write("{}")
      root.join("schema", "corpus", "one.json").write("{}")
      digest = ->(secret: "s") { PageCache.release_digest(PageCache.release_files(root: root.join("cms"), schema_dir: root.join("schema")), secret: secret, root: root) }
      yield root, digest
    end
  end

  test "the release's digest changes with a file's bytes, a new file, the schema's tokens and the secret, and with nothing else" do
    with_release do |root, digest|
      first = digest.call
      assert_equal first, digest.call

      root.join("schema", "corpus", "one.json").write("{\"changed\": true}")
      root.join("cms", "tmp").mkpath
      root.join("cms", "tmp", "cache.txt").write("anything")
      assert_equal first, digest.call, "the corpus and tmp/ are not the release"

      seen = [ first ]
      [
        -> { root.join("cms", "app", "views", "show.html.erb").write("<p>page!</p>") },
        -> { root.join("cms", "app", "views", "new.html.erb").write("") },
        -> { root.join("cms", "Gemfile.lock").write("rails (8.1.5)") },
        -> { root.join("schema", "tokens.json").write("{\"a\":1}") }
      ].each do |change|
        change.call
        seen << digest.call
      end
      seen << digest.call(secret: "t")
      assert_equal seen.uniq, seen
    end
  end

  # Development reloads code, and its pages must not be answered with a
  # 304 drawn by a partial that has since been edited. Here the release is
  # a folder of its own, so no file of the app is touched.
  test "where code reloads, the release's digest follows an edited file and stays put otherwise" do
    Dir.mktmpdir("release") do |dir|
      file = File.join(dir, "show.html.erb")
      File.write(file, "<p>page</p>")
      # Written a minute ago: the edit below is then newer, as an edit is.
      # (Rails' checker ignores times in the future.)
      File.utime(Time.now - 60, Time.now - 60, file)
      as_reloading_release(dir) do
        first = PageCache.revision
        assert_equal first, PageCache.revision

        File.write(file, "<p>page, edited</p>")
        edited = PageCache.revision
        assert_not_equal first, edited

        File.write(File.join(dir, "new.html.erb"), "")
        assert_not_equal edited, PageCache.revision
      end
    end
  end

  test "what the release's digest takes from the app's secret is a digest of a key derived from it, never the secret" do
    secret = PageCache.release_secret

    assert_match(/\A[0-9a-f]{64}\z/, secret)
    assert_not_includes secret, Rails.application.secret_key_base
    assert_not_equal Digest::SHA256.hexdigest(Rails.application.secret_key_base), secret
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

  private

  # PageCache as a reloading server has it, over the files of dir alone;
  # afterwards, as it was, computed afresh at its next use.
  def as_reloading_release(dir)
    reloading = Rails.application.config.enable_reloading
    files = PageCache.method(:release_files)
    directories = PageCache.method(:release_directories)
    PageCache.define_singleton_method(:release_files) { |**| Dir.glob(File.join(dir, "*")).sort }
    PageCache.define_singleton_method(:release_directories) { { dir => [] } }
    forget = -> { %i[@current @checker].each { |name| PageCache.instance_variable_set(name, nil) } }
    forget.call
    Rails.application.config.enable_reloading = true
    yield
  ensure
    Rails.application.config.enable_reloading = reloading
    PageCache.define_singleton_method(:release_files, files)
    PageCache.define_singleton_method(:release_directories, directories)
    forget&.call
  end
end
