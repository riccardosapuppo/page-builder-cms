# frozen_string_literal: true

# What the blocks of a page read besides its document: the collections its
# Collection lists name, each with its published entries, and the entry a
# collection's template is drawn with, whose values its Field blocks draw.
# The partials are handed it as `content` (BlocksHelper#render_blocks),
# the twin of the editor's ctx.collections and ctx.entry
# (builder/src/render/context.ts); the contract's goldens are drawn with a
# fixture's instead (ContractContent, in the tests).
#
# A collection is read the first time a list asks for it, in two queries,
# never on a page whose lists are all read from the cache. Its key, what a
# cached page and a cached list are named by (PageCache), is read for all
# the collections the page names in one query: the collection's id, the
# count of changes a visitor could see of it (Collection#published_revision)
# and the moment of the last (revised_at), so a database made anew or a
# backup restored never names a list the way another one did.
class SiteContent
  attr_reader :entry

  # ids: the collections the page's lists name (Page#listed_collections,
  # or CollectionList.ids of a draft); entry: the entry drawn, as
  # SiteContent.entry makes it, or nil. reads: false for content that
  # holds nothing, and asks the database nothing (NONE).
  def initialize(ids: [], entry: nil, reads: true, read: {})
    @ids = ids.select { |id| id.is_a?(Integer) }.uniq.sort
    @entry = entry
    @reads = reads
    @collections = read
  end

  # A collection as CollectionList reads it, or nil for one the database
  # does not have.
  def collection(id)
    return nil unless @reads && id.is_a?(Integer)

    @collections.fetch(id) { @collections[id] = self.class.collection(id) }
  end

  # The keys of the collections the page names, in the order of their ids,
  # one each: [id, nil] for one that is not there.
  def keys
    @keys ||= begin
      rows = @ids.empty? || !@reads ? {} : Collection.where(id: @ids).pluck(:id, :published_revision, :revised_at).to_h { |id, revision, at| [ id, [ id, revision, PageCache.moment(at) ] ] }
      @ids.map { |id| rows[id] || [ id, nil ] }
    end
  end

  # One collection's key, among those the page names.
  def collection_key(id)
    keys.find { |key| key.first == id } || [ id, nil ]
  end

  # The same lists, drawn without an entry: the site's header and footer
  # around an entry's page, which hold no Field block. The collections read
  # by one are read for the other.
  def without_entry
    return self if entry.nil?

    @without_entry ||= self.class.new(ids: @ids, reads: @reads, read: @collections).tap { |copy| copy.instance_variable_set(:@keys, keys) }
  end

  # A collection and its published entries, as they went live: the twin of
  # what the editor's canvas hands its lists (builder/src/editor/
  # collections/content.ts).
  def self.collection(id)
    found = Collection.find_by(id: id) or return nil
    entries = found.entries.where.not(published_at: nil).order(:id)
      .pluck(:id, :published_title, :published_slug, :published_field_values, :published_at)
    {
      "id" => found.id,
      "prefix" => found.prefix,
      "fields" => found.fields,
      "entries" => entries.map do |entry_id, title, slug, values, at|
        { "id" => entry_id, "title" => title, "slug" => slug, "values" => values, "publishedAt" => at.utc.iso8601(3) }
      end
    }
  end

  # An entry as its template's Field blocks read it: its collection's
  # fields, and its title, slug and values, those it went live with
  # (published) or its draft's; and its id and its collection's, by which
  # a list of that collection on its page leaves it out (CollectionList).
  def self.entry(entry, published: true)
    drawn = published ? { "title" => entry.published_title, "slug" => entry.published_slug, "values" => entry.published_field_values } : { "title" => entry.title, "slug" => entry.slug, "values" => entry.field_values }
    { "id" => entry.id, "collectionId" => entry.collection_id, "fields" => entry.collection.fields, **drawn }
  end

  # What a page with no list and no entry is drawn with: the 404 page, a
  # form's answer. It reads nothing.
  NONE = new(reads: false)
end
