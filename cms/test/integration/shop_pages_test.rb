require "test_helper"

# The pages that draw the shop, as a browser and the server's cache keep
# them: a product's page, the products collection's published template
# drawn with a product, its price as money in the shop's currency and Add
# to cart a form the cart's own address takes as the page sends it; a page
# listing the products, their cards' prices as money; with the shop off, a
# price as a number and no Add to cart. Each is a new page when the shop's
# settings change, and so is each block that draws them; a page that does
# not draw the shop keeps its validator. A page and the site's parts hold
# no Add to cart; a template does.
class ShopPagesTest < ActionDispatch::IntegrationTest
  include CollectionCases
  include PageCacheStore
  include ShopRequests

  # The header and footer with no section, so the counts are the page's.
  EMPTY_PARTS = %w[header footer].to_h { |kind| [ kind, { "schemaVersion" => 1, "title" => kind.capitalize, "sections" => [] }.freeze ] }.freeze

  FIELDS = (ShopRequests::PRODUCT_FIELDS + [ { "key" => "weight", "label" => "Weight", "type" => "number", "required" => false } ]).freeze

  setup do
    @starters = Rails.configuration.x.parts
    Rails.configuration.x.parts = EMPTY_PARTS
    @products = products_collection(fields: FIELDS)
  end

  teardown do
    Rails.configuration.x.parts = @starters
  end

  def widget(id, type, props)
    { "id" => id, "type" => type, "props" => props, "style" => { "base" => {} }, "children" => [] }
  end

  def field_block(id, field, level: nil) = widget(id, "field", { "field" => field, **(level ? { "level" => level } : {}) })
  def cart_block(id, quantity: true) = widget(id, "addToCart", { "label" => "Add to cart", "quantity" => quantity })

  def list_block(id, collection, price: "price")
    widget(id, "collectionList", { "collection" => collection.id, "count" => 3, "order" => { "by" => "title", "direction" => "asc" }, "layout" => "list", "columns" => 3,
                                   "price" => price, "linkLabel" => "", "emptyText" => "Nothing yet." })
  end

  def publish_template(collection, widgets)
    template = Page.includes(:draft).find(collection.template.id)
    Draft.save_document!(page_id: template.id, revision: template.draft.revision, document: page_document(title: "Product", widgets: widgets), save_id: "t#{template.draft.revision}")
    template.publish!
    template.reload
  end

  def publish_page(slug, widgets)
    page = create_page(title: slug.capitalize, slug: slug)
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: slug.capitalize, widgets: widgets), save_id: "p1")
    page.publish!
    page.reload
  end

  def visit(path, held = nil)
    get path, headers: held ? { "If-None-Match" => held } : {}
    response.headers["ETag"]
  end

  test "a product's page draws its price as money and Add to cart as a form for it, which the cart takes as the page sends it" do
    publish_template(@products, [ field_block("t", "title", level: 1), field_block("p", "price"), cart_block("cart") ])
    cap = product(@products, "Swim cap", "swim-cap", price: 12.5)
    open_shop(@products)

    get "/shop/swim-cap"
    assert_response :ok
    assert_select "[data-block-id=p] p", text: "£12.50"
    assert_select "[data-block-id=cart] form.sw-cart-add[method=post][action='/cart/items']" do
      assert_select "input[type=hidden][name=entry][value='#{cap.id}']"
      assert_select "input[type=number][name=quantity][value='1'][min='1'][max='20']"
      assert_select "button[type=submit].sw-btn", text: "Add to cart"
    end
    assert_empty response.headers["Set-Cookie"].to_s, "a product's page sets no cookie"

    # The form's own fields, as a browser sends them from the page.
    cart_post "/cart/items", { "entry" => cap.id.to_s, "quantity" => "2" }
    assert_redirected_to "/cart"
    assert_equal [ [ cap.id, 2 ] ], cart_cookie
  end

  test "with the shop off, a product's page draws its price as a number and no Add to cart, and the cart is not found" do
    publish_template(@products, [ field_block("p", "price"), cart_block("cart") ])
    product(@products, "Swim cap", "swim-cap", price: 1250.5)
    ShopSetting.change!({ "enabled" => false, "currency" => "GBP", "productsCollectionId" => @products.id, "priceField" => "price" })

    get "/shop/swim-cap"
    assert_select "[data-block-id=p] p", text: "1,250.5"
    assert_select "[data-block-id=cart][hidden]"
    assert_select "[data-block-id=cart] form", count: 0
    get "/cart"
    assert_response :not_found
  end

  test "a page or a header refuses an Add to cart block, which only a template holds; a template keeps it" do
    page = create_page(title: "Shop", slug: "kit-shop")
    error = assert_raises(BlockDocument::Invalid) { Draft.save_document!(page_id: page.id, revision: 0, document: page_document(widgets: [ cart_block("c") ]), save_id: "c1") }
    assert_equal [ [ Documents::FIRST_WIDGET, "addToCart" ] ], error.errors.map { |e| [ e.pointer, e.keyword ] }
    assert_equal PageRules::CART, error.errors.first.message

    header = Page.part!("header")
    error = assert_raises(BlockDocument::Invalid) { Draft.save_document!(page_id: header.id, revision: header.draft.revision, document: page_document(widgets: [ cart_block("c") ]), save_id: "h1") }
    assert_equal [ [ Documents::FIRST_WIDGET, "addToCart" ] ], error.errors.map { |e| [ e.pointer, e.keyword ] }

    template = publish_template(@products, [ cart_block("c") ])
    assert_equal "addToCart", template.published_version.document.dig("sections", 0, "children", 0, "children", 0, "type")
  end

  test "a template's preview with values made up for a collection with no entry draws the price as money, and no Add to cart" do
    template = publish_template(@products, [ field_block("p", "price"), cart_block("cart") ])
    open_shop(@products)

    get "/preview/#{template.id}?entry=sample"
    assert_select "[data-block-id=p] p", text: "£0.00"
    assert_select "[data-block-id=cart][hidden]"
  end

  test "a product's page and a page listing the products are new pages at each change of the shop's settings; a page and an entry's page that draw no shop keep their own" do
    publish_template(@products, [ field_block("p", "price"), cart_block("cart") ])
    product(@products, "Swim cap", "swim-cap", price: 12)
    publish_page("kit", [ list_block("list", @products) ])
    news = create_news
    publish_template(news, [ field_block("t", "title", level: 1), field_block("places", "places") ])
    Entry.create_checked!(news, news_entry(title: "Dawn swims", slug: "dawn-swims", values: { "places" => 12 })).publish!
    publish_page("club", [ list_block("list", news, price: "places") ])
    open_shop(@products)

    held = %w[/shop/swim-cap /kit /club /news/dawn-swims].to_h { |path| [ path, visit(path) ] }
    assert_select "[data-block-id=places] p", text: "12"
    changes = {
      "the currency" => -> { open_shop(@products, currency: "EUR") },
      "the price field" => -> { open_shop(@products, currency: "EUR", price_field: "weight") },
      "the shop turned off" => -> { ShopSetting.change!(ShopSetting.current.settings.merge("enabled" => false)) },
      "the shop turned on again" => -> { open_shop(@products) }
    }
    changes.each do |what, change|
      change.call
      %w[/shop/swim-cap /kit].each do |path|
        now = visit(path, held[path])
        assert_response :ok, "#{what}: #{path}"
        assert_not_equal held[path], now, "#{what}: #{path}"
        held[path] = now
      end
      %w[/club /news/dawn-swims].each do |path|
        visit(path, held[path])
        assert_response :not_modified, "#{what}: #{path}, which draws no shop, keeps its validator"
      end
    end
    visit("/shop/swim-cap")
    assert_select "[data-block-id=p] p", text: "£12.00"
  end

  test "a change of the currency redraws the blocks that draw a price and what holds them; the others are read back" do
    product(@products, "Swim cap", "swim-cap", price: 12)
    publish_page("kit", [ heading_block("h1", "Kit"), list_block("list", @products), heading_block("h2", "More") ])
    publish_template(@products, [ field_block("t", "title", level: 1), field_block("p", "price"), cart_block("cart") ])
    open_shop(@products)

    first = with_page_cache { get "/kit" }
    assert_equal 6, written(first), "the page, its section, its column and its three widgets"
    entry_first = with_page_cache { get "/shop/swim-cap" }
    assert_equal 6, written(entry_first), "the page, its section, its column and its three widgets"

    open_shop(@products, currency: "USD")
    second = with_page_cache { get "/kit" }
    assert_select ".sw-entry-price", text: "$12.00"
    assert_equal [ 4, 2 ], [ written(second), found(second) ], "the list, its column, its section and the page drawn; the two headings read back"
    entry_second = with_page_cache { get "/shop/swim-cap" }
    assert_select "[data-block-id=p] p", text: "$12.00"
    assert_equal [ 4, 2 ], [ written(entry_second), found(entry_second) ], "the price, its column, its section and the page drawn; the title and Add to cart read back"

    # Out of stock: Add to cart says so, and is drawn again.
    Entry.find_by!(published_slug: "swim-cap").then do |cap|
      Entry.save_checked!(@products, cap.id, revision: cap.revision, save_id: "out", entry: { "title" => "Swim cap", "slug" => "swim-cap", "values" => { "price" => 12, "in-stock" => false } })
      cap.reload.publish!
    end
    third = with_page_cache { get "/shop/swim-cap" }
    assert_select "[data-block-id=cart] p.sw-btn-off", text: "Out of stock"
    assert_operator written(third), :>=, 4
  end
end
