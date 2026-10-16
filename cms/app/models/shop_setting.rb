# frozen_string_literal: true

# The shop's settings (docs/decisions/shop-on-collections.md): on or off,
# the currency, the collection whose entries are the products and its
# number field that is the price, held to the shop's rules (ShopRules,
# the twin of the editor's shop.ts).
#
# One row for the whole site, id 1, as the site style's. Until the
# settings first change there is none, and the shop is off, in pounds,
# with no collection.
#
# The cart's routes match only while the shop is open (open?,
# config/routes.rb): with it off, /cart and the addresses below it are the
# site's, as before the shop, a page or a collection's entries there, or
# the 404 page. A site upgraded from before the shop may hold cart, which
# is reserved for new writes only (Slug::RESERVED, SlugValidator): a page
# at /cart, live or next, or a collection at the prefix cart. So the shop
# is not turned on while one holds it (cart_holders): the cart would
# answer in its place.
#
# The collection and the price field the settings name stay what they
# are while named, on or off: the collection is not deleted
# (Collection#delete_unless_sold!) and its price field does not go nor
# change its type (Collection#update_definition!), so the settings never
# name what is not there.
class ShopSetting < ApplicationRecord
  ID = 1

  # The cart's address, /cart, and the first part of the cart's others
  # (config/routes.rb).
  CART = "cart"

  # Settings the shop's rules refuse, with each fault at its member.
  class Invalid < StandardError
    attr_reader :faults

    def initialize(faults)
      @faults = faults
      super("The shop's settings are not valid: #{faults.map { |f| "#{f.keyword} at #{f.pointer.inspect}" }.join(', ')}")
    end
  end

  belongs_to :products_collection, class_name: "Collection", optional: true

  def self.current
    find_by(id: ID) || new(id: ID, enabled: false, currency: "GBP")
  end

  # Whether the shop sells now: the cart's routes match only then
  # (config/routes.rb).
  def self.open?
    current.open?
  end

  # Replaces the settings with these, checked against the collections as
  # they are, in the transaction that writes them: the shop's rules first
  # (ShopRules), then, for a shop that is on, the cart's address, which no
  # page and no collection may hold (cart_holders). A change that changes
  # nothing keeps its time. Raises Invalid.
  def self.change!(settings, at: Time.current)
    attempts = 0
    begin
      transaction do
        checked = ShopRules.check(settings, ->(id) { rules_collection(Collection.find_by(id: id)) })
        raise Invalid, checked.faults unless checked.ok?

        held = checked.settings["enabled"] ? cart_holders : []
        raise Invalid, held unless held.empty?

        record = current
        record.assign_attributes(enabled: checked.settings["enabled"], currency: checked.settings["currency"],
                                 products_collection_id: checked.settings["productsCollectionId"], price_field: checked.settings["priceField"])
        if record.new_record? || record.changed?
          record.created_at ||= at
          record.updated_at = at
          record.save!
        end
        record
      end
    rescue ActiveRecord::RecordNotUnique
      # Two first changes at once: both found no row and both inserted
      # id 1. The second now finds the row and changes it.
      attempts += 1
      retry if attempts == 1
      raise
    end
  end

  # A collection as the shop's rules read it, or nil.
  def self.rules_collection(collection)
    collection && ShopRules::Collection.new(id: collection.id, name: collection.name, fields: collection.fields)
  end

  # What holds the cart's address, each a fault at /enabled that names it
  # and says how to free it: a page at /cart, or to be published there, by
  # its title in the editor (keyword cartAddress), then a collection whose
  # prefix it is (cartPrefix). The CMS's alone: the browser's storage
  # serves no address, and the demo's cart is at ?cart.
  def self.cart_holders
    held = Page.site_pages.where(slug: CART).pluck(:id) + Draft.where(slug: CART).pluck(:page_id)
    pages = Page.site_pages.includes(:draft).where(id: held).order(:id).map do |page|
      ShopRules::Fault.new(pointer: "/enabled", keyword: "cartAddress", message: cart_page_words(page))
    end
    collections = Collection.where(prefix: CART).order(:id).map do |collection|
      ShopRules::Fault.new(pointer: "/enabled", keyword: "cartPrefix",
                           message: "The collection #{collection.name} has the prefix #{CART}, so its entries are below /#{CART}, " \
                                    "the address of the shop's cart: give the collection another prefix before turning the shop on.")
    end
    pages + collections
  end

  # How a page holds /cart, and what frees it: live there, with its next
  # address there too or another one already; or to be published there.
  def self.cart_page_words(page)
    named = "The page \"#{page.draft.document['title']}\""
    if page.slug == CART && page.draft.slug == CART
      "#{named} is at /#{CART}, the address of the shop's cart: give the page another address and publish it before turning the shop on."
    elsif page.slug == CART
      "#{named} is at /#{CART}, the address of the shop's cart, until it is published at its next address: publish it before turning the shop on."
    else
      "#{named} is to be published at /#{CART}, the address of the shop's cart: give the page another address before turning the shop on."
    end
  end
  private_class_method :cart_page_words

  # The settings as the API and the rules name them.
  def settings
    { "enabled" => enabled, "currency" => currency, "productsCollectionId" => products_collection_id, "priceField" => price_field }
  end

  # Whether the shop sells: on, with its collection and its price field
  # (which a shop that is on always names: ShopRules, and a check).
  def open?
    enabled && !products_collection_id.nil? && !price_field.nil?
  end

  # When the settings last changed; nil while there is no row.
  def changed_at
    persisted? ? updated_at : nil
  end
end
