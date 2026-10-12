# frozen_string_literal: true

# The example site of the approved design, Slack Water, an invented swimming
# club, as ../example-site/ holds it for every reader (the editor's browser
# demo reads the same files): site.json names the images and the pages, in
# order; pages/*.json are the page documents, each naming an image by its
# id in site.json; images/*.png are the pictures, which tools/seed-images.ts
# renders from the design's SVGs.
#
# Images go into the media library the way an upload does: a blob on the
# storage service, then MediaItem.create_from_upload!, which checks the
# bytes as it checks the editor's uploads. A document's image ids become the
# public ids the library gave those uploads before the page is saved, and
# Draft.save_document! holds it to the schema as it holds the editor's
# saves.
#
# Running it again changes nothing: an image whose file is already in the
# library is reused, and a page whose address is taken, live or in a draft,
# is left as it is, with whatever its owner has changed since. The site's
# home is set only while it has none.
#
# The header and footer are the site's parts (SiteParts): their starters,
# config/parts, are the example site's own, so the seed publishes each part
# as it is, made from its starter if the CMS has not made it yet, and
# leaves alone a part already published.
module ExampleSite
  ROOT = Rails.root.join("..", "example-site").expand_path

  # A file of the example site that is not what this seed reads.
  class Unreadable < StandardError; end

  module_function

  # Returns, page by page, whether this run published it or found its
  # address taken, and prints the same.
  def run(root: ROOT)
    site = read_site(root)
    # Every document read, and every image it names found in site.json,
    # before anything is uploaded or saved.
    listed = site["images"].to_h { |image| [ image["id"], image["id"] ] }
    documents = site["pages"].map { |entry| with_library_ids(read_json(root, entry["file"]), listed, entry["file"]) }
    library = site["images"].to_h { |image| [ image["id"], upload(root.join(image["file"]), image["alt"]).public_id ] }
    done = site["pages"].zip(documents).map do |entry, document|
      page, published = put_page(entry["slug"], with_library_ids(document, library, entry["file"]))
      page.make_home! if entry["home"] && Page.home_page.nil?
      [ entry["slug"], published ? :published : :left_as_it_is ]
    end
    done += Page::PARTS.map { |kind| [ kind, put_part(kind) ? :published : :left_as_it_is ] }
    report(done.to_h)
    done.to_h
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

  # site.json, held to the shape this seed and the demo both read: an image
  # id as the schema's mediaId, a file under the folder, one home page.
  def read_site(root)
    site = read_json(root, "site.json")
    images = site["images"]
    pages = site["pages"]
    problem =
      if site.keys.sort != %w[images name pages] then "has the keys #{site.keys.sort.inspect}, not images, name and pages"
      elsif !images.is_a?(Array) || images.empty? || !pages.is_a?(Array) || pages.empty? then "lists no images or no pages"
      elsif (bad = images.find { |i| !i.is_a?(Hash) || i.keys.sort != %w[alt file id] || !i["id"].to_s.match?(/\A[A-Za-z0-9_-]{1,64}\z/) || !inside?(root, i["file"]) })
        "has an image it cannot read: #{bad.inspect}"
      elsif (bad = pages.find { |p| !p.is_a?(Hash) || p.keys.sort != %w[file home slug] || ![ true, false ].include?(p["home"]) || !inside?(root, p["file"]) })
        "has a page it cannot read: #{bad.inspect}"
      elsif images.map { |i| i["id"] }.uniq.size != images.size then "names an image id twice"
      elsif pages.map { |p| p["slug"] }.uniq.size != pages.size then "names a slug twice"
      elsif pages.count { |p| p["home"] } != 1 then "marks #{pages.count { |p| p['home'] }} pages as home, not one"
      end
    raise Unreadable, "example-site/site.json #{problem}" if problem

    site
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

  def report(done)
    Page.includes(:draft, :published_version).order(:id).each do |page|
      said = done[page.part? ? page.kind : page.draft.slug] == :left_as_it_is ? ", already there, left as it is" : ""
      version = page.published_version ? "version #{page.published_version.number}" : "not published"
      where = page.part? ? "every page" : page.live_path || "/#{page.draft.slug}"
      puts format("  %-28s %-16s %s%s%s", page.draft.document["title"], where, version, page.home? ? ", home" : "", said)
    end
    puts "  #{MediaItem.count} images in the media library"
  end
end
