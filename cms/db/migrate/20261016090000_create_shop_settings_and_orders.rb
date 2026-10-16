# The shop (docs/decisions/shop-on-collections.md): its settings, one row
# for the whole site as the site style's is, and the orders its checkout
# makes.
#
# The settings: on or off, the currency, the collection whose entries are
# the products, and its number field that is the price. There is no row
# until they first change, and then one (a check); off by default, and a
# shop that is on names both (a check). The collection the settings name
# is not deleted under them: the foreign key has no cascade, beside the
# model's own refusal (Collection#delete_unless_sold!).
#
# An order: what a checkout asked Stripe to be paid, its lines as they were
# then (each product's entry id, its title and its unit price in the
# currency's smallest unit, and the quantity), the total, the currency,
# the id of Stripe's Checkout Session, its status (open until Stripe says
# it is paid or expired) and, once paid, the email Stripe gives and when,
# which go with "paid" (a check). A line names its product by the id it
# had: the product may be deleted since, and the order keeps what it was.
class CreateShopSettingsAndOrders < ActiveRecord::Migration[8.1]
  def change
    create_table :shop_settings do |t|
      t.boolean :enabled, null: false, default: false
      t.string :currency, null: false, default: "GBP"
      t.references :products_collection, foreign_key: { to_table: :collections }
      t.string :price_field
      t.timestamps
      t.check_constraint "id = 1", name: "shop_settings_single_row"
      t.check_constraint "currency IN ('GBP', 'EUR', 'USD')", name: "shop_settings_currency"
      t.check_constraint "NOT enabled OR (products_collection_id IS NOT NULL AND price_field IS NOT NULL)", name: "shop_settings_on_whole"
    end

    create_table :orders do |t|
      t.string :status, null: false, default: "open"
      t.string :currency, null: false
      t.json :lines, null: false
      t.integer :total, null: false
      t.string :stripe_session_id
      t.string :email
      t.datetime :paid_at
      t.timestamps
      t.check_constraint "status IN ('open', 'paid', 'expired')", name: "orders_status"
      t.check_constraint "(status = 'paid') = (paid_at IS NOT NULL)", name: "orders_paid_whole"
      t.check_constraint "currency IN ('GBP', 'EUR', 'USD')", name: "orders_currency"
      t.check_constraint "total >= 0", name: "orders_total"
    end
    add_index :orders, :stripe_session_id, unique: true, where: "stripe_session_id IS NOT NULL"
  end
end
