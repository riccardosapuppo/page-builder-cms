# frozen_string_literal: true

# The shop's cart, a visitor's own (docs/decisions/shop-on-collections.md):
# GET /cart draws it; POST /cart/items puts a product in; POST
# /cart/items/:entry_id sets a line's quantity, 0 taking the line out; POST
# /cart/checkout makes the order and sends the visitor to Stripe's
# checkout (303); and GET /cart/thanks?session_id=<id> is where Stripe
# sends them back: the session is asked of Stripe, the order kept as paid
# when it is, and the cart rid of what the order took, once.
#
# The cart is kept in a cookie these addresses alone read and set: its
# lines, a product's entry id and a quantity each, never a price, and,
# from a checkout until its order is settled, that order's id, the mark
# of the checkout this browser made;
# encrypted and signed with the application's secret, HttpOnly,
# SameSite=Lax, and on the path /cart, so a browser sends it to these
# addresses and to no page. No session, no table: every price is read from
# what the product published (ShopRules.price_cart). The published pages
# still set no cookie and run no script, and nothing here is cached
# (no-store) or for search engines (noindex).
#
# The writes are public, as a visitor's form is (SubmissionsController),
# and have the forms' guards, in the forms' order: the Origin must be the
# site's (403, nothing read or counted); then, for the checkout alone,
# which asks Stripe, the forms' count, ten in ten minutes from one address
# (the socket's own peer, config.x.submission_limit_by), in a count of its
# own: 429; then only a form's own encoding (415) and a small body (413).
# Every product and quantity is held to the shop's rules (ShopRules) and
# to the published products.
#
# With the shop off, every one of these addresses is the site's 404 page.
class CartController < ApplicationController
  include PublicPage

  COOKIE = :cart
  # How long a browser keeps a cart.
  KEPT_FOR = 30.days
  # The longest body the cart's forms send: an id and a quantity, or none.
  MAX_BODY = 1024

  LIMIT = SubmissionsController::LIMIT
  WINDOW = SubmissionsController::WINDOW

  # What the cart says, in the visitor's words.
  WORDS = {
    from_elsewhere: "This did not come from this site's own page, so nothing changed. Use the cart on the site itself.",
    not_read: "That could not be read, so nothing changed. Go back to the cart and try again.",
    too_long: "That was too long to read, so nothing changed. Go back to the cart and try again.",
    too_many: "Too many checkouts were started from your connection in a short time. Wait ten minutes, then try again.",
    closed: "Checkout is not open on this site yet: nothing can be paid for now.",
    nothing: "Nothing in your cart can be bought now, so there is nothing to check out.",
    failed: "Checkout could not start: the payment service did not answer as it should. Nothing was paid; try again in a moment.",
    states: {
      "outOfStock" => "This product is out of stock.",
      "noPrice" => "This product has no price, so it is not for sale.",
      "gone" => "This product is no longer sold."
    }
  }.freeze

  skip_forgery_protection

  before_action :keep_out_of_caches
  before_action :shop_open
  before_action :same_origin_only, only: %i[add set checkout]
  rate_limit to: LIMIT, within: WINDOW, by: -> { Rails.configuration.x.submission_limit_by.call(request) }, store: SubmissionsController::LIMIT_STORE, with: :too_many, only: :checkout
  before_action :form_encoded_only, :within_size, only: %i[add set checkout]

  # The cart's checkout goes to Stripe's page, through a 303: a browser
  # holds a form's redirect to the page's form-action too, so every page
  # of the cart, which may hold its checkout's form, lets its forms go
  # there (StripeSettings#checkout_origin).
  content_security_policy do |policy|
    policy.form_action(:self, *[ StripeSettings.current.checkout_origin ].compact)
  end

  # GET /cart
  def show
    draw_cart
  end

  # POST /cart/items {entry, quantity}: quantity more of the product, 1
  # when the form names none.
  def add
    entry_id = form_integer(params[:entry])
    quantity = params.key?(:quantity) ? form_integer(params[:quantity]) : 1
    change = ShopRules.add(cart_lines, entry_id, quantity)
    return draw_cart(status: :unprocessable_content, said: change.fault.message) unless change.ok?

    state = product_state(entry_id)
    return draw_cart(status: :unprocessable_content, said: WORDS[:states].fetch(state)) unless state == "forSale"

    keep_cart(change.lines)
    redirect_to "/cart", status: :see_other
  end

  # POST /cart/items/:entry_id {quantity}: the line holds that quantity,
  # 0 taking it out, whatever became of its product.
  def set
    entry_id = form_integer(request.path_parameters[:entry_id])
    quantity = form_integer(params[:quantity])
    change = ShopRules.set(cart_lines, entry_id, quantity)
    return draw_cart(status: :unprocessable_content, said: change.fault.message) unless change.ok?

    if quantity.positive?
      state = product_state(entry_id)
      return draw_cart(status: :unprocessable_content, said: WORDS[:states].fetch(state)) unless state == "forSale"
    end
    keep_cart(change.lines)
    redirect_to "/cart", status: :see_other
  end

  # POST /cart/checkout: the order made of the lines for sale, at the
  # prices their products published, and 303 to Stripe's page for it. The
  # cart keeps its lines, for a visitor who leaves Stripe's page, and the
  # order's id, for the thanks page to know the checkout as this
  # browser's.
  def checkout
    stripe = StripeSettings.current
    return draw_cart(status: :service_unavailable, said: WORDS[:closed]) unless stripe.ready?

    priced = price(cart_lines)
    return draw_cart(status: :conflict, said: WORDS[:nothing]) if priced.order_lines.empty?

    order, url = Order.check_out!(priced.order_lines, @shop.currency, base_url: request.base_url, settings: stripe)
    keep_cart(cart_lines, checkout: order.id)
    logger.info "order #{order.id}: #{order.lines.size} line(s), #{order.total} in #{order.currency}, sent to Stripe's checkout"
    redirect_to url, status: :see_other, allow_other_host: true
  rescue StripeClient::Failed => e
    logger.warn "checkout: no session from Stripe, so no order kept: #{e.message}"
    draw_cart(status: :bad_gateway, said: WORDS[:failed])
  end

  # GET /cart/thanks?session_id=<the session's id>: an open order asked of
  # Stripe and kept as Stripe says it is. Once it is settled, a cart that
  # holds the mark of its checkout loses it, and, the order paid, the
  # quantities the order took (ShopRules.after_order): what was put in
  # since stays, and a second visit, or another browser's, which holds no
  # mark of it, changes nothing. A session no order has is the 404 page.
  def thanks
    id = request.query_parameters["session_id"]
    order = Order.find_by(stripe_session_id: id) if id.is_a?(String) && Order::SESSION_ID.match?(id)
    return render_not_found unless order

    asked = true
    stripe = StripeSettings.current
    begin
      order = order.refresh!(settings: stripe) if order.status == "open" && stripe.ready?
    rescue StripeClient::Failed => e
      logger.warn "order #{order.id}: the thanks page asked Stripe and failed: #{e.message}"
      asked = false
    end
    if checkout_mark == order.id && order.status != "open"
      keep_cart(order.status == "paid" ? ShopRules.after_order(cart_lines, order.lines) : cart_lines, checkout: nil)
    end
    draw_page("cart/thanks", title: order.status == "paid" ? "Thank you" : "Your order", status: asked ? :ok : :bad_gateway, order: order, asked: asked)
  end

  private

  def keep_out_of_caches
    no_store
    @noindex = true
    response.headers["X-Robots-Tag"] = "noindex"
  end

  # The shop is on, its collection there: else the site's 404 page.
  def shop_open
    @shop = ShopSetting.current
    @collection = Collection.find_by(id: @shop.products_collection_id) if @shop.open?
    render_not_found unless @collection
  end

  def same_origin_only
    return if request.origin.present? && request.origin == request.base_url

    logger.info "cart refused: Origin #{request.origin.inspect}, not #{request.base_url}"
    draw_cart(status: :forbidden, said: WORDS[:from_elsewhere], read: false)
  end

  def form_encoded_only
    return if request.media_type == "application/x-www-form-urlencoded"

    draw_cart(status: :unsupported_media_type, said: WORDS[:not_read], read: false)
  end

  # Read from the header, never from the body (SubmissionsController#within_size).
  def within_size
    return if request.get_header("CONTENT_LENGTH").to_i <= MAX_BODY

    draw_cart(status: :content_too_large, said: WORDS[:too_long], read: false)
  end

  def too_many
    response.headers["Retry-After"] = WINDOW.to_i.to_s
    draw_cart(status: :too_many_requests, said: WORDS[:too_many])
  end

  # The digits a form sends for an id or a quantity, as an integer; nil for
  # anything else, which the shop's rules refuse.
  def form_integer(value)
    value.to_i if value.is_a?(String) && value.match?(/\A[0-9]{1,16}\z/)
  end

  # The cart as its cookie holds it, {"lines" => [[entry id, quantity],
  # ...], "checkout" => order id}: nothing for a cookie this application
  # did not write, or no cookie.
  def kept
    @kept ||= cookies.encrypted[COOKIE].then { |value| value.is_a?(Hash) ? value : {} }
  end

  # The cart's lines, held to the shop's rules as they are read.
  def cart_lines
    @cart_lines ||= ShopRules.read_cart(kept["lines"])
  end

  # The order whose checkout this browser made last, until it is settled.
  def checkout_mark
    mark = kept["checkout"]
    mark if mark.is_a?(Integer) && mark.positive?
  end

  # The cart kept, its lines and the mark of a checkout (the one it holds
  # unless told another, or none); the cookie gone with neither.
  def keep_cart(lines, checkout: checkout_mark)
    @cart_lines = lines
    @kept = { "lines" => ShopRules.kept_cart(lines), "checkout" => checkout }.compact
    if lines.empty? && checkout.nil?
      cookies.delete(COOKIE, path: "/cart")
    else
      cookies.encrypted[COOKIE] = { value: @kept, path: "/cart", expires: KEPT_FOR, httponly: true, same_site: :lax }
    end
  end

  # The published products among these ids, as the shop's rules read them:
  # a published entry of the products collection, its title and values as
  # it went live.
  def products(ids)
    rows = ids.empty? ? [] : @collection.entries.where(id: ids).where.not(published_at: nil).pluck(:id, :published_title, :published_field_values)
    rows.to_h { |id, title, values| [ id, ShopRules::Product.new(id: id, title: title, values: values) ] }
  end

  def product_state(entry_id)
    ShopRules.product_state(products([ entry_id ])[entry_id], @collection.fields, @shop.price_field)
  end

  def price(lines)
    ShopRules.price_cart(lines, products(lines.map(&:entry_id)).method(:[]), @collection.fields, @shop.price_field)
  end

  # The cart's page, with what was said above it when given; read: false
  # for a request refused before anything of it is read.
  def draw_cart(status: :ok, said: nil, read: true)
    lines = read ? cart_lines : []
    draw_page("cart/show", title: "Your cart", status: status, said: said, priced: read ? price(lines) : nil, checkout: StripeSettings.current.ready?)
  end

  # A page of the cart in the site's frame: its header and footer, as a
  # published page draws them, around the view.
  def draw_page(view, title:, status:, **locals)
    @document = { "schemaVersion" => 1, "title" => title, "sections" => [] }
    @title = title
    @content = SiteContent::NONE
    render view, status: status, locals: { currency: @shop.currency, shop_path: shop_path, **locals }
  end

  # Where an empty cart leads: the page at the products' prefix, when one
  # is live there, else the home page.
  def shop_path
    page = Page.find_by(slug: @collection.prefix)
    page&.published? ? page.live_path : "/"
  end
end
