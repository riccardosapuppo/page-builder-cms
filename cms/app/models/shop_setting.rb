# frozen_string_literal: true

# The shop's settings (docs/decisions/shop-on-collections.md): on or off,
# the currency, the collection whose entries are the products and its
# number field that is the price, held to the shop's rules (ShopRules,
# the twin of the editor's shop.ts).
#
# One row for the whole site, id 1, as the site style's. Until the
# settings first change there is none, and the shop is off, in pounds,
# with no collection: the cart's addresses are then the site's 404 page.
#
# The collection and the price field the settings name stay what they
# are while named, on or off: the collection is not deleted
# (Collection#delete_unless_sold!) and its price field does not go nor
# change its type (Collection#update_definition!), so the settings never
# name what is not there.
class ShopSetting < ApplicationRecord
  ID = 1

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

  # Replaces the settings with these, checked against the collections as
  # they are, in the transaction that writes them. A change that changes
  # nothing keeps its time. Raises Invalid.
  def self.change!(settings, at: Time.current)
    attempts = 0
    begin
      transaction do
        checked = ShopRules.check(settings, ->(id) { rules_collection(Collection.find_by(id: id)) })
        raise Invalid, checked.faults unless checked.ok?

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
