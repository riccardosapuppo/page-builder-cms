# frozen_string_literal: true

# A frozen copy of a page's document. Versions are numbered 1, 2, 3... per
# page, and never change once written.
#
# Why a version exists is its reason:
#   publish         the copy that was put live;
#   restore         the copy an older version put back into the draft;
#   before-restore  the draft as it was just before a restore replaced it,
#                   so no edit is lost to a restore;
#   manual          "Save version", with the name the person gave it, if
#                   any;
#   auto            made while someone edits, at most one every
#                   Draft::AUTO_VERSION_EVERY, so there is always
#                   something recent to go back to;
#   scheduled       the draft as it was when a publish was set for a time
#                   (ScheduledPublication): what that publish puts live.
#
# The pruning of old versions (PruneVersionsJob) deletes automatic
# versions only, and keeps every other kind: before-restore versions as it
# keeps manual and restore ones, since a before-restore version may be the
# only copy of the edits it holds.
class PageVersion < ApplicationRecord
  REASONS = %w[publish restore before-restore manual auto scheduled].freeze
  NAME_MAX_LENGTH = 80

  # The retention of automatic versions (prune!): each page keeps its
  # newest KEEP_AUTOMATIC, and beyond them those made in the last
  # KEEP_AUTOMATIC_FOR.
  KEEP_AUTOMATIC = 50
  KEEP_AUTOMATIC_FOR = 30.days

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
    MediaUsage.index_version!(version, BlockDocument.media_refs(document), at: at)
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

  # Deletes the automatic versions the retention rule lets go: those of a
  # page that are not among its newest KEEP_AUTOMATIC automatic ones
  # ("newest" by number, the order they were made in, whatever the clock
  # said) and were made more than KEEP_AUTOMATIC_FOR before `at`; one made
  # exactly then stays. No other kind is ever deleted: not the publish,
  # restore, before-restore, manual or scheduled ones. And whatever its
  # reason, a version a page serves or a schedule names stays.
  #
  # Their media usage rows go with them (ON DELETE CASCADE); an image no
  # longer used by anything is PurgeMediaJob's. Returns {page_id => count}
  # for the pages that lost any.
  def self.prune!(at: Time.current)
    # In UTC: days of 24 hours, whatever the site's clock did between.
    cutoff = at.utc - KEEP_AUTOMATIC_FOR
    pages = where(reason: "auto").group(:page_id).having("count(*) > ?", KEEP_AUTOMATIC).pluck(:page_id)
    pages.each_with_object({}) do |page_id, pruned|
      transaction do
        automatic = where(page_id: page_id, reason: "auto")
        newest = automatic.order(number: :desc).limit(KEEP_AUTOMATIC).pluck(:id)
        count = automatic.where.not(id: newest).where(created_at: ...cutoff)
          .where.not(id: Page.where.not(published_version_id: nil).select(:published_version_id))
          .where.not(id: ScheduledPublication.select(:page_version_id))
          .delete_all
        pruned[page_id] = count if count.positive?
      end
    end
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
