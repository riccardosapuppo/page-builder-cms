# frozen_string_literal: true

# A page of the site. The row holds what is live: the address it is served
# at, the version that is served, and when it was last published. What is
# being edited lives in its Draft; every frozen copy is a PageVersion.
class Page < ApplicationRecord
  has_one :draft, dependent: :delete
  has_many :versions, class_name: "PageVersion", inverse_of: :page, dependent: :delete_all
  belongs_to :published_version, class_name: "PageVersion", optional: true
  has_many :slug_redirects, dependent: :delete_all

  validates :slug, slug: true, allow_nil: true
  validates :slug, uniqueness: { message: "is already the address of another page" }, allow_nil: true
  validate :published_at_never_moves_back

  # A new page: an empty document with its title, and the address it will
  # get on its first publish. Nothing is live until then.
  def self.create_with_draft!(title:, slug:)
    result = BlockDocument.check({ "schemaVersion" => BlockDocument::Upgrade::CURRENT, "title" => title, "sections" => [] })
    raise BlockDocument::Invalid, result.errors unless result.ok?

    transaction do
      page = create!
      page.create_draft!(document: result.document, slug: slug)
      page
    end
  end

  def published?
    !published_version_id.nil?
  end

  # The page / serves, or nil when no page is marked as home.
  def self.home_page
    find_by(home: true)
  end

  # Makes this page the one / serves, at once; the page that was home stops
  # being it. Until this page is published, / answers 404. The other page
  # is unmarked first, so the unique index on home never sees two. Both
  # rows are written whatever this object believes it holds, then read
  # back: an attribute set in memory by a write that failed must not make
  # the write look unneeded.
  def make_home!(at: Time.current)
    transaction do
      Page.where(home: true).where.not(id: id).update_all(home: false, updated_at: at)
      Page.where(id: id).update_all(home: true, updated_at: at)
    end
    reload
  end

  def unmake_home!(at: Time.current)
    Page.where(id: id).update_all(home: false, updated_at: at)
    reload
  end

  # Where a visitor finds the live page: / for the home page, /<slug> for
  # the others, nil before the first publish.
  def live_path
    return nil unless published?

    home? ? "/" : "/#{slug}"
  end

  # Publishes what the draft holds now, as a new version.
  #
  # expected_revision, when given, is the draft revision the person
  # publishing has seen: if someone saved since, the publish is refused with
  # Draft::Conflict rather than putting live a page nobody has looked at.
  # The draft's address takes effect now; the old one becomes a redirect.
  def publish!(at: Time.current, expected_revision: nil)
    transaction do
      draft = Draft.find_by!(page_id: id)
      if !expected_revision.nil? && expected_revision != draft.revision
        raise Draft::Conflict.new(current_revision: draft.revision, last_save_id: draft.last_save_id)
      end

      document = draft.checked_document
      version = PageVersion.record!(page_id: id, document: document, reason: "publish", at: at)
      previous_slug = slug
      self.slug = draft.slug
      self.published_version = version
      # Never earlier than the last publish, even if the clock went back.
      self.published_at = [ published_at, at ].compact.max
      # A live page wins over a redirect: the address is this page's now.
      SlugRedirect.where(from_slug: slug).delete_all
      save!
      if previous_slug && previous_slug != slug
        SlugRedirect.create!(from_slug: previous_slug, page: self)
      end
      version
    end
  end

  # "Save version": the draft as it is now, kept under an optional name.
  def save_version!(name: nil, at: Time.current)
    transaction do
      draft = Draft.find_by!(page_id: id)
      PageVersion.record!(page_id: id, document: draft.checked_document, reason: "manual", name: name, at: at)
    end
  end

  # Copies a version back into the draft, upgraded to the current schema
  # first, and keeps a "restore" version of what was copied. The draft's
  # revision goes up, so an editor still holding the old revision gets a
  # 409 on its next save instead of overwriting the restore.
  def restore!(number, at: Time.current)
    transaction do
      source = versions.find_by!(number: number)
      draft = Draft.find_by!(page_id: id)
      draft.replace_document!(source.document, at: at)
      version = PageVersion.record!(page_id: id, document: draft.document, reason: "restore", restored_from: source.number, at: at)
      [ draft, version ]
    end
  end

  private

  def published_at_never_moves_back
    return unless published_at_changed? && published_at_was && published_at
    return if published_at >= published_at_was

    errors.add(:published_at, :moved_back, message: "cannot be earlier than the last publish")
  end
end
