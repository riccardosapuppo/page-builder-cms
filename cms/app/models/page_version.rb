# frozen_string_literal: true

# A frozen copy of a page's document. Versions are numbered 1, 2, 3... per
# page, and never change once written.
#
# Why a version exists is its reason:
#   publish  the copy that was put live;
#   restore  the copy an older version put back into the draft;
#   manual   "Save version", with the name the person gave it, if any;
#   auto     made while someone edits, at most one every
#            Draft::AUTO_VERSION_EVERY, so there is always something
#            recent to go back to.
class PageVersion < ApplicationRecord
  REASONS = %w[publish restore manual auto].freeze
  NAME_MAX_LENGTH = 80

  belongs_to :page
  has_many :media_usages, dependent: :delete_all

  validates :reason, inclusion: { in: REASONS }
  validates :number, numericality: { only_integer: true, greater_than: 0 }
  validate :name_is_one_line

  # Writes the next version of a page. The number is the page's highest
  # plus one, read inside the caller's transaction: SQLite runs write
  # transactions one at a time (Rails opens them IMMEDIATE), and the unique
  # index on (page_id, number) refuses a duplicate if that ever changes.
  def self.record!(page_id:, document:, reason:, at:, name: nil, restored_from: nil)
    number = where(page_id: page_id).maximum(:number).to_i + 1
    version = create!(page_id: page_id, number: number, document: document, reason: reason,
                      name: name, restored_from: restored_from, created_at: at)
    MediaUsage.index_version!(version, BlockDocument.media_refs(document))
    version
  end

  # An automatic version, unless the page already has a version of any
  # kind from the last Draft::AUTO_VERSION_EVERY: a publish or a "Save
  # version" a minute ago is already a point to go back to.
  def self.record_automatic!(page_id:, document:, at:)
    latest = where(page_id: page_id).maximum(:created_at)
    return if latest && latest > at - Draft::AUTO_VERSION_EVERY

    record!(page_id: page_id, document: document, reason: "auto", at: at)
  end

  def readonly?
    persisted? || super
  end

  private

  def name_is_one_line
    return if name.nil?
    return if BlockDocument::Schema.line?(name, max: NAME_MAX_LENGTH)

    errors.add(:name, :invalid, message: "must be one line of text with a visible character, at most #{NAME_MAX_LENGTH} characters")
  end
end
