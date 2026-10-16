# frozen_string_literal: true

# The shop's rules: its settings, a price in the smallest unit of its
# currency and an amount in the site's words, a visitor's cart as it is
# kept and changed, and a cart priced from what its products published.
#
# Written twice: here, for the CMS, and in TypeScript for the editor, the
# browser's storage and the demo (builder/src/shared/shop.ts), rule for
# rule, pointer for pointer and word for word. Both read the same cases,
# contract/shop/cases.json, in their tests (test/models/shop_rules_test.rb
# and the editor's shop.test.ts), so neither changes alone.
#
# Plain Ruby: what it reads of a collection or a product is handed in.
module ShopRules
  # The currencies a shop sells in, a closed list, and the sign each amount
  # is written with.
  CURRENCIES = %w[GBP EUR USD].freeze
  CURRENCY_SIGNS = { "GBP" => "£", "EUR" => "€", "USD" => "$" }.freeze

  # A line of a cart holds one product, 1 to MOST_QUANTITY of it; a cart
  # holds MOST_LINES lines at most.
  MOST_QUANTITY = 20
  MOST_LINES = 20

  # The toggle field that says whether a product is in stock: a collection
  # that has one sells only the products it is on for.
  IN_STOCK_KEY = "in-stock"

  MEMBERS = %w[enabled currency productsCollectionId priceField].freeze

  # Off, in pounds, with no collection, until the settings first change.
  DEFAULTS = { "enabled" => false, "currency" => "GBP", "productsCollectionId" => nil, "priceField" => nil }.freeze

  # The largest integer both languages read exactly, 2^53 - 1.
  MAX_ID = 9_007_199_254_740_991

  # The highest a number field keeps (CollectionDocument::Rules).
  NUMBER_LIMIT = 1_000_000_000

  # for sale; out of stock (the collection's in-stock toggle is not on for
  # it); no price (none, or none a price can be: minor_units); gone (no
  # published entry of the products collection has its id any more).
  PRODUCT_STATES = %w[forSale outOfStock noPrice gone].freeze

  # The words of the rules, as the TypeScript twin writes them; the
  # request's own are the API's (Api::BodyCheck).
  WORDS = {
    object: "must be a JSON object",
    member: "is not a member this request takes",
    required: "is required",
    boolean: "must be true or false",
    currency: "must be one of #{CURRENCIES.join(', ')}",
    collection_id: "must be a collection's id, or null",
    no_collection: "Choose the products collection first.",
    price_text: "must be a field's key, or null",
    when_on: "is required for a shop that is on",
    entry: "That product could not be read.",
    lines: "The cart holds #{MOST_LINES} different products at most."
  }.freeze

  # A collection as the rules read it: its id, its name for their words,
  # and its fields, each a Hash with "key" and "type".
  Collection = Data.define(:id, :name, :fields)

  Fault = Data.define(:pointer, :keyword, :message)

  # What the check answers: the settings as they are kept, or the faults.
  Check = Data.define(:settings, :faults) do
    def ok? = faults.empty?
  end

  # A line of a visitor's cart: a product, by its entry's id, and how many.
  # No price: every price is read from what the product published.
  Line = Data.define(:entry_id, :quantity)

  # A cart's change: the lines it leaves, or its fault.
  Change = Data.define(:lines, :fault) do
    def ok? = fault.nil?
  end

  # A product as the cart reads it: a published entry of the products
  # collection, its title and values as it went live.
  Product = Data.define(:id, :title, :values)

  # A line of the cart as its page shows it, and a cart priced.
  PricedLine = Data.define(:entry_id, :quantity, :state, :title, :unit_amount, :amount)
  Priced = Data.define(:lines, :total, :order_lines)

  module_function

  def collection_id_words(id) = "The site has no collection #{id}."
  def number_field_words(name) = "The collection #{name} has no number field to be the price."
  def price_field_words(name, key) = "The collection #{name} has no number field \"#{key}\"."
  def quantity_words(least) = "The quantity is a whole number from #{least} to #{MOST_QUANTITY}."

  # A positive integer both languages read exactly, an integral float among
  # them (JSON's 1.0 is a Float here, 1 in JavaScript); nil for anything
  # else.
  def id(value)
    whole = whole_number(value)
    whole if whole&.between?(1, MAX_ID)
  end

  def whole_number(value)
    return value if value.is_a?(Integer)

    value.to_i if value.is_a?(Float) && value.finite? && value == value.floor
  end

  def number_field?(collection, key = nil)
    collection.fields.any? { |field| field.is_a?(Hash) && field["type"] == "number" && (key.nil? || field["key"] == key) }
  end

  # The settings' faults, every one at once, each at its member, in the
  # members' order after any member they do not take: on or off, a
  # boolean; a currency of the list; the products collection, null or the
  # id of a collection the site has (collection_of: id -> Collection or
  # nil) with a number field; the price, null or the key of a number field
  # of that collection; and, for a shop that is on, both. A price is not
  # looked for in a collection that is itself at fault. With none, the
  # settings as they are kept.
  def check(settings, collection_of)
    return Check.new(settings: nil, faults: [ Fault.new(pointer: "", keyword: "type", message: WORDS[:object]) ]) unless settings.is_a?(Hash)

    faults = []
    fault = ->(pointer, keyword, message) { faults << Fault.new(pointer: pointer, keyword: keyword, message: message) }
    settings.each_key { |name| fault.("/#{escape(name)}", "additionalProperties", WORDS[:member]) unless MEMBERS.include?(name) }

    enabled = settings["enabled"]
    if !settings.key?("enabled") then fault.("/enabled", "required", WORDS[:required])
    elsif ![ true, false ].include?(enabled) then fault.("/enabled", "type", WORDS[:boolean])
    end

    fault.("/currency", "required", WORDS[:required]) unless settings.key?("currency")
    fault.("/currency", "enum", WORDS[:currency]) if settings.key?("currency") && !CURRENCIES.include?(settings["currency"])

    # The collection, when the member names one the site has with a number
    # field: the one a price is looked for in.
    collection_id = settings["productsCollectionId"]
    products = nil
    if !settings.key?("productsCollectionId")
      fault.("/productsCollectionId", "required", WORDS[:required])
    elsif !collection_id.nil?
      wanted = id(collection_id)
      found = wanted && collection_of.call(wanted)
      if wanted.nil? then fault.("/productsCollectionId", "type", WORDS[:collection_id])
      elsif found.nil? then fault.("/productsCollectionId", "collectionExists", collection_id_words(wanted))
      elsif !number_field?(found) then fault.("/productsCollectionId", "numberField", number_field_words(found.name))
      else products = found
      end
    end

    price_field = settings["priceField"]
    if !settings.key?("priceField")
      fault.("/priceField", "required", WORDS[:required])
    elsif !price_field.nil? && !price_field.is_a?(String)
      fault.("/priceField", "type", WORDS[:price_text])
    elsif price_field.is_a?(String)
      if collection_id.nil?
        fault.("/priceField", "priceField", WORDS[:no_collection])
      elsif products && !number_field?(products, price_field)
        fault.("/priceField", "priceField", price_field_words(products.name, price_field))
      end
    end

    if enabled == true
      fault.("/productsCollectionId", "required", WORDS[:when_on]) if settings.key?("productsCollectionId") && collection_id.nil?
      fault.("/priceField", "required", WORDS[:when_on]) if settings.key?("priceField") && price_field.nil?
    end

    return Check.new(settings: nil, faults: faults) unless faults.empty?

    Check.new(settings: { "enabled" => enabled, "currency" => settings["currency"], "productsCollectionId" => collection_id.nil? ? nil : id(collection_id), "priceField" => price_field }, faults: [])
  end

  # A price as a number field keeps it, in the currency's main unit with
  # two decimals at most, as a count of the currency's smallest unit
  # (pence, cents): its hundredths, which a hundred times it rounds to
  # exactly, so 1.15 is 115 though a hundred times it is
  # 114.99999999999999 as a float. nil for no price: no number, a number no
  # number field keeps (beyond a billion, a third decimal), or one below
  # zero.
  def minor_units(value)
    return nil unless (value.is_a?(Integer) || (value.is_a?(Float) && value.finite?)) && value.between?(0, NUMBER_LIMIT)
    return nil unless BlockDocument::Rules.two_decimals?(value)

    (value * 100).round
  end

  # An amount of the smallest unit as the site writes it: the currency's
  # sign, the main unit with a comma between thousands, and its two
  # decimals, "£1,250.50"; a minus before the sign below zero.
  def money_words(minor, currency)
    whole, part = minor.abs.divmod(100)
    "#{'-' if minor.negative?}#{CURRENCY_SIGNS.fetch(currency)}#{whole.to_s.reverse.scan(/[0-9]{1,3}/).join(',').reverse}.#{format('%02d', part)}"
  end

  # A cart read back from where it was kept: a line that is no pair of a
  # product's id and a quantity from 1 to MOST_QUANTITY is left out, a
  # product's second line too, and the lines past MOST_LINES; anything
  # else is an empty cart.
  def read_cart(kept)
    return [] unless kept.is_a?(Array)

    kept.each_with_object([]) do |line, lines|
      break lines if lines.size == MOST_LINES
      next unless line.is_a?(Array) && line.size == 2

      entry_id = id(line[0])
      quantity = quantity_of(line[1], 1)
      next if entry_id.nil? || quantity.nil? || lines.any? { |other| other.entry_id == entry_id }

      lines << Line.new(entry_id: entry_id, quantity: quantity)
    end
  end

  # A cart as it is kept: its lines as [entry id, quantity], in the order
  # they were put in.
  def kept_cart(lines)
    lines.map { |line| [ line.entry_id, line.quantity ] }
  end

  def quantity_of(value, least)
    whole = whole_number(value)
    whole if whole&.between?(least, MOST_QUANTITY)
  end

  # A product put in the cart: quantity more of it, its line's quantity at
  # most MOST_QUANTITY, or a new line after the others while the cart has
  # room for one. Whether the product is for sale is the caller's to say
  # (product_state).
  def add(lines, entry_id, quantity)
    change(lines, entry_id, quantity, 1) { |held, asked| [ MOST_QUANTITY, held + asked ].min }
  end

  # A line's quantity set: 0 takes the line out, a product not in the cart
  # is put in after the others, while it has room.
  def set(lines, entry_id, quantity)
    change(lines, entry_id, quantity, 0) { |_held, asked| asked }
  end

  # The cart once an order made from it is paid: each product the order
  # took loses the quantity it took, its line gone at none; a product put
  # in since, or more of one, stays, in the order the lines were put in.
  # ordered: the order's lines, each a Hash with entryId and quantity.
  def after_order(lines, ordered)
    lines.filter_map do |line|
      taken = ordered.select { |one| one["entryId"] == line.entry_id }.sum { |one| one["quantity"] }
      Line.new(entry_id: line.entry_id, quantity: line.quantity - taken) if line.quantity > taken
    end
  end

  def change(lines, entry_id, quantity, least)
    product = id(entry_id)
    return Change.new(lines: nil, fault: Fault.new(pointer: "/entry", keyword: "entry", message: WORDS[:entry])) if product.nil?

    asked = quantity_of(quantity, least)
    return Change.new(lines: nil, fault: Fault.new(pointer: "/quantity", keyword: "quantity", message: quantity_words(least))) if asked.nil?

    line = lines.find { |one| one.entry_id == product }
    if line
      held = yield(line.quantity, asked)
      return Change.new(lines: held.zero? ? lines.reject { |one| one.equal?(line) } : lines.map { |one| one.equal?(line) ? Line.new(entry_id: product, quantity: held) : one }, fault: nil)
    end

    held = yield(0, asked)
    return Change.new(lines: lines.dup, fault: nil) if held.zero?
    return Change.new(lines: nil, fault: Fault.new(pointer: "", keyword: "lines", message: WORDS[:lines])) if lines.size >= MOST_LINES

    Change.new(lines: lines + [ Line.new(entry_id: product, quantity: held) ], fault: nil)
  end

  # A product's price in the smallest unit, read by the price field only
  # while it is a number field of the collection; nil for none.
  def price_of(product, fields, price_field)
    return nil unless fields.any? { |field| field.is_a?(Hash) && field["key"] == price_field && field["type"] == "number" }

    minor_units(product.values.is_a?(Hash) ? product.values[price_field] : nil)
  end

  # Whether a product can be put in the cart and ordered, and if not, why.
  def product_state(product, fields, price_field)
    return "gone" if product.nil?
    return "noPrice" if price_of(product, fields, price_field).nil?

    stocked = fields.any? { |field| field.is_a?(Hash) && field["key"] == IN_STOCK_KEY && field["type"] == "toggle" }
    return "outOfStock" if stocked && product.values[IN_STOCK_KEY] != true

    "forSale"
  end

  # The cart, priced from what each product published (product_of: the
  # published entry of the products collection with that id, or nil), never
  # from what the cart holds, which is ids and quantities alone. Counted in
  # the smallest unit, as integers. Each order line is a Hash as an order
  # keeps it: entryId, title, unitAmount, quantity.
  def price_cart(lines, product_of, fields, price_field)
    priced = lines.map do |line|
      product = product_of.call(line.entry_id)
      state = product_state(product, fields, price_field)
      unit = product && price_of(product, fields, price_field)
      PricedLine.new(entry_id: line.entry_id, quantity: line.quantity, state: state, title: product&.title, unit_amount: unit, amount: state == "forSale" ? unit * line.quantity : nil)
    end
    order_lines = priced.select { |line| line.state == "forSale" }.map do |line|
      { "entryId" => line.entry_id, "title" => line.title, "unitAmount" => line.unit_amount, "quantity" => line.quantity }
    end
    Priced.new(lines: priced, total: order_lines.sum { |line| line["unitAmount"] * line["quantity"] }, order_lines: order_lines)
  end

  # A member's name as a JSON pointer writes it.
  def escape(name)
    name.to_s.gsub("~", "~0").gsub("/", "~1")
  end
end
