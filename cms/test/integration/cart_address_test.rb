require "test_helper"

# A site upgraded from a build before the shop, which made cart a reserved
# address of a page and a reserved prefix: a page published at /cart, a
# page to be published there, a collection at the prefix cart, each
# written as that build kept it, past today's validations, as
# test/db/migrations_keep_rows_test.rb writes its rows. While the shop is
# off, /cart and the addresses below it are the site's, as before the shop
# (config/routes.rb): the page, the collection's entries; and what holds
# cart keeps it, published there again or changed. The shop is not turned
# on while anything holds cart (ShopSetting.cart_holders), the refusal at
# /enabled naming it and saying how to free it; once it is freed, the shop
# turns on and /cart is the cart. Nothing takes cart anew.
class CartAddressTest < ActionDispatch::IntegrationTest
  include CollectionCases
  include ShopRequests

  setup do
    @shop = products_collection
    @cap = product(@shop, "Swim cap", "swim-cap", price: 12)
  end

  def on = { "enabled" => true, "currency" => "GBP", "productsCollectionId" => @shop.id, "priceField" => "price" }

  def turn_on = api(:put, "/api/shop", on)

  def refusals = json.fetch("errors").map { |e| [ e["pointer"], e["keyword"], e["message"] ] }

  # A page published at /club-news, then its next address, and its live
  # one unless live: false, moved to cart past the validations, as the
  # build before the shop could keep them.
  def page_at_cart(title: "Club news", live: true)
    page = create_page(title: title, slug: "club-news")
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: title), save_id: "first")
    page.publish!
    Page.where(id: page.id).update_all(slug: "cart") if live
    Draft.where(page_id: page.id).update_all(slug: "cart")
    page.reload
  end

  # A collection of notices, its template drawing an entry's title, two of
  # its entries published, one of them at thanks; then its prefix moved to
  # cart past the validations.
  def notices_at_cart
    notices = Collection.create_with_template!(news_definition(prefix: "notices", name: "Notices"))
    template = notices.template
    title = { "id" => "t", "type" => "field", "props" => { "field" => "title", "level" => 1 }, "style" => { "base" => {} }, "children" => [] }
    Draft.save_document!(page_id: template.id, revision: template.draft.revision, document: page_document(title: "Notice", widgets: [ title ]), save_id: "t1")
    template.publish!
    Entry.create_checked!(notices, news_entry(title: "Winter pass on sale", slug: "winter-pass")).publish!
    Entry.create_checked!(notices, news_entry(title: "Thanks to our volunteers", slug: "thanks")).publish!
    Collection.where(id: notices.id).update_all(prefix: "cart")
    notices.reload
  end

  test "with the shop off, a page published at /cart before the shop is there, cached as a page is; the cart's writes find no route, and no cookie is set" do
    page_at_cart
    [ nil, on.merge("enabled" => false) ].each do |settings|
      ShopSetting.change!(settings) if settings
      get "/cart"
      assert_response :ok
      assert_select "main h1", "Club news"
      assert_equal "max-age=0, public, must-revalidate", response.headers["Cache-Control"]
      assert_nil response.headers["X-Robots-Tag"]
      assert_no_route("/cart/items", { "entry" => @cap.id.to_s })
      assert_no_route("/cart/items/#{@cap.id}", { "quantity" => "2" })
      assert_no_route("/cart/checkout")
      assert_empty set_cookies
    end
  end

  test "the shop is not turned on while a page is at /cart, the refusal naming it at the switch; once the page is published at another address, the shop turns on and /cart is the cart" do
    page = page_at_cart
    turn_on
    assert_response :unprocessable_content
    assert_equal [ [ "/enabled", "cartAddress", "The page \"Club news\" is at /cart, the address of the shop's cart: give the page another address and publish it before turning the shop on." ] ], refusals
    assert_not ShopSetting.open?
    get "/cart"
    assert_select "main h1", "Club news"

    api(:patch, "/api/pages/#{page.id}", { "slug" => "club-news" })
    assert_response :ok
    turn_on
    assert_equal [ [ "/enabled", "cartAddress", "The page \"Club news\" is at /cart, the address of the shop's cart, until it is published at its next address: publish it before turning the shop on." ] ], refusals

    api(:post, "/api/pages/#{page.id}/publish")
    assert_response :ok
    turn_on
    assert_response :ok
    get "/cart"
    assert_response :ok
    assert_select "h1", "Your cart"
    assert_equal "no-store", response.headers["Cache-Control"]
    cart_post "/cart/items", { "entry" => @cap.id.to_s }
    assert_response :see_other
    assert_equal [ [ @cap.id, 1 ] ], cart_cookie
    get "/club-news"
    assert_select "main h1", "Club news"

    # Off again, /cart is the site's: the page's old address leads to it,
    # asked again at every visit, so a browser finds the cart once the
    # shop is on again.
    ShopSetting.change!(on.merge("enabled" => false))
    get "/cart"
    assert_response :moved_permanently
    assert_equal "#{ORIGIN}/club-news", response.location
    assert_equal "no-cache", response.headers["Cache-Control"]
  end

  test "a page to be published at /cart holds it too: the shop is refused, naming it, the page is not published there, and once its next address is another the shop turns on" do
    page = page_at_cart(title: "Tide times", live: false)
    turn_on
    assert_response :unprocessable_content
    assert_equal [ [ "/enabled", "cartAddress", "The page \"Tide times\" is to be published at /cart, the address of the shop's cart: give the page another address before turning the shop on." ] ], refusals

    api(:post, "/api/pages/#{page.id}/publish")
    assert_response :unprocessable_content
    assert_equal [ [ "/slug", "reserved" ] ], error_pointers
    api(:patch, "/api/pages/#{page.id}", { "slug" => "tide-times" })
    assert_response :ok
    turn_on
    assert_response :ok
    get "/cart"
    assert_select "h1", "Your cart"
  end

  test "with the shop off, a collection at the prefix cart before the shop has its entries below /cart, thanks among them, and changes as any other; the shop is refused, naming it, and turns on once it has another prefix, which cannot go back to cart" do
    notices = notices_at_cart
    get "/cart/winter-pass"
    assert_response :ok
    assert_select "main h1", "Winter pass on sale"
    get "/cart/thanks"
    assert_response :ok
    assert_select "main h1", "Thanks to our volunteers"

    api(:patch, "/api/collections/#{notices.id}", { "name" => "Club notices" })
    assert_response :ok
    assert_equal "cart", json["prefix"]
    turn_on
    assert_response :unprocessable_content
    assert_equal [ [ "/enabled", "cartPrefix", "The collection Club notices has the prefix cart, so its entries are below /cart, the address of the shop's cart: give the collection another prefix before turning the shop on." ] ], refusals

    api(:patch, "/api/collections/#{notices.id}", { "prefix" => "notices" })
    assert_response :ok
    turn_on
    assert_response :ok
    get "/cart"
    assert_select "h1", "Your cart"
    get "/notices/thanks"
    assert_select "main h1", "Thanks to our volunteers"
    get "/cart/winter-pass"
    assert_response :not_found

    api(:patch, "/api/collections/#{notices.id}", { "prefix" => "cart" })
    assert_response :unprocessable_content
    assert_equal [ [ "/prefix", "reserved" ] ], error_pointers
  end

  test "every page and collection that holds cart is named at once, the pages first, and nothing is kept" do
    notices_at_cart
    page_at_cart
    turn_on
    assert_response :unprocessable_content
    assert_equal [ [ "/enabled", "cartAddress" ], [ "/enabled", "cartPrefix" ] ], error_pointers
    assert_nil ShopSetting.current.changed_at
  end

  test "a page that holds /cart is published there again while the shop is off; once it moves, neither it nor a new page takes cart" do
    page = page_at_cart
    Draft.save_document!(page_id: page.id, revision: page.draft.revision, document: page_document(title: "Club news, autumn"), save_id: "autumn")
    api(:post, "/api/pages/#{page.id}/publish")
    assert_response :ok
    get "/cart"
    assert_select "main h1", "Club news, autumn"
    api(:patch, "/api/pages/#{page.id}", { "slug" => "cart" })
    assert_response :ok, "the address it holds, sent again"

    api(:patch, "/api/pages/#{page.id}", { "slug" => "club-news" })
    api(:post, "/api/pages/#{page.id}/publish")
    assert_response :ok
    api(:patch, "/api/pages/#{page.id}", { "slug" => "cart" })
    assert_response :unprocessable_content
    assert_equal [ [ "/slug", "reserved" ] ], error_pointers
    api(:post, "/api/pages", { "title" => "Basket", "slug" => "cart" })
    assert_response :unprocessable_content
    assert_equal [ [ "/slug", "reserved" ] ], error_pointers
  end
end
