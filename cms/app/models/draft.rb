# frozen_string_literal: true

# The one draft of a page: the document as the editor last saved it, and
# the address the page will have once published.
#
# The editor saves again and again. Each save names the revision it started
# from; the save goes through only if the draft is still at that revision,
# and then the revision goes up by one. Anything else is a conflict: some
# other tab or person saved in between.
class Draft < ApplicationRecord
  # Two automatic versions are at least this far apart: enough history to
  # go back a little, without a version for every keystroke.
  AUTO_VERSION_EVERY = 10.minutes

  # The id the editor gives each save, chosen by the editor: the same
  # alphabet as block ids.
  SAVE_ID = /\A[A-Za-z0-9_-]{1,64}\z/

  class Conflict < StandardError
    attr_reader :current_revision, :last_save_id

    def initialize(current_revision:, last_save_id:)
      @current_revision = current_revision
      @last_save_id = last_save_id
      super("The draft is at revision #{current_revision}.")
    end
  end

  belongs_to :page
  has_many :media_usages, dependent: :delete_all

  validates :slug, slug: true
  validates :slug, uniqueness: { message: "is already the next address of another page" }
  validate :slug_not_live_elsewhere

  # Saves a document sent by the editor over the draft of page page_id.
  #
  # The check of the revision and its increment are ONE statement:
  #   UPDATE drafts SET document = ?, revision = revision + 1, ...
  #   WHERE page_id = ? AND revision = ?
  # and the number of rows it changed decides. Two saves from the same
  # revision cannot both pass, whatever their timing: the database runs
  # the statements one after the other, and the second finds the revision
  # already moved.
  #
  # When no row changed, the save is answered as saved only if it is a
  # retry of the save that went through last (its answer was lost on the
  # way back): the same save_id, from the revision that save started from,
  # with the same document once normalised. Anything else is a conflict,
  # the same save_id included: a second tab that numbers its saves the same
  # way, or a retry carrying edited content, must not be told that a
  # document the server never stored was saved.
  #
  # Returns the draft as saved. Raises BlockDocument::Invalid, Conflict, or
  # ActiveRecord::RecordNotFound when there is no such page.
  def self.save_document!(page_id:, revision:, document:, save_id:, at: Time.current)
    result = BlockDocument.check(document)
    raise BlockDocument::Invalid, result.errors unless result.ok?

    json = JSON.generate(result.document)
    transaction do
      changed = where(page_id: page_id, revision: revision)
        .update_all([ "document = ?, revision = revision + 1, last_save_id = ?, updated_at = ?", json, save_id, at ])
      draft = find_by!(page_id: page_id)
      if changed.zero?
        unless draft.replay_of?(save_id: save_id, revision: revision, json: json)
          raise Conflict.new(current_revision: draft.revision, last_save_id: draft.last_save_id)
        end
      else
        MediaUsage.index_draft!(draft, BlockDocument.media_refs(draft.document), at: at)
        PageVersion.record_automatic!(page_id: page_id, document: draft.document, at: at)
      end
      draft
    end
  end

  # Whether a save that changed no row is the last accepted save sent again:
  # that save carried save_id, moved the draft from revision to
  # revision + 1, and stored exactly json (compared as parsed JSON, the way
  # the column reads it back).
  def replay_of?(save_id:, revision:, json:)
    last_save_id == save_id && self.revision == revision + 1 && document == JSON.parse(json)
  end

  # The document upgraded to the current schemaVersion and checked again:
  # what a version made from this draft will hold.
  def checked_document
    self.class.upgrade_and_check(document)
  end

  # Puts a stored document in place of the draft's, as a restore does. The
  # revision goes up like on any save; the last save id is cleared, so a
  # retry of a save made before the restore is a conflict, not a success.
  def replace_document!(stored_document, at: Time.current)
    document = self.class.upgrade_and_check(stored_document)
    self.class.where(id: id)
      .update_all([ "document = ?, revision = revision + 1, last_save_id = NULL, updated_at = ?", JSON.generate(document), at ])
    reload
    MediaUsage.index_draft!(self, BlockDocument.media_refs(self.document), at: at)
    self
  end

  def self.upgrade_and_check(stored_document)
    upgraded =
      begin
        BlockDocument::Upgrade.call(stored_document)
      rescue BlockDocument::Upgrade::Unsupported => e
        raise BlockDocument::Invalid, [ BlockDocument::Error.at("/schemaVersion", "upgrade", e.message) ]
      end
    result = BlockDocument.check(upgraded)
    raise BlockDocument::Invalid, result.errors unless result.ok?

    result.document
  end

  private

  # The address must not be another page's live address either: that page
  # keeps it until it is published under a new one.
  def slug_not_live_elsewhere
    return if errors.include?(:slug)
    return unless Page.where(slug: slug).where.not(id: page_id).exists?

    errors.add(:slug, :taken, message: "is already the address of another page")
  end
end
