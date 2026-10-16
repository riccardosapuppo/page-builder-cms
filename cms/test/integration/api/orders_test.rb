require "test_helper"

# The orders through the API (Api::OrdersController): every one, the
# newest first; one; and one asked again of Stripe (the tests' fake), for
# the visitor who never came back to the thanks page. And what an order
# keeps of what Stripe says (Order#settle!).
class OrdersApiTest < ActionDispatch::IntegrationTest
  include ShopRequests

  LINES = [ { "entryId" => 4, "title" => "Swim cap <b>bright</b>", "unitAmount" => 1200, "quantity" => 2 } ].freeze

  setup do
    SubmissionsController::LIMIT_STORE.clear
    @shop = products_collection
    @cap = product(@shop, "Swim cap", "swim-cap", price: 12)
    open_shop(@shop)
  end

  # An order checked out by a visitor, through the cart, at the fake.
  def checked_out(quantity: "1")
    cart_post("/cart/items", { "entry" => @cap.id.to_s, "quantity" => quantity })
    cart_post("/cart/checkout")
    assert_response :see_other
    Order.last
  end

  test "the orders, the newest first, each whole; one read alone; none kept by a cache; a title's markup kept as text" do
    api(:get, "/api/orders")
    assert_response :ok
    assert_equal({ "orders" => [] }, json)
    first = travel_to(Time.utc(2026, 10, 16, 9)) { Order.create!(status: "open", currency: "GBP", lines: LINES, total: 2400, stripe_session_id: "cs_test_First") }
    second = travel_to(Time.utc(2026, 10, 16, 10)) { Order.create!(status: "paid", currency: "EUR", lines: LINES, total: 2400, stripe_session_id: "cs_test_Second", email: "ann@example.org", paid_at: Time.current) }

    api(:get, "/api/orders")
    assert_equal [ second.id, first.id ], json["orders"].map { |o| o["id"] }
    assert_equal({
      "id" => second.id, "status" => "paid", "currency" => "EUR", "lines" => LINES, "total" => 2400, "stripeSessionId" => "cs_test_Second",
      "email" => "ann@example.org", "paidAt" => "2026-10-16T10:00:00.000Z", "createdAt" => "2026-10-16T10:00:00.000Z", "updatedAt" => "2026-10-16T10:00:00.000Z"
    }, json["orders"].first)
    assert_equal "no-store", response.headers["Cache-Control"]
    assert_not_includes response.body, "<b>", "markup is escaped in the JSON"

    api(:get, "/api/orders/#{first.id}")
    assert_response :ok
    assert_equal [ first.id, "open", nil ], json.values_at("id", "status", "email")
    api(:get, "/api/orders/987654")
    assert_response :not_found
    assert_equal "no-store", response.headers["Cache-Control"]
    api(:get, "/api/orders/x1")
    assert_response :not_found
  end

  test "an open order asked again is kept as Stripe says it is: still open, then paid with the buyer's email and when the CMS learned it" do
    with_stripe do |stripe|
      order = checked_out(quantity: "2")
      api(:post, "/api/orders/#{order.id}/refresh")
      assert_response :ok
      assert_equal [ "open", nil, nil ], json.values_at("status", "email", "paidAt")

      stripe.pay(order.stripe_session_id, email: "bo@example.org")
      travel_to Time.utc(2026, 10, 16, 12) do
        api(:post, "/api/orders/#{order.id}/refresh")
      end
      assert_equal [ "paid", "bo@example.org", "2026-10-16T12:00:00.000Z" ], json.values_at("status", "email", "paidAt")
      assert_equal "paid", order.reload.status

      asked = stripe.calls.size
      api(:post, "/api/orders/#{order.id}/refresh")
      assert_response :ok
      assert_equal "paid", json["status"]
      assert_equal asked, stripe.calls.size, "an order that is not open is answered as it is, Stripe not asked"
    end
  end

  test "an open order of nothing to pay, its session complete needing no payment, is kept as paid when asked again" do
    with_stripe do |stripe|
      free = product(@shop, "Club sticker", "sticker", price: 0)
      cart_post("/cart/items", { "entry" => free.id.to_s })
      cart_post("/cart/checkout")
      order = Order.last
      stripe.pay(order.stripe_session_id, email: "bo@example.org")
      api(:post, "/api/orders/#{order.id}/refresh")
      assert_equal [ "paid", 0, "bo@example.org" ], json.values_at("status", "total", "email")
    end
  end

  test "an open order whose session expired is kept as expired" do
    with_stripe do |stripe|
      order = checked_out
      stripe.expire(order.stripe_session_id)
      api(:post, "/api/orders/#{order.id}/refresh")
      assert_equal [ "expired", nil, nil ], json.values_at("status", "email", "paidAt")
    end
  end

  test "an open order cannot be asked about while checkout is not set up, nor while Stripe fails, and nothing changes; one not open needs no Stripe" do
    order = Order.create!(status: "open", currency: "GBP", lines: LINES, total: 2400, stripe_session_id: "cs_test_Open")
    api(:post, "/api/orders/#{order.id}/refresh")
    assert_response :conflict
    assert_equal "checkout_not_set_up", json["error"]
    assert_equal "Checkout is not set up on this CMS: #{StripeSettings::REASONS[:no_key]}", json["message"]
    paid = Order.create!(status: "paid", currency: "GBP", lines: LINES, total: 2400, stripe_session_id: "cs_test_Paid", paid_at: Time.current)
    api(:post, "/api/orders/#{paid.id}/refresh")
    assert_response :ok, "an order already paid is answered as it is"

    with_stripe do |stripe|
      live = checked_out
      stripe.pay(live.stripe_session_id)
      stripe.fail_next
      api(:post, "/api/orders/#{live.id}/refresh")
      assert_response :bad_gateway
      assert_equal "stripe_failed", json["error"]
      assert_match "Stripe could not be asked about this order, and nothing changed: Stripe answered 500", json["message"]
      assert_equal "open", live.reload.status
    end
    api(:post, "/api/orders/987654/refresh")
    assert_response :not_found
  end

  test "an order's refresh is a write: from another site it is refused, and not as JSON neither" do
    order = Order.create!(status: "paid", currency: "GBP", lines: LINES, total: 2400, stripe_session_id: "cs_test_Paid", paid_at: Time.current)
    post "/api/orders/#{order.id}/refresh", headers: { "Origin" => "https://other.example", "CONTENT_TYPE" => "application/json" }
    assert_response :forbidden
    post "/api/orders/#{order.id}/refresh", headers: { "CONTENT_TYPE" => "text/plain" }
    assert_response :unsupported_media_type
  end

  test "what a session says of an order is kept only when it is that order's own: its id, its reference, its amount and currency" do
    order = Order.create!(status: "open", currency: "GBP", lines: LINES, total: 2400, stripe_session_id: "cs_test_Ours")
    paid = { "id" => "cs_test_Ours", "client_reference_id" => order.id.to_s, "amount_total" => 2400, "currency" => "gbp", "status" => "complete", "payment_status" => "paid", "customer_details" => { "email" => "ann@example.org" } }
    [ paid.merge("id" => "cs_test_Theirs"), paid.merge("client_reference_id" => "999"), paid.merge("amount_total" => 1), paid.merge("currency" => "eur"), nil, [] ].each do |session|
      assert_equal "open", order.settle!(session).status, session.inspect
    end
    assert_equal "open", order.settle!(paid.merge("payment_status" => "unpaid", "status" => "complete")).status, "complete but unpaid stays open"
    assert_equal "open", order.settle!(paid.merge("status" => "open")).status, "paid but not complete stays open"
    assert_equal [ "paid", "ann@example.org" ], order.settle!(paid).values_at(:status, :email)

    free = Order.create!(status: "open", currency: "GBP", lines: LINES.map { |line| line.merge("unitAmount" => 0) }, total: 0, stripe_session_id: "cs_test_Free")
    nothing = paid.merge("id" => "cs_test_Free", "client_reference_id" => free.id.to_s, "amount_total" => 0, "payment_status" => "no_payment_required")
    assert_equal "paid", free.settle!(nothing).status, "a complete session that needed no payment settles as paid"
    assert_equal "paid", order.settle!(paid.merge("status" => "expired", "payment_status" => "unpaid")).status, "a paid order stays paid"

    long = Order.create!(status: "open", currency: "GBP", lines: LINES, total: 2400, stripe_session_id: "cs_test_Long")
    assert_nil long.settle!(paid.merge("id" => "cs_test_Long", "client_reference_id" => long.id.to_s, "customer_details" => { "email" => "#{'a' * 250}@example.org" })).email, "an email longer than any is not kept"
  end

  test "the database holds an order to its statuses, a paid one to when, and its currency to the list" do
    assert_raises(ActiveRecord::StatementInvalid) { Order.insert!({ status: "refunded", currency: "GBP", lines: LINES, total: 1, created_at: Time.current, updated_at: Time.current }) }
    assert_raises(ActiveRecord::StatementInvalid) { Order.insert!({ status: "paid", currency: "GBP", lines: LINES, total: 1, created_at: Time.current, updated_at: Time.current }) }
    assert_raises(ActiveRecord::StatementInvalid) { Order.insert!({ status: "open", currency: "JPY", lines: LINES, total: 1, created_at: Time.current, updated_at: Time.current }) }
    assert_raises(ActiveRecord::StatementInvalid) { ShopSetting.insert!({ id: 1, enabled: true, currency: "GBP", created_at: Time.current, updated_at: Time.current }) }
    assert_raises(ActiveRecord::StatementInvalid) { ShopSetting.insert!({ id: 2, enabled: false, currency: "GBP", created_at: Time.current, updated_at: Time.current }) }
  end
end
