require "test_helper"

# The shop as a page is drawn with it (ShopWords), and what Add to cart
# draws (AddToCart): the twins of builder/src/render/shop-words.ts and
# builder/src/widgets/addToCart/drawing.ts, which the render contract
# holds together on the shop's fixtures; here, the rules one by one, as
# the editor's tests read them.
class ShopWordsTest < ActiveSupport::TestCase
  SHOP = { "enabled" => true, "currency" => "GBP", "productsCollectionId" => 7, "priceField" => "price" }.freeze
  FIELDS = [ { "key" => "price", "label" => "Price", "type" => "number" }, { "key" => "in-stock", "label" => "In stock", "type" => "toggle" } ].freeze

  def product(values, **more)
    { "id" => 41, "collectionId" => 7, "fields" => FIELDS, "title" => "Swim cap", "slug" => "swim-cap", "values" => values }.merge(more.transform_keys(&:to_s))
  end

  test "a shop sells from a collection while it is on, in a currency of its list, naming that collection and a price field" do
    assert_equal ShopWords::Selling.new(currency: "GBP", price_field: "price"), ShopWords.selling_from(SHOP, 7)
    [
      SHOP.merge("enabled" => false), SHOP.merge("enabled" => "true"), SHOP.merge("currency" => "JPY"), SHOP.merge("currency" => "gbp"),
      SHOP.merge("productsCollectionId" => nil), SHOP.merge("productsCollectionId" => "7"), SHOP.merge("productsCollectionId" => 0), SHOP.merge("productsCollectionId" => 2**53),
      SHOP.merge("priceField" => nil), SHOP.merge("priceField" => 3), nil, "on", [ SHOP ]
    ].each { |other| assert_nil ShopWords.selling_from(other, 7), other.inspect }
    [ 8, "7", nil ].each { |id| assert_nil ShopWords.selling_from(SHOP, id), id.inspect }
  end

  test "the price of the collection the shop sells from is money; nothing for a value no price can be; any other number as the site writes one" do
    assert_equal [ "£1,250.50", "£0.00", "$1.15", "€1,000,000,000.00" ], [
      ShopWords.number_or_price(1250.5, "price", 7, SHOP), ShopWords.number_or_price(0, "price", 7, SHOP),
      ShopWords.number_or_price(1.15, "price", 7, SHOP.merge("currency" => "USD")), ShopWords.number_or_price(1_000_000_000, "price", 7, SHOP.merge("currency" => "EUR"))
    ]
    [ -3, 1.155, "12", nil, 1e10 ].each { |value| assert_nil ShopWords.number_or_price(value, "price", 7, SHOP), value.inspect }
    assert_equal [ "1,250.5", "1,250.5", "1,250.5", "-3" ], [
      ShopWords.number_or_price(1250.5, "weight", 7, SHOP), ShopWords.number_or_price(1250.5, "price", 8, SHOP),
      ShopWords.number_or_price(1250.5, "price", 7, SHOP.merge("enabled" => false)), ShopWords.number_or_price(-3, "price", 7, nil)
    ]
  end

  test "Add to cart: a form for a product for sale, the words of one out of stock or with no price, nothing for whatever is no product" do
    assert_equal({ state: "forSale", entry_id: 41, label: "Add to cart", quantity: true, words: nil }, AddToCart.drawing({ "label" => "Add to cart", "quantity" => true }, product({ "price" => 12, "in-stock" => true }), SHOP).to_h)
    assert_equal [ "", false ], AddToCart.drawing({ "label" => 12, "quantity" => "yes" }, product({ "price" => 12, "in-stock" => true }), SHOP).then { |d| [ d.label, d.quantity ] }
    assert_equal [ "outOfStock", "Out of stock" ], AddToCart.drawing({}, product({ "price" => 12, "in-stock" => false }), SHOP).then { |d| [ d.state, d.words ] }
    assert_equal [ "noPrice", "Not for sale" ], AddToCart.drawing({}, product({ "price" => -3, "in-stock" => true }), SHOP).then { |d| [ d.state, d.words ] }
    assert_equal "noPrice", AddToCart.drawing({}, product("price", fields: "price"), SHOP).state, "values and fields of no shape read as none"
    [
      [ product({ "price" => 12, "in-stock" => true }), SHOP.merge("enabled" => false) ], [ product({ "price" => 12, "in-stock" => true }), nil ],
      [ product({ "price" => 12, "in-stock" => true }, collectionId: 8), SHOP ], [ product({ "price" => 12 }).except("id"), SHOP ],
      [ product({ "price" => 12 }, id: 0), SHOP ], [ product({ "price" => 12 }, id: "41"), SHOP ], [ nil, SHOP ]
    ].each_with_index { |(entry, shop), at| assert_nil AddToCart.drawing({ "label" => "Add" }, entry, shop), at.to_s }
  end
end
