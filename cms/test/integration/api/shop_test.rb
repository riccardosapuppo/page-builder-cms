require "test_helper"

# The shop's settings through the API (Api::ShopsController): off by
# default, changed whole and held to the shop's rules, each fault at its
# member; whether checkout is set up, and why not, never the key; and what
# the settings name staying as it is while they name it.
class ShopApiTest < ActionDispatch::IntegrationTest
  include ShopRequests

  test "a new site's shop is off, in pounds, with no collection, never changed, and its checkout not set up for want of a key" do
    api(:get, "/api/shop")
    assert_response :ok
    assert_equal({ "enabled" => false, "currency" => "GBP", "productsCollectionId" => nil, "priceField" => nil, "updatedAt" => nil }, json.except("checkout"))
    assert_equal({ "ready" => false, "reason" => StripeSettings::REASONS[:no_key] }, json["checkout"])
    assert_nil ShopSetting.find_by(id: ShopSetting::ID), "a read makes no row"
  end

  test "the settings change whole, are read back as changed, and a change that changes nothing keeps its time" do
    shop = products_collection
    settings = { "enabled" => true, "currency" => "EUR", "productsCollectionId" => shop.id, "priceField" => "price" }
    travel_to Time.utc(2026, 10, 16, 9, 0) do
      api(:put, "/api/shop", settings)
    end
    assert_response :ok
    assert_equal settings.merge("updatedAt" => "2026-10-16T09:00:00.000Z"), json.except("checkout")
    travel_to Time.utc(2026, 10, 16, 10, 0) do
      api(:put, "/api/shop", settings)
    end
    assert_equal "2026-10-16T09:00:00.000Z", json["updatedAt"], "nothing changed"
    api(:get, "/api/shop")
    assert_equal settings, json.slice(*settings.keys)

    api(:put, "/api/shop", settings.merge("enabled" => false, "productsCollectionId" => nil, "priceField" => nil))
    assert_response :ok
    assert_equal [ false, nil, nil ], ShopSetting.current.then { |s| [ s.enabled, s.products_collection_id, s.price_field ] }
  end

  test "settings the shop's rules refuse are refused at each member, all at once, and nothing changes" do
    news = Collection.create_with_template!({ "name" => "News", "prefix" => "news", "fields" => [ { "key" => "summary", "label" => "Summary", "type" => "paragraph", "required" => false } ], "sort" => { "by" => "title", "direction" => "asc" } })
    shop = products_collection
    api(:put, "/api/shop", { "enabled" => "yes", "currency" => "JPY", "productsCollectionId" => news.id, "priceField" => "summary", "taxes" => 0 })
    assert_response :unprocessable_content
    assert_equal "invalid_request", json["error"]
    assert_equal [ [ "/taxes", "additionalProperties" ], [ "/enabled", "type" ], [ "/currency", "enum" ], [ "/productsCollectionId", "numberField" ] ], error_pointers

    api(:put, "/api/shop", { "enabled" => true, "currency" => "GBP", "productsCollectionId" => shop.id, "priceField" => "summary" })
    assert_equal [ [ "/priceField", "priceField" ] ], error_pointers
    assert_equal "The collection Products has no number field \"summary\".", json["errors"].first["message"]
    api(:put, "/api/shop", { "enabled" => true, "currency" => "GBP", "productsCollectionId" => 987_654, "priceField" => nil })
    assert_equal [ [ "/productsCollectionId", "collectionExists" ], [ "/priceField", "required" ] ], error_pointers
    api(:put, "/api/shop", {})
    assert_equal %w[/enabled /currency /productsCollectionId /priceField], error_pointers.map(&:first)
    api(:put, "/api/shop", [ true ])
    assert_equal [ [ "", "type" ] ], error_pointers
    assert_nil ShopSetting.find_by(id: ShopSetting::ID), "nothing was kept"
  end

  test "a collection's id written as an integral float is the id, and one past the integers both languages read exactly is no id, as the browser's twin reads them" do
    shop = products_collection
    api(:put, "/api/shop", %({"enabled": true, "currency": "GBP", "productsCollectionId": #{shop.id}.0, "priceField": "price"}))
    assert_response :ok
    assert_equal shop.id, json["productsCollectionId"]
    assert_equal shop.id, ShopSetting.current.products_collection_id
    api(:put, "/api/shop", %({"enabled": false, "currency": "GBP", "productsCollectionId": 9007199254740993, "priceField": null}))
    assert_response :unprocessable_content
    assert_equal [ [ "/productsCollectionId", "type" ] ], error_pointers
  end

  test "whether checkout is set up: a test key and the fake's address are; no key, a live key, a publishable key, another key or another address are not, each saying why, and the key is never answered" do
    with_stripe do |_stripe, server|
      api(:get, "/api/shop")
      assert_equal({ "ready" => true, "reason" => nil }, json["checkout"])
      assert_not_includes response.body, FakeStripe::KEY

      {
        "sk_live_NotAKeyOfAnyone0000" => :live_key, "rk_live_NotAKeyOfAnyone0000" => :live_key, "pk_test_NotAKeyOfAnyone0000" => :publishable_key,
        "sk_test_has space" => :other_key, "whsec_NotAKeyOfAnyone0000" => :other_key, "" => :no_key
      }.each do |key, reason|
        ENV["STRIPE_SECRET_KEY"] = key
        api(:get, "/api/shop")
        assert_equal({ "ready" => false, "reason" => StripeSettings::REASONS.fetch(reason) }, json["checkout"], key)
        assert_not_includes response.body, key, "the key is never answered" unless key.empty?
      end
      ENV["STRIPE_SECRET_KEY"] = "rk_test_ARestrictedFake"
      api(:get, "/api/shop")
      assert json.dig("checkout", "ready"), "a restricted key of the test mode"

      # The tests reach no network: Stripe's own address is refused here,
      # and any other.
      [ "https://api.stripe.com", "http://localhost:#{URI(server.url).port}", "https://127.0.0.1:443", "http://127.0.0.1:70000", "http://127.0.0.1:3901/v1" ].each do |base|
        ENV["STRIPE_API_BASE"] = base
        api(:get, "/api/shop")
        assert_equal({ "ready" => false, "reason" => StripeSettings::REASONS[:no_network] }, json["checkout"], base)
      end
    end
  end

  test "the collection the settings name is not deleted, on or off, and goes once they name another" do
    shop = products_collection
    other = products_collection(prefix: "goods")
    open_shop(shop)
    api(:delete, "/api/collections/#{shop.id}")
    assert_response :conflict
    assert_equal "collection_in_shop", json["error"]
    assert_match "The shop sells from this collection", json["message"]
    assert Collection.exists?(shop.id)

    ShopSetting.change!({ "enabled" => false, "currency" => "GBP", "productsCollectionId" => shop.id, "priceField" => nil })
    api(:delete, "/api/collections/#{shop.id}")
    assert_response :conflict, "off, the settings still name it"

    ShopSetting.change!({ "enabled" => true, "currency" => "GBP", "productsCollectionId" => other.id, "priceField" => "price" })
    api(:delete, "/api/collections/#{shop.id}")
    assert_response :no_content
    assert_not Collection.exists?(shop.id)
  end

  test "the database refuses the delete too, should the model's check be passed by" do
    shop = products_collection
    open_shop(shop)
    assert_raises(ActiveRecord::InvalidForeignKey) { Collection.where(id: shop.id).delete_all }
  end

  test "the price field the settings name neither goes nor changes its type; another field may, and so may it once the settings name another" do
    shop = products_collection
    open_shop(shop)
    fields = shop.fields
    api(:patch, "/api/collections/#{shop.id}", { "fields" => fields.reject { |f| f["key"] == "price" } })
    assert_response :unprocessable_content
    assert_equal [ [ "/fields", "shopPrice" ] ], error_pointers
    assert_equal "The shop's price is the number field \"price\": keep it, or choose another price in the shop's settings first.", json["errors"].first["message"]

    api(:patch, "/api/collections/#{shop.id}", { "fields" => fields.map { |f| f["key"] == "price" ? f.except("min", "max").merge("type" => "text") : f } })
    assert_equal [ [ "/fields/1/type", "shopPrice" ] ], error_pointers
    assert_equal fields, shop.reload.fields, "nothing changed"

    api(:patch, "/api/collections/#{shop.id}", { "fields" => fields.reject { |f| f["key"] == "summary" } })
    assert_response :ok
    fee = { "key" => "fee", "label" => "Fee", "type" => "number", "required" => false }
    api(:patch, "/api/collections/#{shop.id}", { "fields" => shop.reload.fields + [ fee ] })
    ShopSetting.change!({ "enabled" => true, "currency" => "GBP", "productsCollectionId" => shop.id, "priceField" => "fee" })
    api(:patch, "/api/collections/#{shop.id}", { "fields" => shop.reload.fields.reject { |f| f["key"] == "price" } })
    assert_response :ok, "the price is the fee now"
  end

  test "cart is a page's address the application answers itself, and a prefix no collection takes" do
    api(:post, "/api/pages", { "title" => "Cart", "slug" => "cart" })
    assert_response :unprocessable_content
    assert_equal [ [ "/slug", "reserved" ] ], error_pointers
    api(:post, "/api/collections", { "name" => "Cart", "prefix" => "cart", "fields" => [], "sort" => { "by" => "title", "direction" => "asc" } })
    assert_equal [ [ "/prefix", "reserved" ] ], error_pointers
  end
end
