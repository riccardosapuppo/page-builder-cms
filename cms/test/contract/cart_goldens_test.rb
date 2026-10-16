require "test_helper"

# The cart's contract, the server's half (contract/cart/cases.json says
# what it holds): each case's cart priced by the shop's rules and drawn by
# the cart's pages (app/views/cart/, CartHelper, CartPage), <main>'s
# content exactly the bytes of contract/cart/<name>.html. The browser
# demo's half, builder/src/demo/cart.contract.test.tsx, draws the same
# cases with its own twins and compares its tree with these goldens.
#
#   UPDATE_GOLDEN=1 ruby bin/rails test test/contract/cart_goldens_test.rb
#
# writes the goldens again.
class CartGoldensTest < ActiveSupport::TestCase
  include VisibleText

  FOLDER = Rails.root.join("..", "contract", "cart").expand_path
  CASES = JSON.parse(FOLDER.join("cases.json").read)

  def self.case_names = CASES["cases"].map { |one| one["name"] }

  # A case drawn as the CMS draws its page: a cart from its lines as
  # kept, priced from the products as they went live; an order from its
  # lines as sold.
  def render_case(one)
    collection = CASES["collection"]
    if one["page"] == "order"
      order = one["order"]
      return ApplicationController.render(inline: "<%= cart_head(title, said) %><%= order_body(lines, total, currency, href, words) -%>",
                                          locals: { title: one["title"], said: one["said"], lines: order["lines"], total: order["total"], currency: order["currency"], href: one["back"]["href"], words: one["back"]["words"] })
    end

    products = CASES["products"].to_h { |product| [ product["id"], ShopRules::Product.new(id: product["id"], title: product["title"], values: product["values"]) ] }
    priced = one["lines"] && ShopRules.price_cart(ShopRules.read_cart(one["lines"]), products.method(:[]), collection["fields"], collection["priceField"])
    published = CASES["products"].to_h { |product| [ product["id"], { "slug" => product["slug"], "values" => product["values"] } ] }
    shown = priced ? CartPage.shown(priced.lines, fields: collection["fields"], prefix: collection["prefix"], live: one["live"], published: published) : {}
    closed = priced && priced.lines.any? && priced.order_lines.empty? ? CartController::WORDS[:nothing] : nil
    ApplicationController.render(template: "cart/show", layout: false,
                                 locals: { priced: priced, shown: shown, media: ContractMedia, currency: one["currency"], said: said(one["said"]), closed: closed, shop_path: one["shopPath"] })
  end

  # What a case says above the cart: its words, or the words of a product
  # refused for its state ({ "state": ... }), the cart's own.
  def said(said) = said.is_a?(Hash) ? CartController::WORDS[:states].fetch(said["state"]) : said

  def golden(name) = FOLDER.join("#{name}.html")

  if ENV["UPDATE_GOLDEN"] == "1"
    test "write the cart's goldens" do
      (Dir.children(FOLDER).select { |file| file.end_with?(".html") } - CASES["cases"].map { |one| "#{one['name']}.html" }).each { |stale| File.delete(FOLDER.join(stale)) }
      CASES["cases"].each { |one| File.binwrite(golden(one["name"]), render_case(one)) }
      puts "\ncart contract: wrote #{CASES['cases'].size} golden(s)"
      pass
    end
  else
    CASES["cases"].each do |one|
      test "#{one['name']}: #{one['about']}, to the bytes of its golden" do
        file = golden(one["name"])
        assert file.file?, "#{file.basename} is missing: run UPDATE_GOLDEN=1 ruby bin/rails test test/contract/cart_goldens_test.rb"
        assert_equal file.binread.force_encoding(Encoding::UTF_8), render_case(one)
      end
    end

    test "every golden has its case, and the cases hold the cart's every kind of line" do
      assert_equal self.class.case_names.map { |name| "#{name}.html" }.sort, Dir.children(FOLDER).select { |file| file.end_with?(".html") }.sort
      drawn = FOLDER.glob("*.html").map(&:read).join
      %w[forSale outOfStock noPrice gone].each { |state| assert_includes drawn, %(data-state="#{state}"), state }
      assert_includes drawn, "£1,250.00"
      assert_includes drawn, "Tow float &lt;b&gt;&quot;bright&quot;&lt;/b&gt; &amp; safe", "a title's markup is written as words"
    end

    test "no golden shows a visitor the name of a provider or another brand" do
      assert_empty FOLDER.glob("*.html").to_h { |file| [ file.basename.to_s, brands_in(file.read) ] }.reject { |_, brands| brands.empty? }
    end
  end
end
