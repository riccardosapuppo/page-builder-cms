# frozen_string_literal: true

# What a Collection list draws, read from its props and its collection:
# which entries (the published ones the content gives, those its filter
# keeps, in its order, as many as it shows) and each one's card. The twin
# of builder/src/widgets/collectionList/cards.ts, held to it by the render
# contract; blocks/_collectionList.html.erb draws the cards.
#
# A collection is a Hash as SiteContent gives it (and the contract's
# fixtures): its "id", "prefix", "fields" and "entries", each entry its
# "id", "title", "slug", "values" and "publishedAt", as it went live.
#
# A list reads its collection's fields by their keys, never trusting a key
# to hold what it held when the list was made: a field renamed, deleted or
# given another type since is no field of the kind the list wants, and
# draws nothing; a filter by it keeps no entry, rather than let every entry
# through a list meant to show a few.
module CollectionList
  # What a new list holds, and what a value the schema does not list is
  # read as.
  DEFAULTS = { count: 3, layout: "grid", columns: 3 }.freeze
  MOST_ENTRIES = 24
  LAYOUTS = %w[list grid compact].freeze
  COLUMNS = [ 2, 3, 4 ].freeze
  # The largest id the editor's renderer reads as one (JavaScript's safe
  # integers): a larger one names no collection on either side.
  LARGEST_ID = (2**53) - 1

  # One card: where it links (nil for an address RenderPolicy refuses), its
  # title, and what its fields give it, each nil when the list names no
  # such field or the entry has no such value: an image (as an image
  # block's own props, its alt text or decorative), a day, an excerpt, and
  # a number in words, a price in the shop's currency when it is the price
  # of the collection the shop sells from (ShopWords).
  Card = Data.define(:id, :href, :title, :image, :day, :excerpt, :price)

  module_function

  def layout(props)
    LAYOUTS.include?(props["layout"]) ? props["layout"] : DEFAULTS[:layout]
  end

  def columns(props)
    props["columns"].is_a?(Integer) && COLUMNS.include?(props["columns"]) ? props["columns"] : DEFAULTS[:columns]
  end

  def count(props)
    props["count"].is_a?(Integer) && props["count"].between?(1, MOST_ENTRIES) ? props["count"] : DEFAULTS[:count]
  end

  # The collection a list names, by its id; nil for none.
  def listed_id(props)
    props["collection"].is_a?(Integer) && props["collection"].between?(1, LARGEST_ID) ? props["collection"] : nil
  end

  # The ids of the collections a document's lists name, in the order they
  # come: what a page's cache keys hold (PageCache) and SiteContent reads.
  def ids(document)
    found = []
    walk = lambda do |blocks|
      Array(blocks).each do |block|
        next unless block.is_a?(Hash)

        if block["type"] == "collectionList" && block["props"].is_a?(Hash) && (id = listed_id(block["props"]))
          found << id
        end
        walk.call(block["children"]) if block["children"].is_a?(Array)
      end
    end
    walk.call(document.is_a?(Hash) ? document["sections"] : nil)
    found.uniq
  end

  # The id of the entry a page is drawn with (SiteContent.entry), when it
  # is one of the collection's: the one entry its lists leave out. None for
  # made-up values, an entry of another collection, and a page with no
  # entry.
  def left_out(collection_id, entry)
    return nil unless entry.is_a?(Hash) && entry["id"].is_a?(Integer) && entry["id"].between?(1, LARGEST_ID)

    entry["id"] if collection_id.is_a?(Integer) && entry["collectionId"] == collection_id
  end

  # The entries the list shows, in its order: none without a collection,
  # and never the entry the page is drawn with (leave).
  def entries(props, collection, leave = nil)
    return [] unless collection.is_a?(Hash)

    listed = (collection["entries"].is_a?(Array) ? collection["entries"] : []).select { |entry| listed?(entry) && entry["id"] != leave }
    kept = listed.select { |entry| keeps?(props, collection, entry) }
    by, descending = order(props)
    field = %w[publishedAt title].include?(by) ? nil : EntryWords.field_of(collection["fields"], by)
    EntryOrder.ordered(kept, descending: descending, id: ->(entry) { entry["id"] }) { |entry| sort_value(entry, by, field) }.first(count(props))
  end

  # The cards of the list, linking each to its entry's address; on an
  # entry's page (shown, the entry it is drawn with), all but that entry; a
  # price in the shop's currency while the shop sells from the collection.
  def cards(props, collection, shown = nil, shop = nil)
    return [] unless collection.is_a?(Hash)

    compact = layout(props) == "compact"
    image = compact ? nil : of_type(collection, props["image"], %w[image])
    date = of_type(collection, props["date"], %w[date])
    excerpt = compact ? nil : of_type(collection, props["excerpt"], %w[text paragraph])
    price = of_type(collection, props["price"], %w[number])
    entries(props, collection, left_out(collection["id"], shown)).map do |entry|
      words = excerpt && EntryWords.value_of(entry["values"], excerpt.key)
      Card.new(
        id: entry["id"],
        href: RenderPolicy.link_href(path(collection, entry)),
        title: entry["title"],
        image: image && image_item(EntryWords.value_of(entry["values"], image.key)),
        day: date && EntryWords.day_of(EntryWords.value_of(entry["values"], date.key)),
        excerpt: words.is_a?(String) && !words.empty? ? words : nil,
        price: price && ShopWords.number_or_price(EntryWords.value_of(entry["values"], price.key), price.key, collection["id"], shop)
      )
    end
  end

  # An entry's address on the site: /<prefix>/<slug>.
  def path(collection, entry)
    "/#{collection['prefix'].is_a?(String) ? collection['prefix'] : ''}/#{entry['slug']}"
  end

  # An entry a list can draw: one with its id, its title, its slug and when
  # it went live. SiteContent gives no other kind.
  def listed?(entry)
    entry.is_a?(Hash) && entry["id"].is_a?(Integer) && entry["title"].is_a?(String) && entry["slug"].is_a?(String) && entry["publishedAt"].is_a?(String)
  end

  # Whether the list's filter keeps an entry: every entry without one;
  # with one, those whose toggle is on or off as it says (a toggle with no
  # value is off, as the entry's form holds it), or whose choice is its
  # option. Any other filter, or one by a field of another type, keeps
  # none.
  def keeps?(props, collection, entry)
    return true unless props.key?("filter")

    filter = props["filter"]
    return false unless filter.is_a?(Hash)

    field = EntryWords.field_of(collection["fields"], filter["field"])
    wanted = filter["value"]
    value = field && EntryWords.value_of(entry["values"], field.key)
    if field&.type == "toggle" && [ true, false ].include?(wanted)
      (value == true) == wanted
    elsif field&.type == "choice" && wanted.is_a?(String)
      value.is_a?(String) && value == wanted
    else
      false
    end
  end

  # The list's order: what it follows, when it went live unless it says,
  # and whether it goes down, unless it says up.
  def order(props)
    order = props["order"].is_a?(Hash) ? props["order"] : {}
    [ order["by"].is_a?(String) ? order["by"] : "publishedAt", order["direction"] != "asc" ]
  end

  # The value the list orders an entry by: when it went live, its title,
  # or its value of a date field (its text) or of a number field; none for
  # a key no such field has.
  def sort_value(entry, by, field)
    case by
    when "publishedAt" then entry["publishedAt"]
    when "title" then entry["title"]
    else
      found = field && EntryWords.value_of(entry["values"], field.key)
      found if (field&.type == "date" && found.is_a?(String)) || (field&.type == "number" && found.is_a?(Numeric))
    end
  end

  def of_type(collection, key, types)
    field = EntryWords.field_of(collection["fields"], key)
    field if field && types.include?(field.type)
  end

  # A library image of an entry, as an image block's props hold one: an
  # image from another site is no entry's.
  def image_item(value)
    return nil unless value.is_a?(Hash) && value["mediaId"].is_a?(String)

    value["decorative"] == true ? { "mediaId" => value["mediaId"], "decorative" => true } : { "mediaId" => value["mediaId"], "alt" => value["alt"].is_a?(String) ? value["alt"] : "" }
  end
end
