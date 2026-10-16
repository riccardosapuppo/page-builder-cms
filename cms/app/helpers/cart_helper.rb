# frozen_string_literal: true

# The words of the cart's pages (CartController): an amount in the site's
# words, in the shop's currency (ShopRules.money_words), and what a line
# whose product is not for sale says of it.
module CartHelper
  LINE_STATES = {
    "outOfStock" => "Out of stock",
    "noPrice" => "Not for sale: it has no price",
    "gone" => "No longer sold"
  }.freeze

  def money(minor, currency)
    ShopRules.money_words(minor, currency)
  end

  def line_state_words(state)
    LINE_STATES.fetch(state)
  end
end
