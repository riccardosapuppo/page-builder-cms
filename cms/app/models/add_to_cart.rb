# frozen_string_literal: true

# What an Add to cart block draws, read from its props, the entry its
# template is drawn with and the shop: the twin of builder/src/widgets/
# addToCart/drawing.ts, held to it by the render contract;
# blocks/_addToCart.html.erb draws it.
#
# It draws for a product, an entry of the collection the shop sells from
# while the shop is on (ShopWords.selling_from), with its id: a form for
# one for sale, putting it in the visitor's cart; for one out of stock or
# with no price, the words that say so where the button goes (the shop's
# rules say which, ShopRules.product_state). Nothing at all for any other
# entry, for values made up for a collection with none (no entry, no id),
# on a page with no entry, and with the shop off: what is not a
# product's.
#
# An entry is a Hash as SiteContent gives it (and the contract's
# fixtures): its "id", its "collectionId", its collection's "fields", its
# "title" and "values"; a shop, as ShopWords reads one.
module AddToCart
  # The cart's address a product is put in at (CartController#add).
  ITEMS = "/cart/items"

  # Where the button goes, for a product that is not for sale.
  WORDS = { "outOfStock" => "Out of stock", "noPrice" => "Not for sale" }.freeze

  # A product for sale: its entry's id, the button's words and whether it
  # asks how many; or the words of one that is not (state, words).
  Drawing = Data.define(:state, :entry_id, :label, :quantity, :words) do
    def initialize(state:, entry_id: nil, label: nil, quantity: nil, words: nil)
      super
    end
  end

  module_function

  def drawing(props, entry, shop)
    return nil unless entry.is_a?(Hash)

    id = entry["id"]
    return nil unless id.is_a?(Integer) && id.between?(1, ShopRules::MAX_ID)

    selling = ShopWords.selling_from(shop, entry["collectionId"]) or return nil
    fields = entry["fields"].is_a?(Array) ? entry["fields"] : []
    values = entry["values"].is_a?(Hash) ? entry["values"] : {}
    product = ShopRules::Product.new(id: id, title: entry["title"].is_a?(String) ? entry["title"] : "", values: values)
    state = ShopRules.product_state(product, fields, selling.price_field)
    return Drawing.new(state: state, entry_id: id, label: props["label"].is_a?(String) ? props["label"] : "", quantity: props["quantity"] == true) if state == "forSale"

    WORDS.key?(state) ? Drawing.new(state: state, words: WORDS.fetch(state)) : nil
  end
end
