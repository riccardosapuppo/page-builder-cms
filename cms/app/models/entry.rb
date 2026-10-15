# frozen_string_literal: true

# An entry of a collection: its draft (a title, the slug of its address,
# /<prefix>/<slug>, and the values of the collection's fields), saved at a
# revision as a page's draft is, and what is live, if anything: the title,
# slug and values it was published with, the draft revision they came
# from, and when it went live. An entry has no versions: its draft and the
# snapshot published are all it keeps.
#
# Its slug is unique in its collection, as its live slug is among the live
# ones, and never another entry's live slug either: an entry keeps its live
# address until it is published under a new one, and the old one then
# redirects to it (EntryRedirect), as a page's does.
#
# A publish, an unpublish, and the delete of a live entry each count as a
# change a visitor could see of its collection (Collection#advance!). A
# save does not: what is live does not change.
class Entry < ApplicationRecord
  # The draft moved past the revision a request named: where it is now, and
  # the saveId of the save that took it there.
  class Conflict < StandardError
    attr_reader :current_revision, :last_save_id

    def initialize(current_revision:, last_save_id:)
      @current_revision = current_revision
      @last_save_id = last_save_id
      super("The entry is at revision #{current_revision}.")
    end
  end

  belongs_to :collection
  has_many :redirects, class_name: "EntryRedirect", dependent: :delete_all
  has_many :media_usages, dependent: :delete_all

  validates :slug, uniqueness: { scope: :collection_id, message: "is already the next address of another entry" }
  validate :slug_not_live_elsewhere

  # A new entry of collection, checked against its fields; nothing live.
  # Raises CollectionDocument::Invalid, or ActiveRecord::RecordInvalid for a
  # slug another entry has.
  def self.create_checked!(collection, entry, at: Time.current)
    checked = CollectionDocument.check_entry!(collection.definition, entry)
    transaction do
      made = create!(collection: collection, title: checked["title"], slug: checked["slug"], field_values: checked["values"], created_at: at, updated_at: at)
      MediaUsage.index_entry!(made, at: at)
      made
    end
  end

  # Saves entry ({title, slug, values}), checked against the collection's
  # fields, over the draft of the collection's entry entry_id, if the draft
  # is still at revision: the check of the revision and its increment are
  # one statement, as Draft.save_document!'s are, and the rows it changed
  # decide. None means a conflict, unless this is the save that went
  # through last, sent again because its answer was lost: the same save_id,
  # from the revision that save started from, with the same entry once
  # normalised, which is answered as saved. Raises
  # CollectionDocument::Invalid, ActiveRecord::RecordInvalid (a slug
  # another entry has), Conflict, or ActiveRecord::RecordNotFound.
  def self.save_checked!(collection, entry_id, revision:, save_id:, entry:, at: Time.current)
    checked = CollectionDocument.check_entry!(collection.definition, entry)
    transaction do
      record = collection.entries.find(entry_id)
      record.assign_attributes(slug: checked["slug"])
      record.validate!
      changed = where(id: record.id, revision: revision).update_all([
        "title = ?, slug = ?, field_values = ?, revision = revision + 1, last_save_id = ?, updated_at = ?",
        checked["title"], checked["slug"], JSON.generate(checked["values"]), save_id, at
      ])
      record.reload
      if changed.zero?
        raise Conflict.new(current_revision: record.revision, last_save_id: record.last_save_id) unless record.replay_of?(save_id: save_id, revision: revision, entry: checked)
      else
        MediaUsage.index_entry!(record, at: at)
      end
      record
    end
  end

  # Whether a save that changed no row is the last accepted save sent
  # again: that save carried save_id, moved the entry from revision to
  # revision + 1, and stored exactly entry.
  def replay_of?(save_id:, revision:, entry:)
    last_save_id == save_id && self.revision == revision + 1 &&
      { "title" => title, "slug" => slug, "values" => field_values } == entry
  end

  def published?
    !published_at.nil?
  end

  # The draft as the collection's rules read it.
  def draft
    { "title" => title, "slug" => slug, "values" => field_values }
  end

  # Puts live what the draft holds now, checked again against the
  # collection's fields as they are now (a field may have become required
  # since the last save). expected_revision, when given, is the revision the
  # person publishing has seen: if someone saved since, Conflict. The
  # draft's slug becomes the live address; the old one, if another,
  # redirects here from now on. When it went live stays the time of the
  # first publish, until an unpublish.
  def publish!(expected_revision: nil, at: Time.current)
    transaction do
      reload
      if !expected_revision.nil? && expected_revision != revision
        raise Conflict.new(current_revision: revision, last_save_id: last_save_id)
      end

      CollectionDocument.check_entry!(collection.definition, draft)
      previous = published_slug
      # A live entry wins over a redirect: the address is this entry's now.
      EntryRedirect.where(collection_id: collection_id, from_slug: slug).delete_all
      update!(published_title: title, published_slug: slug, published_field_values: field_values, published_revision: revision,
              published_at: published_at || at, updated_at: at)
      redirects.create!(collection_id: collection_id, from_slug: previous) if previous && previous != slug
      MediaUsage.index_entry!(self, at: at)
      collection.advance!
      self
    end
  end

  # Takes the entry off: its address answers nothing from now on, and its
  # old addresses lead nowhere until it is published again. The draft
  # stays as it is.
  def unpublish!(at: Time.current)
    transaction do
      reload
      next self unless published?

      update!(published_title: nil, published_slug: nil, published_field_values: nil, published_revision: nil, published_at: nil, updated_at: at)
      MediaUsage.index_entry!(self, at: at)
      collection.advance!
      self
    end
  end

  # Deletes the entry, its redirects and the record of the images it used.
  def delete_entry!
    transaction do
      reload
      live = published?
      destroy!
      collection.advance! if live
    end
  end

  private

  # The address must not be another entry's live address in the collection:
  # that entry keeps it until it is published under a new one.
  def slug_not_live_elsewhere
    return if slug.nil? || errors.include?(:slug)
    return unless self.class.where(collection_id: collection_id, published_slug: slug).where.not(id: id).exists?

    errors.add(:slug, :taken, message: "is already the address of another entry")
  end
end
