# frozen_string_literal: true

# What decides whether a copy of a published page, or of a piece of one,
# is still the page a visitor would get now. Nothing is ever deleted to
# invalidate a cache: whatever changes a page's bytes changes a key, and
# the entries under the old keys are never asked for again (Solid Cache
# drops them as they age or as the cache fills).
#
# A published page's bytes come from four things:
# - the published version, immutable once written: a publish, a restore
#   that is then published, or a scheduled publish all make a new one.
#   It is named by its id and by the moment it was put live: ids start
#   again whenever a database is made anew (db:drop then db:prepare, a
#   backup restored), and a copy of the old database's page 1, version 3
#   must never be taken for the new database's;
# - the site style, which colours every page (the layout's data
#   attributes);
# - the release the server runs: its code, templates, stylesheets, the
#   theme's site.yml, the schema's tokens and icons, its gems, and its
#   secret, which signs the addresses of library images;
# - for one block, nothing but its own subtree, rendered through the
#   partials of that release.
#
# So the browser's validator (the ETag) and the page's outer fragment are
# keyed on the version, the site style and the release; each block's
# fragment on a digest of its subtree and the revision of the token CSS,
# under the release (PublicPage's fragment_cache_key). The ETag's digest
# is made here rather than by fresh_when, whose digest of the action's
# template does not see the layout or the partials a helper renders.
module PageCache
  # The files of a release that can change what a page looks like, from
  # the app's root. Broad on purpose: a change that cannot alter a page
  # only costs one render per page, one that can and is left out serves an
  # old page.
  RELEASE_DIRECTORIES = %w[app config lib].freeze
  RELEASE_FILES = %w[Gemfile.lock].freeze
  # And the schema folder's own files (not its corpus): the tokens and
  # icons the theme draws, and the enums that decide which classes exist.
  SCHEMA_PATTERN = "*.{json,svg}"

  MUTEX = Mutex.new

  module_function

  # The validators of a published page's ETag: what is served, in what
  # colours, by which release. A visitor's copy stays good until one of
  # them changes.
  def etag(page, site_style)
    [ "page", *published_key(page), site_style_key(site_style), revision ]
  end

  # The key of a published page's outer fragment, its whole HTML. The
  # release is not repeated here: every fragment key of the public pages
  # starts with it (PublicPage).
  def page_fragment(page, site_style)
    [ "page", *published_key(page), site_style_key(site_style) ]
  end

  # The published version's id, and when the page was put live, to the
  # microsecond: both are on the page's row, so a 304 is decided before
  # the version's document is read. The id alone repeats whenever the
  # database is made anew; the moment does not.
  def published_key(page)
    [ page.published_version_id, page.published_at&.utc&.strftime("%Y%m%dT%H%M%S.%6N") ]
  end

  # The site style as a short key: the tone of each slot and the type
  # scale. The validations allow one way to write a given style, so equal
  # keys mean equal pages.
  def site_style_key(site_style)
    palette = site_style.palette.is_a?(Hash) ? site_style.palette.sort : site_style.palette
    ActiveSupport::Digest.hexdigest(JSON.generate([ palette, site_style.type_scale ]))
  end

  # A digest of the release, computed once per process. Where code is
  # reloaded (development), it is computed again when one of its files
  # changes, so an edited partial is not answered with a 304 for the page
  # it no longer draws.
  def revision
    current[:revision]
  end

  # The revision of tokens.css, as its fingerprinted name says it: the
  # classes a block's style turns into live there.
  def token_css_revision
    current[:token_css]
  end

  def current
    MUTEX.synchronize do
      if Rails.application.config.enable_reloading
        # The watcher Rails' own reloader uses (config.file_watcher).
        @checker ||= Rails.application.config.file_watcher.new(release_files, release_directories) { @current = nil }
        @checker.execute_if_updated
      end
      @current ||= {
        revision: release_digest(release_files, secret: release_secret),
        token_css: File.basename(ActionController::Base.helpers.asset_path("tokens.css"), ".css")
      }.freeze
    end
  end

  # Every file of the release, sorted, with the release's paths.
  def release_files(root: Rails.root, schema_dir: Rails.application.config.x.schema_dir)
    files = RELEASE_DIRECTORIES.flat_map { |dir| Dir.glob(File.join(root.to_s, dir, "**", "*")) }
    files += RELEASE_FILES.map { |file| File.join(root.to_s, file) }
    files += Dir.glob(File.join(schema_dir.to_s, SCHEMA_PATTERN))
    files.select { |path| File.file?(path) }.sort
  end

  # The folders whose new files a reloading server notices; the schema's
  # files are watched one by one, so its corpus is not walked per request.
  def release_directories
    RELEASE_DIRECTORIES.to_h { |dir| [ Rails.root.join(dir).to_s, [] ] }
  end

  # The digest of the files' names and bytes, of the Ruby that runs them,
  # and of a key derived from the app's secret: a new secret signs library
  # images under new addresses, and a page cached with the old ones would
  # show none of its images. The secret itself never enters the digest.
  def release_digest(files, secret:, root: Rails.root.join("..").expand_path)
    digest = Digest::SHA256.new
    digest << RUBY_VERSION << "\0" << secret << "\0"
    files.each do |path|
      digest << Pathname(path).expand_path.relative_path_from(root).to_s << "\0" << File.binread(path) << "\0"
    end
    digest.hexdigest
  end

  def release_secret
    Digest::SHA256.hexdigest(Rails.application.key_generator.generate_key("page-builder-cms/page-cache", 32))
  end

  # The keys of the blocks of one render: [token CSS revision, digest of
  # the block's subtree]. A digest is taken once per block, from the
  # block without its children and the digests of its children, so a
  # page's digests cost one pass over its document. Equal digests mean
  # equal subtrees, and the partials draw a block from its subtree alone.
  class BlockKeys
    def initialize(token_css: PageCache.token_css_revision)
      @token_css = token_css
      @digests = {}.compare_by_identity
    end

    def call(block)
      [ @token_css, digest(block) ]
    end

    def digest(block)
      @digests[block] ||= begin
        children = Array(block["children"]).map { |child| child.is_a?(Hash) ? digest(child) : child }
        Digest::SHA256.hexdigest(JSON.generate([ block.except("children"), children ]))
      end
    end
  end
end
