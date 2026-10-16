require "test_helper"

# The shop's cart, as a visitor's browser uses it (CartController): a
# product put in, a line's quantity set and taken out, the checkout that
# makes the order and sends the visitor to Stripe's page (the tests' fake,
# FakeStripe), and the thanks page Stripe sends them back to, both drawn
# in the site's frame; the cookie that keeps the cart, holding ids and
# quantities alone; and the guards a visitor's form has. Nothing here
# reaches the network.
class CartTest < ActionDispatch::IntegrationTest
  include ShopRequests
  include StoredFiles

  setup do
    SubmissionsController::LIMIT_STORE.clear
    @shop = products_collection
    @cap = product(@shop, "Swim cap", "swim-cap", price: 12)
    @float = product(@shop, "Tow float", "tow-float", price: 24.5)
    open_shop(@shop)
  end

  def html = Nokogiri::HTML5(response.body)

  # Each line's title, then its price for one and what it costs, or why it
  # cannot be bought.
  def lines_drawn
    html.css(".sw-cart-line").map { |line| [ line.at_css(".sw-cart-title").text, *line.css(".sw-cart-price, .sw-cart-state, .sw-cart-amount").map(&:text) ] }
  end

  def assert_private(what)
    assert_equal "no-store", response.headers["Cache-Control"], what
    assert_equal "noindex", response.headers["X-Robots-Tag"], what
  end

  test "with the shop off, or on with nothing to sell from, every one of the cart's addresses is the site's 404 page" do
    [ -> { ShopSetting.change!({ "enabled" => false, "currency" => "GBP", "productsCollectionId" => @shop.id, "priceField" => "price" }) },
      -> { ShopSetting.delete_all } ].each do |turn_off|
      turn_off.call
      get "/cart"
      assert_response :not_found
      assert_select "h1", "There is no page here"
      assert_private "the cart's 404"
      cart_post("/cart/items", { "entry" => @cap.id.to_s })
      assert_response :not_found
      cart_post("/cart/items/#{@cap.id}", { "quantity" => "2" })
      assert_response :not_found
      cart_post("/cart/checkout")
      assert_response :not_found
      get "/cart/thanks", params: { "session_id" => "cs_test_Any" }
      assert_response :not_found
      assert_empty set_cookies, "no cookie from a shop that is off"
    end
  end

  test "a product put in, its quantity set and taken out: each 303 to the cart, kept in a cookie of ids and quantities, encrypted, HttpOnly, SameSite=Lax, on /cart alone" do
    cart_post("/cart/items", { "entry" => @cap.id.to_s, "quantity" => "2" })
    assert_response :see_other
    assert_equal "#{ORIGIN}/cart", response.location
    assert_private "the answer to a product put in"
    cookie = set_cookies.find { |line| line.start_with?("cart=") }
    assert cookie, "the cart's cookie is set"
    assert_match(%r{; path=/cart(;|$)}i, cookie)
    assert_match(/; httponly/i, cookie)
    assert_match(/; samesite=lax/i, cookie)
    assert_match(/; expires=/i, cookie)
    assert_equal 1, set_cookies.size, "no other cookie: no session"
    assert_no_match(/1200|12\.0|Swim/, CGI.unescape(cookies[:cart]), "nothing of it reads in clear")
    assert_equal [ [ @cap.id, 2 ] ], cart_cookie, "ids and quantities, no price"

    cart_post("/cart/items", { "entry" => @float.id.to_s })
    assert_equal [ [ @cap.id, 2 ], [ @float.id, 1 ] ], cart_cookie, "one when the form names no quantity"
    cart_post("/cart/items", { "entry" => @cap.id.to_s, "quantity" => "3" })
    assert_equal [ [ @cap.id, 5 ], [ @float.id, 1 ] ], cart_cookie
    cart_post("/cart/items/#{@float.id}", { "quantity" => "4" })
    assert_response :see_other
    assert_equal [ [ @cap.id, 5 ], [ @float.id, 4 ] ], cart_cookie
    cart_post("/cart/items/#{@cap.id}", { "quantity" => "0" })
    assert_equal [ [ @float.id, 4 ] ], cart_cookie
    cart_post("/cart/items/#{@float.id}", { "quantity" => "0" })
    assert_match(/\Acart=;.*max-age=0/i, set_cookies.first, "an empty cart takes its cookie away")
  end

  test "the cart's page draws each line at the price its product published, the total, and the checkout's button; an empty cart leads to the shop" do
    get "/cart"
    assert_response :ok
    assert_private "the cart"
    assert_select "title", "Your cart"
    assert_select "meta[name=robots][content=noindex]"
    assert_select "header.sw-header", 1, "in the site's frame"
    assert_select "footer.sw-footer", 1
    assert_select "main p", /Your cart is empty/
    assert_select "main a[href='/']", "See what the shop sells"
    page = create_page(title: "Shop", slug: "shop")
    page.publish!
    get "/cart"
    assert_select "main a[href='/shop']", "See what the shop sells", "the page at the products' prefix, once live"

    cart_post("/cart/items", { "entry" => @cap.id.to_s, "quantity" => "2" })
    cart_post("/cart/items", { "entry" => @float.id.to_s })
    get "/cart"
    assert_equal [ [ "Swim cap", "£12.00 each", "£24.00" ], [ "Tow float", "£24.50 each", "£24.50" ] ], lines_drawn
    assert_select ".sw-cart-total", "Total £48.50"
    assert_select "main h1", "Your cart"
    assert_select "main .sw-cart-head p", "You have 3 items in your cart."
    assert_select "form[action='/cart/checkout']", 0, "no checkout's button while checkout is not set up"
    assert_select "main p.sw-cart-closed", "Checkout is not open on this site yet: nothing can be paid for now."
    with_stripe do
      get "/cart"
      assert_select "form[method=post][action='/cart/checkout'] button", "Checkout"
    end
    assert_select "form[action='/cart/items/#{@cap.id}'] input[name=quantity][value='2']"
    assert_select "form[action='/cart/items/#{@cap.id}'] input[type=hidden][name=quantity][value='0'] + button[aria-label='Remove Swim cap']", "Remove"
    assert_empty set_cookies, "reading the cart sets nothing"
    assert_empty html.css("input[name=authenticity_token]"), "no token"
  end

  test "a line shows its product's picture, its alt the entry's, and its title leads to the product's page once its template is live; a product with no picture shows none" do
    kit = products_collection(prefix: "kit", fields: [ { "key" => "image", "label" => "Image", "type" => "image", "required" => false }, *PRODUCT_FIELDS ])
    item = MediaItem.create_from_upload!(signed_blob_id: uploaded_blob(png_bytes(width: 4, height: 3)).signed_id, width: 4, height: 3, alt: "")
    cap = product(kit, "Swim cap", "swim-cap", values: { "price" => 12, "in-stock" => true, "image" => { "mediaId" => item.public_id, "alt" => "Three swim caps at the waterline" } })
    mug = product(kit, "Enamel mug", "enamel-mug", price: 9.5)
    open_shop(kit)
    cart_post("/cart/items", { "entry" => cap.id.to_s })
    cart_post("/cart/items", { "entry" => mug.id.to_s })

    get "/cart"
    assert_select "[data-entry-id='#{cap.id}'] figure.sw-cart-picture img[alt='Three swim caps at the waterline'][width='4'][height='3']"
    assert_select "[data-entry-id='#{mug.id}'] figure", 0, "no picture, no figure"
    assert_select ".sw-cart-title a", 0, "no page to lead to while the template is not live"
    kit.template.publish!
    get "/cart"
    assert_equal [ [ "Swim cap", "/kit/swim-cap" ], [ "Enamel mug", "/kit/enamel-mug" ] ], css_select(".sw-cart-title a").map { |a| [ a.text, a["href"] ] }
    assert_select "label[for='quantity-#{cap.id}']", "Quantity of Swim cap"
    assert_select "button[aria-label='Update Swim cap']", "Update"
  end

  test "the thanks page lists the order's lines as they were sold and its total, in the site's frame, and leads back to the cart until it is paid, then to the shop" do
    create_page(title: "Shop", slug: "shop").publish!
    with_stripe do |stripe|
      cart_post("/cart/items", { "entry" => @cap.id.to_s, "quantity" => "2" })
      cart_post("/cart/items", { "entry" => @float.id.to_s })
      cart_post("/cart/checkout")
      order = Order.last
      Entry.save_checked!(@shop, @cap.id, revision: @cap.revision, save_id: "price-up", entry: { "title" => "Swim cap", "slug" => "swim-cap", "values" => { "price" => 15, "in-stock" => true } })
      @cap.reload.publish!

      get "/cart/thanks", params: { "session_id" => order.stripe_session_id }
      assert_select "header.sw-header", 1
      assert_select "footer.sw-footer", 1
      assert_select "main .sw-cart-head h1", "Not paid yet"
      assert_equal [ [ "Swim cap", "2 × £12.00", "£24.00" ], [ "Tow float", "1 × £24.50", "£24.50" ] ], lines_drawn, "as they were sold, not as they are now"
      assert_select ".sw-cart-total", "Total £48.50"
      assert_select "main a.sw-btn[href='/cart']", "Back to your cart"

      stripe.pay(order.stripe_session_id)
      get "/cart/thanks", params: { "session_id" => order.stripe_session_id }
      assert_select "main .sw-cart-head h1", "Thank you"
      assert_select "main .sw-cart-head p", "Your order is paid: £48.50."
      assert_equal 2, lines_drawn.size
      assert_select "main a.sw-btn[href='/shop']", "Back to the shop"
      assert_select "main a[href='/cart']", 0
    end
  end

  test "a cart refused before it is read leads back to it, and says why" do
    cart_post("/cart/items", { "entry" => @cap.id.to_s }, origin: "https://other.example")
    assert_response :forbidden
    assert_select "main .sw-cart-head h1", "Your cart"
    assert_select "main .sw-cart-head p", 0, "nothing said of a cart not read"
    assert_select "main p.sw-cart-notice[role=alert]", /did not come from this site's own page/
    assert_select "main a.sw-btn[href='/cart']", "Back to your cart"
  end

  test "every price is read from what the product published, never from the cart: a new price published is the cart's price, a draft's is not" do
    cart_post("/cart/items", { "entry" => @cap.id.to_s })
    Entry.save_checked!(@shop, @cap.id, revision: @cap.revision, save_id: "price-1", entry: { "title" => "Swim cap", "slug" => "swim-cap", "values" => { "price" => 15, "in-stock" => true } })
    get "/cart"
    assert_equal [ [ "Swim cap", "£12.00 each", "£12.00" ] ], lines_drawn, "the draft's price is not live"
    @cap.reload.publish!
    get "/cart"
    assert_equal [ [ "Swim cap", "£15.00 each", "£15.00" ] ], lines_drawn
    ShopSetting.change!({ "enabled" => true, "currency" => "EUR", "productsCollectionId" => @shop.id, "priceField" => "price" })
    get "/cart"
    assert_select ".sw-cart-total", "Total €15.00"
  end

  test "every product and quantity is held to the shop's rules and the published products, each refusal said on the cart's page, and nothing changes" do
    news = Collection.create_with_template!({ "name" => "News", "prefix" => "news", "fields" => PRODUCT_FIELDS, "sort" => { "by" => "title", "direction" => "asc" } })
    elsewhere = product(news, "A story", "story")
    draft = product(@shop, "Enamel mug", "enamel-mug", publish: false)
    sold_out = product(@shop, "Winter gloves", "gloves", in_stock: false)
    priceless = product(@shop, "Series pass", "pass", values: { "in-stock" => true })
    cart_post("/cart/items", { "entry" => @cap.id.to_s })

    [
      [ { "entry" => "x" }, "That product could not be read." ],
      [ { "entry" => "0" }, "That product could not be read." ],
      [ { "entry" => [ @cap.id.to_s ] }, "That product could not be read." ],
      [ { "entry" => @cap.id.to_s, "quantity" => "0" }, "The quantity is a whole number from 1 to 20." ],
      [ { "entry" => @cap.id.to_s, "quantity" => "21" }, "The quantity is a whole number from 1 to 20." ],
      [ { "entry" => @cap.id.to_s, "quantity" => "1.5" }, "The quantity is a whole number from 1 to 20." ],
      [ { "entry" => draft.id.to_s }, "This product is no longer sold." ],
      [ { "entry" => elsewhere.id.to_s }, "This product is no longer sold." ],
      [ { "entry" => "987654" }, "This product is no longer sold." ],
      [ { "entry" => sold_out.id.to_s }, "This product is out of stock." ],
      [ { "entry" => priceless.id.to_s }, "This product has no price, so it is not for sale." ]
    ].each do |params, said|
      cart_post("/cart/items", params)
      assert_response :unprocessable_content, params.inspect
      assert_select "main p[role=alert]", said
      assert_empty set_cookies, "#{params.inspect}: the cart is as it was"
    end
    cart_post("/cart/items/#{sold_out.id}", { "quantity" => "1" })
    assert_response :unprocessable_content
    cart_post("/cart/items/#{@cap.id}", { "quantity" => "-1" })
    assert_select "main p[role=alert]", "The quantity is a whole number from 0 to 20."
    cart_post("/cart/items/#{@cap.id}", {})
    assert_response :unprocessable_content, "a quantity to set is not left out"
    assert_equal [ [ @cap.id, 1 ] ], cart_cookie

    # Twenty products, and a twenty-first.
    goods = (1..19).map { |n| product(@shop, "Good #{n}", "good-#{n}", price: n) }
    goods.each { |good| cart_post("/cart/items", { "entry" => good.id.to_s }) }
    assert_equal 20, cart_cookie.size
    cart_post("/cart/items", { "entry" => @float.id.to_s })
    assert_response :unprocessable_content
    assert_select "main p[role=alert]", "The cart holds 20 different products at most."
  end

  test "a line whose product went out of stock, lost its price or was taken off says so, can only be taken out, and the checkout leaves it out" do
    cart_post("/cart/items", { "entry" => @cap.id.to_s, "quantity" => "2" })
    cart_post("/cart/items", { "entry" => @float.id.to_s })
    Entry.save_checked!(@shop, @float.id, revision: @float.revision, save_id: "out-1", entry: { "title" => "Tow float", "slug" => "tow-float", "values" => { "price" => 24.5, "in-stock" => false } })
    @float.reload.publish!
    get "/cart"
    assert_equal [ [ "Swim cap", "£12.00 each", "£24.00" ], [ "Tow float", "Out of stock: the checkout leaves it out." ] ], lines_drawn
    assert_select "form[action='/cart/items/#{@float.id}'] input[name=quantity][type=number]", 0, "no quantity to set"
    assert_select ".sw-cart-total", "Total £24.00"
    @cap.unpublish!
    with_stripe do
      get "/cart"
      assert_equal [ [ "A product no longer sold", "No longer sold: the checkout leaves it out." ], [ "Tow float", "Out of stock: the checkout leaves it out." ] ], lines_drawn
      assert_select "form[action='/cart/checkout']", 0
      assert_select "main p.sw-cart-closed", "Nothing in your cart can be bought now, so there is nothing to check out."
    end
    cart_post("/cart/items/#{@cap.id}", { "quantity" => "0" })
    assert_response :see_other, "a product gone is taken out all the same"
    assert_equal [ [ @float.id, 1 ] ], cart_cookie
  end

  test "a cart's write from another site, or with no Origin, is refused and changes nothing; so is one in another encoding or too long" do
    cart_post("/cart/items", { "entry" => @cap.id.to_s })
    [ "https://other.example", nil, "null" ].each do |origin|
      cart_post("/cart/items", { "entry" => @float.id.to_s }, origin: origin)
      assert_response :forbidden, origin.inspect
      assert_select "main p[role=alert]", /did not come from this site's own page/
      assert_empty set_cookies
      cart_post("/cart/items/#{@cap.id}", { "quantity" => "0" }, origin: origin)
      assert_response :forbidden
      cart_post("/cart/checkout", {}, origin: origin)
      assert_response :forbidden
    end
    post "/cart/items", params: { "entry" => @float.id.to_s }.to_json, headers: { "Origin" => ORIGIN, "CONTENT_TYPE" => "application/json" }
    assert_response :unsupported_media_type
    cart_post("/cart/items", { "entry" => @float.id.to_s, "padding" => "x" * 1100 })
    assert_response :content_too_large
    assert_equal [ [ @cap.id, 1 ] ], cart_cookie
  end

  test "a checkout makes an open order of the lines for sale at their published prices and sends the visitor to Stripe's page; the cart is kept until it is paid" do
    with_stripe do |stripe|
      cart_post("/cart/items", { "entry" => @cap.id.to_s, "quantity" => "2" })
      cart_post("/cart/items", { "entry" => @float.id.to_s })
      sold_out = product(@shop, "Winter gloves", "gloves")
      cart_post("/cart/items", { "entry" => sold_out.id.to_s })
      Entry.save_checked!(@shop, sold_out.id, revision: sold_out.revision, save_id: "out", entry: { "title" => "Winter gloves", "slug" => "gloves", "values" => { "price" => 9, "in-stock" => false } })
      sold_out.reload.publish!

      assert_difference -> { Order.count }, 1 do
        cart_post("/cart/checkout")
      end
      assert_response :see_other
      order = Order.last
      session = stripe.sessions.last
      assert_equal session["url"], response.location
      assert response.location.start_with?("#{stripe.origin}/c/pay/cs_test_")
      assert_private "the checkout's answer"
      assert_equal [ "open", "GBP", 4850, session["id"], nil, nil ], [ order.status, order.currency, order.total, order.stripe_session_id, order.email, order.paid_at ]
      assert_equal [
        { "entryId" => @cap.id, "title" => "Swim cap", "unitAmount" => 1200, "quantity" => 2 },
        { "entryId" => @float.id, "title" => "Tow float", "unitAmount" => 2450, "quantity" => 1 }
      ], order.lines

      _method, _path, params = stripe.calls.last
      assert_equal "payment", params["mode"]
      assert_equal order.id.to_s, params["client_reference_id"]
      assert_equal "#{ORIGIN}/cart/thanks?session_id={CHECKOUT_SESSION_ID}", params["success_url"]
      assert_equal "#{ORIGIN}/cart", params["cancel_url"]
      assert_equal({ "0" => { "quantity" => "2", "price_data" => { "currency" => "gbp", "unit_amount" => "1200", "product_data" => { "name" => "Swim cap" } } },
                     "1" => { "quantity" => "1", "price_data" => { "currency" => "gbp", "unit_amount" => "2450", "product_data" => { "name" => "Tow float" } } } }, params["line_items"])
      assert_equal 3, cart_cookie.size, "the cart is kept: a visitor who leaves Stripe's page comes back to it"
      assert_equal order.id, cart_mark, "and marked with its checkout"
    end
  end

  test "a checkout that cannot be made says why on the cart's page, and keeps no order: not set up, nothing for sale, Stripe refusing" do
    cart_post("/cart/items", { "entry" => @cap.id.to_s })
    assert_no_difference -> { Order.count } do
      cart_post("/cart/checkout")
    end
    assert_response :service_unavailable
    assert_select "main p[role=alert]", "Checkout is not open on this site yet: nothing can be paid for now."
    get "/cart"
    assert_select "form[action='/cart/checkout']", 0, "no button while checkout is not set up"

    with_stripe do |stripe|
      stripe.fail_next
      assert_no_difference -> { Order.count } do
        cart_post("/cart/checkout")
      end
      assert_response :bad_gateway
      assert_select "main p[role=alert]", /Checkout could not start/
      assert_equal 1, stripe.calls.size, "Stripe was asked once"

      cart_post("/cart/items/#{@cap.id}", { "quantity" => "0" })
      assert_no_difference -> { Order.count } do
        cart_post("/cart/checkout")
      end
      assert_response :conflict
      assert_select "main p[role=alert]", "Nothing in your cart can be bought now, so there is nothing to check out."
      assert_equal 1, stripe.calls.size, "and not asked for an empty cart"
    end
  end

  test "a session whose page is not on the checkout's own origin sends no visitor there, and keeps no order" do
    with_stripe do |stripe|
      cart_post("/cart/items", { "entry" => @cap.id.to_s })
      stripe.page_origin = "https://elsewhere.example"
      assert_no_difference -> { Order.count } do
        cart_post("/cart/checkout")
      end
      assert_response :bad_gateway
      assert_nil response.location
      assert_equal 1, stripe.sessions.size, "Stripe was asked, and its answer refused"
    end
  end

  test "the thanks page asks Stripe: paid, the order is kept as paid with the buyer's email and the cart emptied; not paid yet, or expired, it says so and keeps the cart" do
    with_stripe do |stripe|
      cart_post("/cart/items", { "entry" => @cap.id.to_s, "quantity" => "2" })
      cart_post("/cart/checkout")
      order = Order.last

      get "/cart/thanks", params: { "session_id" => order.stripe_session_id }
      assert_response :ok
      assert_private "the thanks page"
      assert_select "h1", "Not paid yet"
      assert_equal "open", order.reload.status
      assert_equal 1, cart_cookie.size
      assert_equal order.id, cart_mark, "the mark stays while the order is open"

      stripe.pay(order.stripe_session_id, email: "ann@example.org")
      travel_to Time.utc(2026, 10, 16, 11, 30) do
        get "/cart/thanks", params: { "session_id" => order.stripe_session_id }
      end
      assert_response :ok
      assert_select "h1", "Thank you"
      assert_select "main p", "Your order is paid: £24.00."
      assert_equal [ "paid", "ann@example.org", Time.utc(2026, 10, 16, 11, 30) ], order.reload.values_at(:status, :email, :paid_at)
      assert_match(/\Acart=;.*max-age=0/i, set_cookies.find { |line| line.start_with?("cart=") }, "the cart is emptied")

      asked = stripe.calls.size
      get "/cart/thanks", params: { "session_id" => order.stripe_session_id }
      assert_select "h1", "Thank you"
      assert_equal asked, stripe.calls.size, "a paid order is not asked about again"

      cart_post("/cart/items", { "entry" => @float.id.to_s })
      cart_post("/cart/checkout")
      left = Order.last
      stripe.expire(left.stripe_session_id)
      get "/cart/thanks", params: { "session_id" => left.stripe_session_id }
      assert_select "h1", "Not paid"
      assert_equal "expired", left.reload.status
      assert_equal [ [ @float.id, 1 ] ], cart_cookie, "the cart is as it was left"
      assert_nil cart_mark, "and rid of the mark of a checkout settled"
    end
  end

  test "paid, the cart loses exactly what its checkout took, once: a line the checkout left out, a product put in since and more of one stay" do
    with_stripe do |stripe|
      gloves = product(@shop, "Winter gloves", "gloves", price: 9)
      cart_post("/cart/items", { "entry" => @cap.id.to_s, "quantity" => "2" })
      cart_post("/cart/items", { "entry" => gloves.id.to_s })
      Entry.save_checked!(@shop, gloves.id, revision: gloves.revision, save_id: "out", entry: { "title" => "Winter gloves", "slug" => "gloves", "values" => { "price" => 9, "in-stock" => false } })
      gloves.reload.publish!
      cart_post("/cart/checkout")
      order = Order.last
      assert_equal [ [ @cap.id, 2 ] ], order.lines.map { |line| [ line["entryId"], line["quantity"] ] }, "the gloves, out of stock, left out"
      assert_equal order.id, cart_mark

      cart_post("/cart/items", { "entry" => @float.id.to_s })
      cart_post("/cart/items", { "entry" => @cap.id.to_s })
      assert_equal order.id, cart_mark, "a change of the cart keeps the mark"
      stripe.pay(order.stripe_session_id)
      get "/cart/thanks", params: { "session_id" => order.stripe_session_id }
      assert_select "h1", "Thank you"
      assert_equal [ [ @cap.id, 1 ], [ gloves.id, 1 ], [ @float.id, 1 ] ], cart_cookie, "two caps taken, the rest kept"
      assert_nil cart_mark, "the mark is gone"

      get "/cart/thanks", params: { "session_id" => order.stripe_session_id }
      assert_select "h1", "Thank you"
      assert_empty set_cookies, "a second visit changes nothing"
      assert_equal [ [ @cap.id, 1 ], [ gloves.id, 1 ], [ @float.id, 1 ] ], cart_cookie
    end
  end

  test "an old receipt opened again keeps the cart filled since, and one opened by another visitor leaves theirs alone" do
    with_stripe do |stripe|
      cart_post("/cart/items", { "entry" => @cap.id.to_s })
      cart_post("/cart/checkout")
      order = Order.last
      stripe.pay(order.stripe_session_id)
      receipt = "/cart/thanks?session_id=#{order.stripe_session_id}"
      get receipt
      assert_empty cart_kept, "the cart rid of what the order took, and of its mark"

      cart_post("/cart/items", { "entry" => @cap.id.to_s, "quantity" => "3" })
      get receipt
      assert_select "h1", "Thank you"
      assert_empty set_cookies
      assert_equal [ [ @cap.id, 3 ] ], cart_cookie, "the cart filled since is kept"

      other = open_session
      other.post "/cart/items", params: { "entry" => @cap.id.to_s, "quantity" => "2" }, headers: { "Origin" => ORIGIN }
      assert_equal 303, other.response.status
      other.get receipt
      assert_equal 200, other.response.status
      assert_empty Array(other.response.headers["Set-Cookie"]).grep(/\Acart=/), "another visitor's cart is left alone"
    end
  end

  test "an order of nothing to pay: its session completes needing no payment, and the order settles as paid" do
    with_stripe do |stripe|
      sticker = product(@shop, "Club sticker", "sticker", price: 0)
      cart_post("/cart/items", { "entry" => sticker.id.to_s, "quantity" => "2" })
      cart_post("/cart/checkout")
      order = Order.last
      assert_equal 0, order.total
      stripe.pay(order.stripe_session_id, email: "bo@example.org")
      assert_equal [ "complete", "no_payment_required" ], stripe.sessions.last.values_at("status", "payment_status")
      get "/cart/thanks", params: { "session_id" => order.stripe_session_id }
      assert_select "h1", "Thank you"
      assert_select "main p", "Your order is confirmed: there was nothing to pay."
      assert_equal [ "paid", "bo@example.org" ], order.reload.values_at(:status, :email)
      assert_empty cart_kept, "the cart rid of it"
    end
  end

  test "a session completed by a payment still to come keeps its order open, the cart and its mark as they are" do
    with_stripe do |stripe|
      cart_post("/cart/items", { "entry" => @cap.id.to_s })
      cart_post("/cart/checkout")
      order = Order.last
      stripe.complete_unpaid(order.stripe_session_id)
      get "/cart/thanks", params: { "session_id" => order.stripe_session_id }
      assert_select "h1", "Not paid yet"
      assert_equal "open", order.reload.status
      assert_equal [ [ [ @cap.id, 1 ] ], order.id ], [ cart_cookie, cart_mark ]
    end
  end

  test "a thanks page Stripe cannot be asked for says so, and keeps the order open; one of no order of the site's is the 404 page" do
    with_stripe do |stripe|
      cart_post("/cart/items", { "entry" => @cap.id.to_s })
      cart_post("/cart/checkout")
      order = Order.last
      stripe.pay(order.stripe_session_id)
      stripe.fail_next
      get "/cart/thanks", params: { "session_id" => order.stripe_session_id }
      assert_response :bad_gateway
      assert_select "h1", "Not known yet"
      assert_equal "open", order.reload.status

      [ "cs_test_NoOrderHasThis", "cs_live_#{order.stripe_session_id.delete_prefix('cs_test_')}", "x", "" ].each do |id|
        get "/cart/thanks", params: { "session_id" => id }
        assert_response :not_found, id
      end
      get "/cart/thanks"
      assert_response :not_found
      get "/cart/thanks?session_id[]=#{order.stripe_session_id}"
      assert_response :not_found
    end
  end

  test "the checkout is counted as a visitor's forms are: the eleventh from one address in ten minutes is refused, and one refused for its Origin is not counted" do
    with_stripe do
      cart_post("/cart/items", { "entry" => @cap.id.to_s })
      11.times { cart_post("/cart/checkout", {}, origin: "https://other.example") }
      assert_response :forbidden
      10.times do |n|
        cart_post("/cart/checkout")
        assert_response :see_other, "checkout #{n + 1}"
      end
      cart_post("/cart/checkout")
      assert_response :too_many_requests
      assert_equal "600", response.headers["Retry-After"]
      assert_select "main p[role=alert]", /Too many checkouts/
      cart_post("/cart/items", { "entry" => @float.id.to_s })
      assert_response :see_other, "a product put in is not counted"
    end
  end

  test "the cart's page lets its forms go to Stripe's page, which the checkout's 303 leads to, and nowhere else" do
    get "/cart"
    assert_match(/form-action 'self';/, response.headers["Content-Security-Policy"], "no checkout set up: its own forms only")
    with_stripe do |stripe|
      get "/cart"
      assert_match(/form-action 'self' #{Regexp.escape(stripe.origin)};/, response.headers["Content-Security-Policy"])
      cart_post("/cart/items", { "entry" => "x" })
      assert_match(/form-action 'self' #{Regexp.escape(stripe.origin)};/, response.headers["Content-Security-Policy"], "a cart drawn again holds the checkout's form too")
    end
    assert_equal "https://checkout.stripe.com", StripeSettings.new(key: FakeStripe::KEY, base: nil, network: true).checkout_origin
  end

  test "the key is never written in the log, nor one a request carries" do
    log = StringIO.new
    saved = ActionController::Base.logger
    ActionController::Base.logger = ActiveSupport::Logger.new(log)
    with_stripe do |stripe|
      cart_post("/cart/items", { "entry" => @cap.id.to_s, "note" => "my key is #{FakeStripe::KEY}" })
      cart_post("/cart/checkout")
      stripe.pay(Order.last.stripe_session_id)
      get "/cart/thanks", params: { "session_id" => Order.last.stripe_session_id }
      cart_post("/cart/items", { "entry" => @cap.id.to_s })
      stripe.fail_next
      cart_post("/cart/checkout")
      assert_response :bad_gateway
    end
    assert_match(/my key is \[FILTERED\]/, log.string, "the parameters were logged, the key filtered")
    assert_match(/no session from Stripe/, log.string)
    assert_not_includes log.string, FakeStripe::KEY
  ensure
    ActionController::Base.logger = saved
  end

  test "with forgery protection on, as in production, the cart's writes need no token and set no session: the cart's cookie alone" do
    before = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    with_stripe do
      cart_post("/cart/items", { "entry" => @cap.id.to_s })
      assert_response :see_other
      assert_equal [ "cart" ], set_cookies.map { |line| line.split("=").first }
      get "/cart"
      assert_empty set_cookies
      assert_empty html.css("input[name=authenticity_token], meta[name=csrf-token]")
      cart_post("/cart/checkout")
      assert_response :see_other
      assert_equal [ "cart" ], set_cookies.map { |line| line.split("=").first }
    end
  ensure
    ActionController::Base.allow_forgery_protection = before
  end

  test "a published page still sets no cookie and is cached as before, whatever the cart holds" do
    page = create_page(title: "Shop", slug: "shop")
    page.publish!
    cart_post("/cart/items", { "entry" => @cap.id.to_s })
    get "/shop"
    assert_response :ok
    assert_nil response.headers["Set-Cookie"]
    assert_equal "max-age=0, public, must-revalidate", response.headers["Cache-Control"]
  end
end
