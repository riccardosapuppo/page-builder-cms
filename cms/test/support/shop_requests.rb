# frozen_string_literal: true

# The shop in the tests: a collection of products and its settings, the
# fake Stripe (FakeStripe) the checkout goes to, and a visitor's requests
# to the cart's addresses, as a browser sends them from the site's pages.
#
# The tests start with no Stripe key and no Stripe address, whatever the
# shell that runs them holds: a test that checks out names the fake's.
ENV.delete("STRIPE_SECRET_KEY")
ENV.delete("STRIPE_API_BASE")

module ShopRequests
  ORIGIN = "http://www.example.com"

  PRODUCT_FIELDS = [
    { "key" => "summary", "label" => "Summary", "type" => "paragraph", "required" => false },
    { "key" => "price", "label" => "Price", "type" => "number", "required" => false, "min" => 0, "max" => 100_000 },
    { "key" => "in-stock", "label" => "In stock", "type" => "toggle", "required" => false }
  ].freeze

  # A collection of products, with its template.
  def products_collection(prefix: "shop", fields: PRODUCT_FIELDS)
    Collection.create_with_template!({ "name" => "Products", "prefix" => prefix, "fields" => fields, "sort" => { "by" => "title", "direction" => "asc" } })
  end

  # A product, published unless said otherwise.
  def product(collection, title, slug, price: 12, in_stock: true, publish: true, values: nil)
    values ||= { "price" => price, "in-stock" => in_stock }.compact
    entry = Entry.create_checked!(collection, { "title" => title, "slug" => slug, "values" => values })
    publish ? entry.publish! : entry
  end

  # The shop on, selling the collection by its price.
  def open_shop(collection, currency: "GBP", price_field: "price")
    ShopSetting.change!({ "enabled" => true, "currency" => currency, "productsCollectionId" => collection.id, "priceField" => price_field })
  end

  # The fake Stripe, its key and address in the environment for the block,
  # as STRIPE_SECRET_KEY and STRIPE_API_BASE, both taken out again after.
  def with_stripe(key: FakeStripe::KEY)
    server = FakeStripe.start
    ENV["STRIPE_SECRET_KEY"] = key
    ENV["STRIPE_API_BASE"] = server.url
    yield server.stripe, server
  ensure
    ENV.delete("STRIPE_SECRET_KEY")
    ENV.delete("STRIPE_API_BASE")
    server&.stop
  end

  # A cart's form as the site's page sends it: form encoded, with the
  # Origin a browser sets on every form it posts.
  def cart_post(path, params = {}, origin: ORIGIN, env: {})
    headers = origin ? { "Origin" => origin } : {}
    post path, params: params, headers: headers, env: env
    response
  end

  # The cart as the cookie the session holds keeps it, read as the
  # application reads it (encrypted and signed with its secret): its
  # lines, and the mark of the checkout it made last, if any.
  def cart_kept
    value = cookies[:cart]
    (value && ActionDispatch::TestRequest.create("HTTP_COOKIE" => "cart=#{Rack::Utils.escape(value)}").cookie_jar.encrypted[:cart]) || {}
  end

  def cart_cookie
    cart_kept["lines"]
  end

  def cart_mark
    cart_kept["checkout"]
  end

  # The Set-Cookie lines of the last answer, one per cookie.
  def set_cookies
    Array(response.headers["Set-Cookie"]).flat_map { |line| line.split("\n") }
  end
end
