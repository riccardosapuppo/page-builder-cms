require "test_helper"

# The CMS's Stripe, against the tests' fake (FakeStripe): the settings a
# checkout needs from the environment, and the two calls, over Net::HTTP,
# as Stripe's API reads and answers them, its errors among them. Nothing
# here reaches the network.
class StripeClientTest < ActiveSupport::TestCase
  include ShopRequests

  def settings(key: FakeStripe::KEY, base: nil, network: false)
    StripeSettings.new(key: key, base: base, network: network)
  end

  test "a test key and Stripe's own address are set up where the network is, and the fake's address anywhere" do
    assert settings(base: nil, network: true).ready?, "Stripe's API by default"
    assert_equal "https://api.stripe.com", settings(base: nil, network: true).base
    assert settings(base: "https://api.stripe.com", network: true).ready?
    assert_equal "https://checkout.stripe.com", settings(base: nil, network: true).checkout_origin
    local = settings(base: "http://127.0.0.1:4567")
    assert local.ready?
    assert_equal "http://127.0.0.1:4567", local.checkout_origin
    assert settings(key: "rk_test_ARestrictedKey0", base: "http://127.0.0.1:1").ready?
  end

  test "anything else is not set up, and says why, naming the variables and never what they hold" do
    {
      [ nil, nil, true ] => :no_key, [ "", nil, true ] => :no_key,
      [ "sk_live_AKeyOfNoOne000", nil, true ] => :live_key, [ "rk_live_AKeyOfNoOne000", nil, true ] => :live_key,
      [ "pk_test_AKeyOfNoOne000", nil, true ] => :publishable_key, [ "pk_live_AKeyOfNoOne000", nil, true ] => :publishable_key,
      [ "sk_test_", nil, true ] => :other_key, [ "sk_test_a-b", nil, true ] => :other_key, [ "sk_test_a\nb", nil, true ] => :other_key, [ "SK_TEST_abc", nil, true ] => :other_key,
      [ FakeStripe::KEY, "http://api.stripe.com", true ] => :base, [ FakeStripe::KEY, "https://api.stripe.com/", true ] => :base,
      [ FakeStripe::KEY, "https://evil.example", true ] => :base, [ FakeStripe::KEY, "http://127.0.0.1:65536", true ] => :base,
      [ FakeStripe::KEY, "http://127.0.0.1:0", true ] => :base, [ FakeStripe::KEY, "http://127.0.0.1", true ] => :base,
      [ FakeStripe::KEY, "http://127.0.0.1.example:80", true ] => :base,
      [ FakeStripe::KEY, nil, false ] => :no_network, [ FakeStripe::KEY, "https://api.stripe.com", false ] => :no_network
    }.each do |(key, base, network), reason|
      found = StripeSettings.new(key: key, base: base, network: network)
      assert_not found.ready?, [ key, base, network ].inspect
      assert_equal StripeSettings::REASONS.fetch(reason), found.reason, [ key, base, network ].inspect
      assert_nil found.key, "no key is given out when checkout is not set up"
      assert_nil found.checkout_origin
    end
    StripeSettings::REASONS.each_value { |words| assert_no_match StripeClient::KEY_SHAPE, words }
  end

  test "the settings are read from the environment when asked, and their inspect never shows the key" do
    with_stripe do |_stripe, server|
      found = StripeSettings.current
      assert found.ready?
      assert_equal server.url, found.base
      assert_equal FakeStripe::KEY, found.key
      assert_not_includes found.inspect, FakeStripe::KEY
      assert_not_includes found.to_s, FakeStripe::KEY
      assert_not_includes StripeClient.new(found).inspect, FakeStripe::KEY
    end
    assert_not StripeSettings.current.ready?, "and gone with the environment's"
  end

  test "a client is made only for checkout that is set up" do
    error = assert_raises(ArgumentError) { StripeClient.new(settings(key: nil)) }
    assert_match "STRIPE_SECRET_KEY is not set", error.message
  end

  test "nested parameters are form encoded as Stripe reads them, in their order" do
    encoded = StripeClient.form("mode" => "payment", "line_items" => [ { "quantity" => 2, "price_data" => { "currency" => "gbp", "unit_amount" => 1200, "product_data" => { "name" => "Swim cap & float" } } } ], "success_url" => "http://x/cart/thanks?session_id={CHECKOUT_SESSION_ID}")
    assert_equal "mode=payment&line_items%5B0%5D%5Bquantity%5D=2&line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=gbp&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=1200&line_items%5B0%5D%5Bprice_data%5D%5Bproduct_data%5D%5Bname%5D=Swim+cap+%26+float&success_url=http%3A%2F%2Fx%2Fcart%2Fthanks%3Fsession_id%3D%7BCHECKOUT_SESSION_ID%7D", encoded
    assert_equal({ "mode" => "payment", "line_items" => { "0" => { "quantity" => "2", "price_data" => { "currency" => "gbp", "unit_amount" => "1200", "product_data" => { "name" => "Swim cap & float" } } } }, "success_url" => "http://x/cart/thanks?session_id={CHECKOUT_SESSION_ID}" }, Rack::Utils.parse_nested_query(encoded))
  end

  test "a session made, and retrieved as it is then: open, then paid with the buyer's email, as Stripe answers" do
    with_stripe do |stripe|
      client = StripeClient.new
      made = client.create_checkout_session("mode" => "payment", "client_reference_id" => "7", "success_url" => "http://x/thanks", "cancel_url" => "http://x/cart",
                                            "line_items" => [ { "quantity" => 2, "price_data" => { "currency" => "gbp", "unit_amount" => 1200, "product_data" => { "name" => "Swim cap" } } } ])
      assert_match Order::SESSION_ID, made["id"]
      assert_equal [ "open", "unpaid", 2400, "gbp", "7" ], made.values_at("status", "payment_status", "amount_total", "currency", "client_reference_id")
      assert_equal "#{stripe.origin}/c/pay/#{made['id']}", made["url"]
      method, path, params = stripe.calls.last
      assert_equal [ "POST", "/v1/checkout/sessions" ], [ method, path ]
      assert_equal "Swim cap", params.dig("line_items", "0", "price_data", "product_data", "name")

      assert_equal made, client.retrieve_checkout_session(made["id"])
      stripe.pay(made["id"], email: "ann@example.org")
      paid = client.retrieve_checkout_session(made["id"])
      assert_equal [ "complete", "paid", "ann@example.org" ], [ paid["status"], paid["payment_status"], paid.dig("customer_details", "email") ]
      assert_equal [ "GET", "/v1/checkout/sessions/#{made['id']}" ], stripe.calls.last.first(2)
    end
  end

  test "Stripe's errors are raised with their status and type, its words kept and any key scrubbed from them" do
    with_stripe do |stripe|
      client = StripeClient.new
      missing = assert_raises(StripeClient::Failed) { client.retrieve_checkout_session("cs_test_NoSuchSession") }
      assert_equal [ 404, "invalid_request_error" ], [ missing.status, missing.type ]
      assert_equal "Stripe answered 404: No such checkout.session: 'cs_test_NoSuchSession'", missing.message

      refused = assert_raises(StripeClient::Failed) { client.create_checkout_session("mode" => "payment") }
      assert_equal [ 400, "Stripe answered 400: Missing required param: success_url." ], [ refused.status, refused.message ]

      stripe.fail_next
      failed = assert_raises(StripeClient::Failed) { client.retrieve_checkout_session("cs_test_Any") }
      assert_equal [ 500, "api_error" ], [ failed.status, failed.type ]

      ENV["STRIPE_SECRET_KEY"] = "sk_test_NotTheFakesKey"
      wrong = assert_raises(StripeClient::Failed) { StripeClient.new.retrieve_checkout_session("cs_test_Any") }
      assert_equal 401, wrong.status
      assert_match "Invalid API Key provided: [FILTERED]", wrong.message
      assert_no_match(/NotTheFakes|FakesKey/, wrong.message)
    end
  end

  test "a Stripe no one answers at is a failure with no status" do
    port = TCPServer.open("127.0.0.1", 0).then { |socket| socket.addr[1].tap { socket.close } }
    client = StripeClient.new(settings(base: "http://127.0.0.1:#{port}"))
    failed = assert_raises(StripeClient::Failed) { client.retrieve_checkout_session("cs_test_Any") }
    assert_nil failed.status
    assert_match "Stripe could not be reached", failed.message
  end

  test "the key travels in the Authorization header alone, never in the address or the body" do
    with_stripe do |stripe|
      seen = []
      spy = ->(env) { seen << env.slice("PATH_INFO", "QUERY_STRING", "HTTP_AUTHORIZATION").merge("body" => env["rack.input"].read.tap { env["rack.input"].rewind }) }
      stripe.define_singleton_method(:call) { |env| spy.(env) && super(env) }
      StripeClient.new.create_checkout_session("mode" => "payment", "success_url" => "http://x", "line_items" => [ { "quantity" => 1, "price_data" => { "currency" => "gbp", "unit_amount" => 1, "product_data" => { "name" => "A" } } } ])
      assert_equal "Bearer #{FakeStripe::KEY}", seen.last["HTTP_AUTHORIZATION"]
      assert_not_includes seen.last.values_at("PATH_INFO", "QUERY_STRING", "body").join(" "), FakeStripe::KEY
    end
  end
end
