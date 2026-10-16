# frozen_string_literal: true

# A collection: a type of content (News, Events), its entries listed and
# each drawn with the collection's template. The row holds its definition,
# as schema/collection.schema.json describes it and CollectionDocument
# checks it: its name, the prefix every entry's address starts with
# (/<prefix>/<entry>), its fields, and the order its entries are listed in
# when nothing else is asked for (default_sort, the definition's sort). A
# prefix is one collection's only, and never an address the application
# answers itself; a page may have it as its address, the page of the
# section that lists the entries at /news: a page's address is one part,
# an entry's two.
#
# Its template is a page of kind "template" (Page, CollectionTemplate),
# made with the collection, an empty document titled with its name and
# nothing live, and reached by the page API by its id, as the site's parts
# are. Deleting the collection deletes its template, with the template's
# draft and versions, and its entries, with their redirects (ON DELETE
# CASCADE).
#
# The collection the shop's settings name (ShopSetting) is the shop's
# products: it is not deleted, and the number field they name as the price
# stays one, while they name it.
#
# published_revision counts the changes a visitor could see of the
# collection: every publish, unpublish and delete of a live entry (a live
# entry's new address is a publish), and every change of the definition,
# whose prefix the entries' links start with and whose fields a list of
# entries draws; revised_at is when the last of them was made. The pages
# that list a collection's entries are cached by a key that holds both
# (SiteContent#keys): the count alone could name two lists alike in a
# database made anew, or restored from a backup.
class Collection < ApplicationRecord
  # Addresses the application answers below a first part a prefix could
  # take: /sent/<form> is the home page's form confirmed (config/routes.rb).
  # A page may be at /sent, one part; a collection's entries could not be
  # at /sent/<entry>. Slug.reserved? names the rest.
  RESERVED_PREFIXES = %w[sent].freeze

  # The shop sells from this collection: it is not deleted.
  class InShop < StandardError
    def initialize(message = "The shop sells from this collection: choose another one in the shop's settings, or none, before deleting it.")
      super
    end
  end

  has_many :entries, dependent: nil
  has_one :template, -> { where(kind: "template") }, class_name: "Page", inverse_of: :collection, dependent: nil

  validates :prefix, uniqueness: { message: "is already the prefix of another collection" }
  validate :prefix_not_reserved

  # A new collection from its definition, checked, and its template.
  # Raises CollectionDocument::Invalid, or ActiveRecord::RecordInvalid for a
  # prefix that is taken or reserved.
  def self.create_with_template!(definition, at: Time.current)
    checked = CollectionDocument.check_collection!(definition)
    transaction do
      collection = create!(name: checked["name"], prefix: checked["prefix"], fields: checked["fields"], default_sort: checked["sort"], created_at: at, updated_at: at, revised_at: at)
      template = Page.create!(kind: "template", collection: collection, created_at: at, updated_at: at)
      template.create_draft!(document: CollectionTemplate.starter(collection.name), slug: nil)
      collection
    end
  end

  # The definition as collection.schema.json describes it.
  def definition
    { "name" => name, "prefix" => prefix, "fields" => fields, "sort" => default_sort }
  end

  # A new definition from changes to some of its members, checked whole.
  # A change that changes something counts as one visitors may see. The
  # values entries keep under a key no field has any more stay until each
  # entry's next save leaves them out. The changes are merged into the
  # definition as it stands in the transaction that writes it, which
  # SQLite runs one at a time (Rails opens it IMMEDIATE): a request that
  # loaded the collection before another changed it does not write back
  # the members it did not change. The shop's price field, when the shop's
  # settings name this collection, stays a number field (shop_price).
  def update_definition!(changes, at: Time.current)
    transaction do
      reload
      checked = CollectionDocument.check_collection!(definition.merge(changes))
      shop_price!(checked["fields"])
      assign_attributes(name: checked["name"], prefix: checked["prefix"], fields: checked["fields"], default_sort: checked["sort"])
      if changed?
        self.published_revision += 1
        self.updated_at = at
        self.revised_at = at
        save!
      end
    end
    self
  end

  # Deletes the collection, its entries and its template, unless the
  # shop's settings name it, on or off: then nothing goes, and InShop says
  # why. Checked in the transaction that deletes it; the settings' foreign
  # key, which has no cascade, refuses it too.
  def delete_unless_sold!
    transaction do
      raise InShop if ShopSetting.where(id: ShopSetting::ID, products_collection_id: id).exists?

      destroy!
    end
  end

  # One more change a visitor could see, made at, in the transaction that
  # makes it.
  def advance!(at: Time.current)
    self.class.where(id: id).update_all([ "published_revision = published_revision + 1, revised_at = ?", at ])
  end

  # The fields an order may follow, besides the title and the two times.
  def sortable_keys
    fields.select { |field| CollectionDocument::Rules::SORTABLE_TYPES.include?(field["type"]) }.map { |field| field["key"] }
  end

  private

  # The shop's price, when the shop's settings name this collection: the
  # field they name stays a number field of it. Refused at the field's
  # type when it is there with another one, at /fields when it is gone,
  # keyword shopPrice, before anything is written.
  def shop_price!(fields)
    shop = ShopSetting.find_by(id: ShopSetting::ID, products_collection_id: id)
    return if shop.nil? || shop.price_field.nil?

    index = fields.index { |field| field["key"] == shop.price_field }
    return if index && fields[index]["type"] == "number"

    message = "The shop's price is the number field \"#{shop.price_field}\": keep it, or choose another price in the shop's settings first."
    raise CollectionDocument::Invalid, [ BlockDocument::Error.new(pointer: index ? "/fields/#{index}/type" : "/fields", keyword: "shopPrice", block_pointer: nil, message: message) ]
  end

  def prefix_not_reserved
    return if errors.include?(:prefix) || prefix.nil?
    return unless Slug.reserved?(prefix) || RESERVED_PREFIXES.include?(prefix)

    errors.add(:prefix, :reserved, message: "is an address the application uses itself")
  end
end
