# frozen_string_literal: true

# The example site of the approved design, Slack Water, an invented swimming
# club, as ../example-site/ holds it for every reader (the editor's browser
# demo reads the same files): site.json names the images, the collections,
# the shop's settings and the pages, in order; collections/*.json each hold
# a collection, its definition, its entries and its template; pages/*.json
# are the page documents. A document names an image by its id in
# site.json, and a Collection list its collection by its id there, as the
# shop's settings name the collection they sell from; images/*.png are the
# pictures, which tools/seed-images.ts renders from the design's SVGs.
#
# Images go into the media library the way an upload does: a blob on the
# storage service, then MediaItem.create_from_upload!, which checks the
# bytes as it checks the editor's uploads. Then each collection is made,
# with its template (Collection.create_with_template!), each entry written
# and published, and the template saved and published; then the shop's
# settings (ShopSetting.change!, held to the shop's rules as the editor's
# changes are); then each page. A document's image ids become the public
# ids the library gave those uploads, and its collection ids the ids the
# collections were made with, before it is saved, and Draft.save_document!
# and the collection's checks hold it to the schema as they hold the
# editor's saves.
#
# Running it again changes nothing: an image whose file is already in the
# library is reused, a collection whose prefix is taken is left as it is,
# with its entries and its template, and a page whose address is taken,
# live or in a draft, is left as it is, with whatever its owner has changed
# since. The site's home is set only while it has none, and the shop's
# settings only while they were never changed.
#
# The header and footer are the site's parts (SiteParts): their starters,
# config/parts, are the example site's own, so the seed publishes each part
# as it is, made from its starter if the CMS has not made it yet, and
# leaves alone a part already published.
module ExampleSite
  ROOT = Rails.root.join("..", "example-site").expand_path

  # What a collection's file holds: its definition, as
  # schema/collection.schema.json describes it, its entries, each as the
  # editor saves one, and its template's document.
  COLLECTION_FILE = %w[collection entries template].freeze

  # A file of the example site that is not what this seed reads.
  class Unreadable < StandardError; end

  module_function

  # Returns, collection by collection (by prefix) and page by page (by
  # address, or a part by its kind), whether this run made and published
  # it or found it there, and whether it set the shop's settings, found
  # them changed or could not set them (nil for a site.json with no shop);
  # and prints the same.
  def run(root: ROOT)
    site = read_site(root)
    # Every document read, and every image and collection it names found in
    # site.json, before anything is uploaded or saved.
    images = site["images"].to_h { |image| [ image["id"], image["id"] ] }
    listed = site["collections"].to_h { |entry| [ entry["id"], entry["id"] ] }
    held = site["collections"].map { |entry| read_collection(root, entry["file"], images, listed) }
    prefixes = held.map { |file| file.dig("collection", "prefix") }
    raise Unreadable, "example-site/site.json names two collections at the prefix #{prefixes.find { |p| prefixes.count(p) > 1 }}" if prefixes.uniq.size != prefixes.size

    documents = site["pages"].map { |entry| with_collection_ids(with_library_ids(read_json(root, entry["file"]), images, entry["file"]), listed, entry["file"]) }
    library = site["images"].to_h { |image| [ image["id"], upload(root.join(image["file"]), image["alt"]).public_id ] }
    collections = put_collections(site["collections"], held, library)
    ids = site["collections"].zip(collections).to_h { |entry, (collection, _)| [ entry["id"], collection.id ] }
    shop = site.key?("shop") ? put_shop(site["shop"], ids) : nil
    done = site["pages"].zip(documents).map do |entry, document|
      page, published = put_page(entry["slug"], with_collection_ids(with_library_ids(document, library, entry["file"]), ids, entry["file"]))
      page.make_home! if entry["home"] && Page.home_page.nil?
      [ entry["slug"], published ? :published : :left_as_it_is ]
    end
    done += Page::PARTS.map { |kind| [ kind, put_part(kind) ? :published : :left_as_it_is ] }
    report(done.to_h, collections, shop)
    { collections: collections.to_h { |collection, made| [ collection.prefix, made ? :published : :left_as_it_is ] }, shop: shop&.first, pages: done.to_h }
  end

  # The shop's settings as site.json gives them, the collection they sell
  # from named by the id it was made with (or found with, at its prefix),
  # set only while they were never changed, as the site's home is set only
  # while it has none: [:set], or [:left_as_it_is] for settings someone
  # changed since (off included). A collection found at the prefix that
  # the shop's rules refuse to sell from (another collection's fields) is
  # left unsold: [:not_set, why], the settings as they were. Looked at and
  # set in one transaction, so a change the editor makes meanwhile is
  # never overwritten.
  def put_shop(shop, ids)
    ShopSetting.transaction do
      next [ :left_as_it_is ] unless ShopSetting.current.changed_at.nil?

      ShopSetting.change!(shop.merge("productsCollectionId" => ids.fetch(shop["productsCollectionId"])))
      [ :set ]
    end
  rescue ShopSetting::Invalid => e
    [ :not_set, e.faults.map(&:message).join(" ") ]
  end

  # The part of that kind published, and true; or false for a part already
  # published, left as it is.
  def put_part(kind)
    part = Page.part!(kind)
    return false if part.published?

    part.publish!
    true
  end

  def read_json(root, file)
    path = root.join(file)
    raise Unreadable, "example-site/#{file} is missing" unless path.file?

    JSON.parse(path.read(encoding: "UTF-8"))
  rescue JSON::ParserError => e
    raise Unreadable, "example-site/#{file} is not JSON: #{e.message}"
  end

  # The members of site.json, and the one it may leave out.
  SITE_KEYS = %w[collections images name pages].freeze
  SHOP_KEY = "shop"

  # site.json, held to the shape this seed and the demo both read: an image
  # id as the schema's mediaId, a collection id a whole number from 1, as a
  # Collection list names one, a file under the folder, one home page; and,
  # when it has them, the shop's settings, as the editor's API takes them
  # (ShopSetting#settings), their collection one site.json lists.
  def read_site(root)
    site = read_json(root, "site.json")
    images = site["images"]
    collections = site["collections"]
    pages = site["pages"]
    shop = site[SHOP_KEY]
    problem =
      if (site.keys - [ SHOP_KEY ]).sort != SITE_KEYS then "has the keys #{site.keys.sort.inspect}, not collections, images, name and pages, and shop if it sells"
      elsif !images.is_a?(Array) || images.empty? || !pages.is_a?(Array) || pages.empty? then "lists no images or no pages"
      elsif site.key?(SHOP_KEY) && !(shop.is_a?(Hash) && shop.keys.sort == ShopRules::MEMBERS.sort && collections.is_a?(Array) && collections.any? { |c| c.is_a?(Hash) && c["id"] == shop["productsCollectionId"] })
        "has shop settings it cannot read: #{shop.inspect}"
      elsif !collections.is_a?(Array) then "lists its collections as no list"
      elsif (bad = images.find { |i| !i.is_a?(Hash) || i.keys.sort != %w[alt file id] || !i["id"].to_s.match?(/\A[A-Za-z0-9_-]{1,64}\z/) || !inside?(root, i["file"]) })
        "has an image it cannot read: #{bad.inspect}"
      elsif (bad = collections.find { |c| !c.is_a?(Hash) || c.keys.sort != %w[file id] || !c["id"].is_a?(Integer) || c["id"] < 1 || !inside?(root, c["file"]) })
        "has a collection it cannot read: #{bad.inspect}"
      elsif (bad = pages.find { |p| !p.is_a?(Hash) || p.keys.sort != %w[file home slug] || ![ true, false ].include?(p["home"]) || !inside?(root, p["file"]) })
        "has a page it cannot read: #{bad.inspect}"
      elsif images.map { |i| i["id"] }.uniq.size != images.size then "names an image id twice"
      elsif collections.map { |c| c["id"] }.uniq.size != collections.size then "names a collection id twice"
      elsif pages.map { |p| p["slug"] }.uniq.size != pages.size then "names a slug twice"
      elsif pages.count { |p| p["home"] } != 1 then "marks #{pages.count { |p| p['home'] }} pages as home, not one"
      end
    raise Unreadable, "example-site/site.json #{problem}" if problem

    site
  end

  # A collection's file, held to its shape, every image and collection its
  # entries and its template name found in site.json.
  def read_collection(root, file, images, collections)
    held = read_json(root, file)
    keys = held.is_a?(Hash) ? held.keys.sort : []
    raise Unreadable, "example-site/#{file} has the keys #{keys.inspect}, not collection, entries and template" if keys != COLLECTION_FILE
    raise Unreadable, "example-site/#{file} lists its entries as no list" unless held["entries"].is_a?(Array)

    with_library_ids(held["entries"], images, file)
    with_collection_ids(with_library_ids(held["template"], images, file), collections, file)
    held
  end

  def inside?(root, file)
    file.is_a?(String) && !file.start_with?("/") && !file.split("/").include?("..") && root.join(file).file?
  end

  # The document with each image id replaced as ids says (an id of
  # site.json to the public id of that image in the library); an id it does
  # not hold is refused.
  def with_library_ids(node, ids, file)
    case node
    when Hash
      node.to_h do |key, value|
        next [ key, with_library_ids(value, ids, file) ] unless key == "mediaId"

        [ key, ids.fetch(value) { raise Unreadable, "example-site/#{file} names the image #{value.inspect}, which site.json does not list" } ]
      end
    when Array then node.map { |value| with_library_ids(value, ids, file) }
    else node
    end
  end

  # The document with the collection each Collection list names replaced
  # as ids says (an id of site.json to the id the collection was made
  # with); an id it does not hold is refused.
  def with_collection_ids(node, ids, file)
    case node
    when Hash
      copy = node.transform_values { |value| with_collection_ids(value, ids, file) }
      return copy unless copy["type"] == "collectionList" && copy["props"].is_a?(Hash) && copy["props"].key?("collection")

      named = copy["props"]["collection"]
      copy.merge("props" => copy["props"].merge("collection" => ids.fetch(named) { raise Unreadable, "example-site/#{file} names the collection #{named.inspect}, which site.json does not list" }))
    when Array then node.map { |value| with_collection_ids(value, ids, file) }
    else node
    end
  end

  # The library item for a seed image: found by its file name and size if
  # an earlier run uploaded it, otherwise uploaded now.
  def upload(path, alt)
    bytes = path.binread
    existing = MediaItem.joins(file_attachment: :blob)
                        .find_by(active_storage_blobs: { filename: path.basename.to_s, byte_size: bytes.bytesize })
    return existing if existing

    width, height = bytes.byteslice(16, 8).unpack("NN")
    blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new(bytes), filename: path.basename.to_s, content_type: "image/png", identify: false)
    MediaItem.create_from_upload!(signed_blob_id: blob.signed_id, width: width, height: height, alt: alt)
  end

  # Each collection at its prefix, made with its template and its entries,
  # each written and published in its file's order; then each template
  # saved and published, its lists naming the collections by the ids they
  # were made with; and true. Or the collection already at that prefix, as
  # it is, and false. All or nothing: no collection is left half made.
  def put_collections(listed, held, library)
    Collection.transaction do
      made = listed.zip(held).map do |entry, file|
        taken = Collection.find_by(prefix: file.dig("collection", "prefix"))
        next [ taken, false ] if taken

        collection = Collection.create_with_template!(file["collection"])
        file["entries"].each { |one| Entry.create_checked!(collection, with_library_ids(one, library, entry["file"])).publish! }
        [ collection, true ]
      end
      ids = listed.zip(made).to_h { |entry, (collection, _)| [ entry["id"], collection.id ] }
      listed.zip(held, made).each do |entry, file, (collection, fresh)|
        next unless fresh

        template = collection.template
        document = with_collection_ids(with_library_ids(file["template"], library, entry["file"]), ids, entry["file"])
        Draft.save_document!(page_id: template.id, revision: template.draft.revision, document: document, save_id: "seed-#{collection.prefix}-template")
        template.publish!
      end
      made.map { |collection, fresh| [ collection.reload, fresh ] }
    end
  end

  # The page at slug, made with this document as its draft and published,
  # and true; or the page already at that address, live or in a draft, as
  # it is, and false. All or nothing: a page is never left half made.
  def put_page(slug, document)
    taken = Page.find_by(slug: slug) || Draft.find_by(slug: slug)&.page
    return [ taken, false ] if taken

    Page.transaction do
      page = Page.create_with_draft!(title: document["title"], slug: slug)
      Draft.save_document!(page_id: page.id, revision: page.draft.revision, document: document, save_id: "seed-#{slug}")
      page.publish!
      [ page.reload, true ]
    end
  end

  def report(done, collections, shop)
    Page.includes(:draft, :published_version).where(kind: [ "page", *Page::PARTS ]).order(:id).each do |page|
      said = done[page.part? ? page.kind : page.draft.slug] == :left_as_it_is ? ", already there, left as it is" : ""
      version = page.published_version ? "version #{page.published_version.number}" : "not published"
      where = page.part? ? "every page" : page.live_path || "/#{page.draft.slug}"
      puts format("  %-28s %-16s %s%s%s", page.draft.document["title"], where, version, page.home? ? ", home" : "", said)
    end
    collections.each do |collection, made|
      template = collection.template.published_version
      live = collection.entries.where.not(published_at: nil).count
      what = "#{live} of #{collection.entries.count} entries published, its template #{template ? "version #{template.number}" : 'not published'}"
      puts format("  %-28s %-16s %s%s", collection.name, "/#{collection.prefix}/<slug>", what, made ? "" : ", already there, left as it is")
    end
    report_shop(*shop) if shop
    puts "  #{MediaItem.count} images in the media library"
  end

  # The shop's settings as they are now, and what this run did to them.
  def report_shop(done, why = nil)
    settings = ShopSetting.current
    selling = settings.open? ? Collection.find_by(id: settings.products_collection_id) : nil
    what = selling ? "on, in #{settings.currency}, selling #{selling.name} by its #{settings.price_field}" : "off"
    said = { set: "", left_as_it_is: ", already set, left as they are", not_set: ", not set: #{why}" }.fetch(done)
    puts format("  %-28s %-16s %s%s", "The shop", "/cart", what, said)
  end
end
