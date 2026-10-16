# frozen_string_literal: true

# The shop as a page is drawn with it, for the blocks that draw a price (a
# Field block, EntryField, and a Collection list's cards, CollectionList)
# and for Add to cart (AddToCart): whether it sells from a collection, in
# which currency and by which of its number fields. The twin of
# builder/src/render/shop-words.ts, held to it by the render contract.
#
# Read defensively, as a block is: the settings the database holds were
# held to the shop's rules when they were saved (ShopRules), a fixture of
# the contract holds what no rule would let through. A shop is a Hash as
# the API names its members (ShopSetting#settings): "enabled", "currency",
# "productsCollectionId", "priceField".
module ShopWords
  # The shop selling from a collection: its currency and its price field.
  Selling = Data.define(:currency, :price_field)

  module_function

  # The shop that sells from the collection collection_id: on, in a
  # currency of its list, its products that collection and its price a
  # field's key; nil for any other shop, or none.
  def selling_from(shop, collection_id)
    return nil unless shop.is_a?(Hash) && shop["enabled"] == true

    currency = shop["currency"]
    products = shop["productsCollectionId"]
    price_field = shop["priceField"]
    return nil unless ShopRules::CURRENCIES.include?(currency) && price_field.is_a?(String)
    return nil unless products.is_a?(Integer) && products.between?(1, ShopRules::MAX_ID) && products == collection_id

    Selling.new(currency: currency, price_field: price_field)
  end

  # A number field's value as a page writes it: the price, in the shop's
  # words for an amount ("£1,250.00"), when the field is the price of the
  # collection the shop sells from, and nothing for a value no price can
  # be (below zero, more than two decimals); any other number as the site
  # writes one ("1,250.5"), the shop off included.
  def number_or_price(value, key, collection_id, shop)
    selling = selling_from(shop, collection_id)
    return EntryWords.number_words(value) if selling.nil? || key != selling.price_field

    minor = ShopRules.minor_units(value)
    minor && ShopRules.money_words(minor, selling.currency)
  end
end
