# frozen_string_literal: true

# The cart's pages (CartController, app/views/cart/), drawn here with tag
# helpers, as the block partials draw a Collection list, and in the site's
# frame with a block's own classes wherever a block would draw the same
# (site.css, "The cart's pages"); and their words: an amount in the site's
# words, in the shop's currency (ShopRules.money_words), why a line cannot
# be bought, how many items the cart holds, and what the page Stripe sends
# a visitor back to says of their order.
#
# The browser demo draws the same cart with the twins of these
# (builder/src/demo/cart-view.tsx, cart-page.ts), held to the same page by
# the cart's contract (contract/cart/: cms/test/contract/cart_goldens_test.rb
# writes the goldens, and the demo's cart.contract.test.tsx draws them).
module CartHelper
  # Why a line cannot be bought, under its title.
  LINE_STATES = {
    "outOfStock" => "Out of stock: the checkout leaves it out.",
    "noPrice" => "It has no price, so it is not for sale: the checkout leaves it out.",
    "gone" => "No longer sold: the checkout leaves it out."
  }.freeze

  # The title of a line whose product is no longer sold.
  GONE_TITLE = "A product no longer sold"
  EMPTY = "Your cart is empty."

  def money(minor, currency)
    ShopRules.money_words(minor, currency)
  end

  def line_state_words(state)
    LINE_STATES.fetch(state)
  end

  # The line under the cart's title: how many items it holds, every line
  # counted, a line that cannot be bought too.
  def cart_count_words(lines)
    count = lines.sum(&:quantity)
    count == 1 ? "You have 1 item in your cart." : "You have #{count} items in your cart."
  end

  # A line of an order as it was sold: "2 × £12.00".
  def order_line_words(line, currency)
    "#{line['quantity']} × #{money(line['unitAmount'], currency)}"
  end

  # What the thanks page says of an order: its title, and the line under
  # it. asked: false when Stripe could not be asked about an open order.
  def order_words(order, asked)
    case order.status
    when "paid"
      [ "Thank you", order.total.zero? ? "Your order is confirmed: there was nothing to pay." : "Your order is paid: #{money(order.total, order.currency)}." ]
    when "expired"
      [ "Not paid", "This checkout expired before it was paid, and nothing was paid." ]
    else
      asked ? [ "Not paid yet", "This order is not paid yet. If you have just paid, reload this page in a moment." ] : [ "Not known yet", "Whether this order is paid could not be checked just now. Reload this page in a moment." ]
    end
  end

  # ------------------------------------------------------------- markup

  # The band of deep water at the head of a cart's page: its title, and
  # the line under it when there is one.
  def cart_head(title, said)
    words = [ tag.div(tag.h1(title), class: "w w-heading size-heading-1"), (tag.div(tag.p(said), class: "w w-text size-large") if said) ].compact
    tag.section(tag.div(tag.div(safe_join(words), class: "col gap-m"), class: "sw-inner cols cols-1"),
                class: "sec bg-text space-above-section-s space-below-section-s phone-space-above-l sw-cart-head")
  end

  # The cart on the page's own band: what the last change said (said), and
  # its lines and its card; or, for a cart not read (priced nil), the way
  # back to it; or, empty, the way to the shop. closed: why there is no
  # checkout's button, or nil.
  def cart_body(priced, shown, media, currency, said:, closed:, shop_path:)
    parts = []
    parts << tag.p(said, class: "sw-cart-notice", role: "alert") if said
    parts <<
      if priced.nil? then tag.p(tag.a("Back to your cart", class: "sw-btn sw-btn-primary", href: "/cart"), class: "sw-cart-empty")
      elsif priced.lines.empty? then tag.p(tag.a("See what the shop sells", class: "sw-btn sw-btn-primary", href: shop_path), class: "sw-cart-empty")
      else
        lines = tag.ul(safe_join(priced.lines.map { |line| cart_line(line, shown[line.entry_id], media, currency) }), class: "sw-cart-lines", aria: { label: "In your cart" })
        tag.div(safe_join([ lines, cart_summary(priced.total, currency, closed, shop_path) ]), class: "sw-cart-body")
      end
    cart_band(safe_join(parts), "sw-cart")
  end

  # One line: its product's picture, its title, the link to its page when
  # it has one, its price for one and what it costs, or why it cannot be
  # bought; how many, for a line for sale, and taking it out. The field and
  # the buttons name the product for a screen reader.
  def cart_line(line, shown, media, currency)
    title = line.title || GONE_TITLE
    for_sale = line.state == "forSale"
    picture = shown&.image && block_img(shown.image, media)
    about = tag.div(safe_join([
      tag.h2(shown&.href ? tag.a(title, href: shown.href) : title, class: "sw-cart-title"),
      for_sale ? tag.p("#{money(line.unit_amount, currency)} each", class: "sw-cart-price") : tag.p(line_state_words(line.state), class: "sw-cart-state")
    ]), class: "sw-cart-about")
    field = "quantity-#{line.entry_id}"
    quantity = if for_sale
      tag.form(safe_join([
        tag.div(safe_join([
          tag.label(safe_join([ "Quantity", tag.span(" of #{title}", class: "sw-cart-unseen") ]), for: field),
          tag.input(id: field, name: "quantity", type: "number", inputmode: "numeric", min: 0, max: ShopRules::MOST_QUANTITY, value: line.quantity, required: true)
        ]), class: "sw-field"),
        tag.button("Update", class: "sw-btn sw-btn-small sw-btn-line", type: "submit", aria: { label: "Update #{title}" })
      ]), class: "sw-cart-quantity", method: "post", action: "/cart/items/#{line.entry_id}")
    end
    remove = tag.form(safe_join([ tag.input(type: "hidden", name: "quantity", value: 0), tag.button("Remove", type: "submit", aria: { label: "Remove #{title}" }) ]),
                      class: "sw-cart-remove", method: "post", action: "/cart/items/#{line.entry_id}")
    tag.li(safe_join([
      (tag.figure(picture, class: "sw-cart-picture") if picture),
      about,
      (tag.p(money(line.amount, currency), class: "sw-cart-amount") if for_sale),
      tag.div(safe_join([ quantity, remove ].compact), class: "sw-cart-change")
    ].compact), class: "sw-cart-line", data: { entry_id: line.entry_id, state: line.state })
  end

  # The card beside the lines: the total, the checkout's button or why
  # there is none, and the way back to the shop.
  def cart_summary(total, currency, closed, shop_path)
    checkout = closed ? tag.p(closed, class: "sw-cart-closed") : tag.form(tag.button("Checkout", class: "sw-btn sw-btn-primary", type: "submit"), method: "post", action: "/cart/checkout")
    tag.div(safe_join([ cart_total(total, currency), checkout, tag.p(tag.a("Back to the shop", href: shop_path), class: "sw-cart-back") ]), class: "sw-cart-summary")
  end

  def cart_total(total, currency)
    tag.p(safe_join([ tag.span("Total"), " ", tag.strong(money(total, currency)) ]), class: "sw-cart-total")
  end

  # An order's lines as they were sold, its total, and the way back.
  def order_body(lines, total, currency, back_href, back_words)
    list = tag.ul(safe_join(lines.map { |line| order_line(line, currency) }), class: "sw-cart-lines", aria: { label: "Your order" })
    summary = tag.div(safe_join([ cart_total(total, currency), tag.p(tag.a(back_words, class: "sw-btn sw-btn-primary", href: back_href)) ]), class: "sw-cart-summary")
    cart_band(tag.div(safe_join([ list, summary ]), class: "sw-cart-body"), "sw-cart sw-order")
  end

  def order_line(line, currency)
    about = tag.div(safe_join([ tag.h2(line["title"], class: "sw-cart-title"), tag.p(order_line_words(line, currency), class: "sw-cart-price") ]), class: "sw-cart-about")
    tag.li(safe_join([ about, tag.p(money(line["unitAmount"] * line["quantity"], currency), class: "sw-cart-amount") ]), class: "sw-cart-line", data: { entry_id: line["entryId"] })
  end

  def cart_band(inner, kind)
    tag.section(tag.div(inner, class: "sw-inner"), class: "sec space-above-section-s space-below-section-s #{kind}")
  end
end
