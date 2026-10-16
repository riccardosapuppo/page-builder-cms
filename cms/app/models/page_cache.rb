# frozen_string_literal: true

# What decides whether a copy of a published page, or of a piece of one,
# is still the page a visitor would get now. Nothing is ever deleted to
# invalidate a cache: whatever changes a page's bytes changes a key, and
# the entries under the old keys are never asked for again (Solid Cache
# drops them as they age or as the cache fills).
#
# A published page's bytes come from five things:
# - the published version, immutable once written: a publish, a restore
#   that is then published, or a scheduled publish all make a new one.
#   It is named by its id and by the moment it was put live: ids start
#   again whenever a database is made anew (db:drop then db:prepare, a
#   backup restored), and a copy of the old database's page 1, version 3
#   must never be taken for the new database's;
# - the site style, which colours every page (the layout's data
#   attributes);
# - the site's header and footer (SiteParts), drawn by the layout around
#   every page: each its published version, named as a page's is, or its
#   starter until it has one;
# - the release the server runs: its code, templates, stylesheets, the
#   header's and footer's starters in config/parts, the schema's tokens
#   and icons, its gems, and its secret, which signs the addresses of
#   library images;
# - the collections its Collection lists name, and those of the header's
#   and footer's (SiteContent#keys): each its id, the count of the changes
#   a visitor could see of it and when the last was made, which a publish,
#   an unpublish or the delete of a live entry, and any change of the
#   collection's definition, move (Collection#advance!);
# - the shop's settings (on, the currency, the products collection and
#   its price field), for a page that lists the collection the shop sells
#   from or is drawn with an entry of it, while the shop is on
#   (SiteContent#shop_key): its prices are drawn in the shop's currency,
#   its Add to cart by them; any other page is drawn as with no shop;
# - for one block, nothing but its own subtree, rendered through the
#   partials of that release; and for a Collection list its collection's
#   key, and the shop's while it sells from that collection, and for a
#   Field block and an Add to cart block what it draws of its entry.
#
# So the browser's validator (the ETag) and the page's outer fragment are
# keyed on the version, the site style, the header and footer, the
# collections listed, the shop where it draws, and the release; each
# block's fragment on a digest
# of its subtree and the revision of the token CSS, under the release
# (PublicPage's fragment_cache_key), the header's and the footer's blocks
# too: a new header redraws only its blocks that changed, once, and every
# page finds them, and its own blocks, where they were. The ETag's digest
# is made here rather than by fresh_when, whose digest of the action's
# template does not see the layout or the partials a helper renders.
#
# An entry's page (EntryPagesController) is the collection's published
# template drawn with the entry's published values: it is keyed the same
# way on the template's version, and on the entry as it went live and its
# collection's fields, which say how each value is drawn (entry_key).
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
  # Of those, what a reloading server (development) reads again as it
  # reloads: the code and templates (app/, lib/), the routes, the locales,
  # and the schema's files. These are read by models that reload with the
  # code (SiteIcons, SiteTokens, BlockStyle, BlockDocument::Schema), and a
  # change to one reloads it, as an edited model does
  # (config.watchable_files, config/application.rb). Every other file of
  # the release is read once, as the process starts: config/site.yml, the
  # starters of config/parts, the other config files, the gems. A
  # reloading server that has not been restarted still draws with what it
  # read then, whatever the disk holds now, so the release it names is the
  # one it read then.
  RELOADED = %w[app lib config/routes.rb config/locales].freeze

  MUTEX = Mutex.new

  module_function

  # The validators of a published page's ETag: what is served, in what
  # colours, under which header and footer, listing which collections as
  # they are, by which release. A visitor's copy stays good until one of
  # them changes.
  def etag(page, site_style, parts, content = SiteContent::NONE)
    [ *page_fragment(page, site_style, parts, content), revision ]
  end

  # The key of a published page's outer fragment, its whole HTML. The
  # release is not repeated here: every fragment key of the public pages
  # starts with it (PublicPage).
  def page_fragment(page, site_style, parts, content = SiteContent::NONE)
    [ "page", *published_key(page), site_style_key(site_style), parts_key(parts), content.keys, *content.shop_key ]
  end

  # The same for an entry's page: its entry and its collection's fields
  # (entry_key), and the template drawn with them, named as a page is.
  def entry_etag(collection, entry, template, site_style, parts, content)
    [ *entry_fragment(collection, entry, template, site_style, parts, content), revision ]
  end

  def entry_fragment(collection, entry, template, site_style, parts, content)
    [ "entry", *entry_key(collection, entry), *published_key(template), site_style_key(site_style), parts_key(parts), content.keys, *content.shop_key ]
  end

  # An entry as its page draws it: its id, and a digest of what it went
  # live with (its title, its slug, its values) and of its collection's
  # fields, by which each value is drawn. Both are on the rows the page
  # reads to find the entry; equal digests draw equal pages, so a save of
  # the draft, or a publish of the same values again, keeps the key.
  def entry_key(collection, entry)
    [ entry.id, ActiveSupport::Digest.hexdigest(JSON.generate([ entry.published_title, entry.published_slug, entry.published_field_values, collection.id, collection.fields ])) ]
  end

  # The published version's id, and when the page was put live, to the
  # microsecond: both are on the page's row, so a 304 is decided before
  # the version's document is read. The id alone repeats whenever the
  # database is made anew; the moment does not.
  def published_key(page)
    [ page.published_version_id, moment(page.published_at) ]
  end

  # A moment as the keys write it, to the microsecond, in UTC.
  def moment(time)
    time&.utc&.strftime("%Y%m%dT%H%M%S.%6N")
  end

  # The site style as a short key: the tone of each slot, the type scale,
  # the letter width and the custom CSS, whose address the layout writes.
  # The validations allow one way to write a given style, so equal keys
  # mean equal pages.
  def site_style_key(site_style)
    palette = site_style.palette.is_a?(Hash) ? site_style.palette.sort : site_style.palette
    ActiveSupport::Digest.hexdigest(JSON.generate([ palette, site_style.type_scale, site_style.letter_width, site_style.custom_css ]))
  end

  # The shop's settings as a short key: on or off, the currency, the
  # products collection and its price field (ShopSetting#settings). The
  # rules allow one way to write each, so equal keys mean equal prices.
  def shop_key(settings)
    ActiveSupport::Digest.hexdigest(JSON.generate(settings.values_at("enabled", "currency", "productsCollectionId", "priceField")))
  end

  # The header and footer the pages draw (SiteParts.live), each as its kind
  # and its published version, named as a page's is, or "starter" while it
  # has none: the starters are files of the release (config/parts), whose
  # change changes the revision.
  def parts_key(parts)
    parts.map { |kind, part| [ kind, *part.key ] }
  end

  # The digest of the release this process runs. It is made as the process
  # starts (boot!, from config/initializers/page_cache.rb), never at the
  # first request: a server started on one release whose files change
  # before its first visitor must not label what it draws with the next.
  # Where code is reloaded (development) the part that reloads is read
  # again whenever one of its files changes, so an edited partial is not
  # answered with a 304 for the page it no longer draws; the rest stays
  # what the process read as it started, and changes only with a restart.
  def revision
    MUTEX.synchronize { current }
  end

  # The revision of tokens.css, as its fingerprinted name says it: the
  # classes a block's style turns into live there. Read at the first
  # visit, with the asset manifest the pages' links come from, so the two
  # always agree.
  def token_css_revision
    MUTEX.synchronize do
      current
      @token_css ||= File.basename(ActionController::Base.helpers.asset_path("tokens.css"), ".css")
    end
  end

  # As a process starts: reads the files of the release it will run and
  # fixes its digest. A reloading server keeps what it read here beside
  # the reloadable code (config.x), since the code that holds a digest is
  # itself reloaded and starts over.
  def boot!
    MUTEX.synchronize do
      Rails.application.config.x.page_cache.booted = nil
      @revision = @token_css = @checker = nil
      current
    end
  end

  # Called with the mutex held.
  def current
    if Rails.application.config.enable_reloading
      # The watcher Rails' own reloader uses (config.file_watcher), made
      # before the digest is read so that an edit in between is seen.
      @checker ||= Rails.application.config.file_watcher.new(reloaded_files, reloaded_directories) { @revision = @token_css = nil }
      @checker.execute_if_updated
    end
    @revision ||= release_digest(booted: booted_digest, reloaded: files_digest(reloaded_files), key: release_key)
  end

  # The digest of the files the process read as it started.
  def booted_digest
    Rails.application.config.x.page_cache.booted ||= files_digest(booted_files)
  end

  # The folders of the release: the app's root, and the schema's.
  def release_paths
    { root: Rails.root, schema_dir: Rails.application.config.x.schema_dir }
  end

  # Every file of the release, sorted, with the release's paths.
  def release_files(root: release_paths[:root], schema_dir: release_paths[:schema_dir])
    files = RELEASE_DIRECTORIES.flat_map { |dir| Dir.glob(File.join(root.to_s, dir, "**", "*")) }
    files += RELEASE_FILES.map { |file| File.join(root.to_s, file) }
    files += schema_files(schema_dir)
    files.select { |path| File.file?(path) }.sort
  end

  # The schema folder's own files (SCHEMA_PATTERN), sorted. Matched inside
  # the folder, so a character of its path is never read as a pattern.
  def schema_files(schema_dir = release_paths[:schema_dir])
    Dir.glob(SCHEMA_PATTERN, base: schema_dir.to_s).sort.map { |name| File.join(schema_dir.to_s, name) }
  end

  # The files a reloading server reads again as it reloads (RELOADED, and
  # the schema's files).
  def reloaded_files(root: release_paths[:root], schema_dir: release_paths[:schema_dir])
    paths = RELOADED.flat_map { |entry| Dir.glob(File.join(root.to_s, entry, "**", "*")) + [ File.join(root.to_s, entry) ] }
    paths += schema_files(schema_dir)
    paths.select { |path| File.file?(path) }.sort
  end

  # And the folders it watches for a new file or a deleted one.
  def reloaded_directories(root: release_paths[:root])
    RELOADED.map { |entry| File.join(root.to_s, entry) }.select { |path| File.directory?(path) }.to_h { |path| [ path, [] ] }
  end

  # The rest of the release: what the process reads once, as it starts.
  def booted_files(**paths)
    release_files(**paths) - reloaded_files(**paths)
  end

  # The digest of the files' paths (from the repository's root, where cms/
  # and schema/ sit side by side) and bytes.
  def files_digest(files, root: release_paths[:root].join("..").expand_path)
    digest = Digest::SHA256.new
    files.each do |path|
      digest << Pathname(path).expand_path.relative_path_from(root).to_s << "\0" << File.binread(path) << "\0"
    end
    digest.hexdigest
  end

  # The digest of the Ruby that runs the release, of a key derived from the
  # app's secret (a new secret signs library images under new addresses,
  # and a page cached with the old ones would show none of its images; the
  # secret itself never enters the digest), and of the two digests of
  # files: the booted and the reloaded.
  def release_digest(booted:, reloaded:, key:)
    Digest::SHA256.hexdigest([ RUBY_VERSION, key, booted, reloaded ].join("\0"))
  end

  def release_key
    Digest::SHA256.hexdigest(Rails.application.key_generator.generate_key("page-builder-cms/page-cache", 32))
  end

  # These two are only for callers that hold the mutex.
  private_class_method :current, :booted_digest

  # The keys of the blocks of one render: [token CSS revision, digest of
  # the block's subtree]. A digest is taken once per block, from the
  # block without its children and the digests of its children, so a
  # page's digests cost one pass over its document. Equal digests mean
  # equal subtrees, and the partials draw a block from its subtree alone,
  # but for those that draw from the render's content (SiteContent), whose
  # digest holds what they draw from too: a Collection list its
  # collection's key, which every change a visitor could see of it moves
  # (Collection#advance!), the entry it leaves out on that entry's page,
  # and the shop's settings while the shop sells from its collection, by
  # which its prices are drawn; a Field block what it draws of the entry
  # (EntryField.drawing, a price in the shop's currency), so two entries
  # with the same value share it; an Add to cart block what it draws
  # (AddToCart.drawing): the product, and whether it is for sale.
  class BlockKeys
    def initialize(token_css: PageCache.token_css_revision, content: SiteContent::NONE)
      @token_css = token_css
      @content = content
      @digests = {}.compare_by_identity
    end

    def call(block)
      [ @token_css, digest(block) ]
    end

    def digest(block)
      @digests[block] ||= begin
        children = Array(block["children"]).map { |child| child.is_a?(Hash) ? digest(child) : child }
        Digest::SHA256.hexdigest(JSON.generate([ block.except("children"), children, *drawn_from(block) ]))
      end
    end

    private

    def drawn_from(block)
      props = block["props"].is_a?(Hash) ? block["props"] : {}
      case block["type"]
      when "collectionList"
        id = CollectionList.listed_id(props)
        [ id && @content.collection_key(id), CollectionList.left_out(id, @content.entry), *(id && @content.list_shop_key(id)) ]
      when "field" then [ EntryField.drawing(props, @content.entry, @content.shop)&.to_h ]
      when "addToCart" then [ AddToCart.drawing(props, @content.entry, @content.shop)&.to_h ]
      else []
      end
    end
  end
end
