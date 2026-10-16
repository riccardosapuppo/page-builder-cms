require "test_helper"

# The shop's rules (ShopRules) on the cases the editor's twin reads too
# (contract/shop/cases.json, builder/src/shared/shop.test.ts): the
# settings' faults at their pointers, keywords and words, or the settings
# as they are kept; a price in the smallest unit and an amount in the
# site's words; a cart read back, changed, and priced from what its
# products published.
class ShopRulesTest < ActiveSupport::TestCase
  CASES = JSON.parse(Rails.root.join("..", "contract", "shop", "cases.json").expand_path.read)

  def collections
    CASES.fetch("collections").to_h { |c| [ c["id"], ShopRules::Collection.new(id: c["id"], name: c["name"], fields: c["fields"]) ] }
  end

  def lines(pairs) = pairs.map { |entry_id, quantity| ShopRules::Line.new(entry_id: entry_id, quantity: quantity) }

  test "every shared case finds the faults the editor finds, at their pointers, keywords and words, or keeps the settings" do
    found = collections
    assert_operator CASES.fetch("settings").size, :>, 20
    CASES.fetch("settings").each do |each|
      checked = ShopRules.check(each["settings"], found.method(:[]))
      assert_equal each["faults"], checked.faults.map { |f| [ f.pointer, f.keyword, f.message ] }, each["name"]
      assert_equal each["settled"] || each["settings"], checked.settings, each["name"] if checked.ok?
    end
  end

  test "a new site's shop is off, in pounds, with no collection, and passes its own rules" do
    assert_equal({ "enabled" => false, "currency" => "GBP", "productsCollectionId" => nil, "priceField" => nil }, ShopRules::DEFAULTS)
    assert ShopRules.check(ShopRules::DEFAULTS.dup, ->(_) { nil }).ok?
  end

  test "a price in the smallest unit of its currency, by its hundredths, and in the site's words" do
    assert_operator CASES.fetch("prices").size, :>, 10
    CASES.fetch("prices").each do |each|
      if each["minor"].nil?
        assert_nil ShopRules.minor_units(each["value"]), each["name"]
      else
        assert_equal each["minor"], ShopRules.minor_units(each["value"]), each["name"]
      end
      (each["words"] || {}).each { |currency, words| assert_equal words, ShopRules.money_words(each["minor"], currency), "#{each['name']} in #{currency}" }
    end
  end

  test "an amount in the site's words" do
    CASES.fetch("amounts").each { |each| assert_equal each["words"], ShopRules.money_words(each["minor"], each["currency"]), each["minor"].to_s }
  end

  test "a cart read back from where it was kept, and kept again as it was read" do
    CASES.fetch("kept").each { |each| assert_equal each["lines"], ShopRules.kept_cart(ShopRules.read_cart(each["kept"])), each["name"] }
  end

  test "a product put in, a line's quantity set, each refused at its fault" do
    assert_operator CASES.fetch("changes").size, :>, 15
    CASES.fetch("changes").each do |each|
      asked = each["add"] || each["set"]
      changed = each["add"] ? ShopRules.add(lines(each["lines"]), asked["entryId"], asked["quantity"]) : ShopRules.set(lines(each["lines"]), asked["entryId"], asked["quantity"])
      if each["fault"]
        assert_equal each["fault"], [ changed.fault&.pointer, changed.fault&.keyword, changed.fault&.message ], each["name"]
      else
        assert changed.ok?, "#{each['name']}: #{changed.fault.inspect}"
        assert_equal each["result"], ShopRules.kept_cart(changed.lines), each["name"]
      end
    end
  end

  test "a cart once an order made from it is paid: each product the order took loses the quantity it took, and what was put in since stays" do
    assert_operator CASES.fetch("ordered").size, :>, 5
    CASES.fetch("ordered").each do |each|
      taken = each["ordered"].map { |entry_id, quantity| { "entryId" => entry_id, "quantity" => quantity } }
      assert_equal each["result"], ShopRules.kept_cart(ShopRules.after_order(lines(each["lines"]), taken)), each["name"]
    end
  end

  test "a change leaves the cart it was given as it was" do
    before = lines([ [ 3, 1 ], [ 5, 2 ] ])
    copy = before.dup
    ShopRules.add(before, 3, 2)
    ShopRules.set(before, 5, 0)
    ShopRules.set(before, 9, 1)
    assert_equal copy, before
  end

  test "a cart priced from what its products published: each line's state, what it costs, the total and the lines an order takes" do
    CASES.fetch("priced").each do |each|
      products = each["products"].to_h { |p| [ p["id"], ShopRules::Product.new(id: p["id"], title: p["title"], values: p["values"]) ] }
      priced = ShopRules.price_cart(lines(each["lines"]), products.method(:[]), each["fields"], each["priceField"])
      shown = {
        "lines" => priced.lines.map { |l| { "entryId" => l.entry_id, "quantity" => l.quantity, "state" => l.state, "title" => l.title, "unitAmount" => l.unit_amount, "amount" => l.amount } },
        "total" => priced.total,
        "orderLines" => priced.order_lines
      }
      assert_equal each["priced"], shown, each["name"]
    end
  end
end
