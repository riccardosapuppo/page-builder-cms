# frozen_string_literal: true

# A page of the site. The row holds what is live: the address it is served
# at, the version that is served, the draft revision that version was taken
# from, and when it was last published. What is being edited lives in its
# Draft; every frozen copy is a PageVersion.
class Page < ApplicationRecord
  has_one :draft, dependent: :delete
  has_many :versions, class_name: "PageVersion", inverse_of: :page, dependent: :delete_all
  belongs_to :published_version, class_name: "PageVersion", optional: true
  has_many :slug_redirects, dependent: :delete_all
  has_many :scheduled_publications, dependent: :delete_all
  # The publish set for a time and still waiting for it, if any: a page has
  # at most one (a unique index says so).
  has_one :pending_schedule, -> { pending }, class_name: "ScheduledPublication", inverse_of: :page

  validates :slug, slug: true, allow_nil: true
  validates :slug, uniqueness: { message: "is already the address of another page" }, allow_nil: true
  # The draft revision the live version came from, exactly when something
  # is live (here and not in the database: see the migration that added it).
  validates :published_revision, numericality: { only_integer: true, greater_than_or_equal_to: 0 }, if: :published?
  validates :published_revision, absence: true, unless: :published?
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

      version = put_live!(draft.checked_document, revision: draft.revision, slug: draft.slug, at: at)
      # A publish still waiting for its time would put this revision, or an
      # earlier one, live again: it has nothing left to do, and the page
      # says so now rather than when its job finds out.
      scheduled_publications.pending.where(revision: ..draft.revision).find_each { |schedule| schedule.settle!("superseded", at: at) }
      version
    end
  end

  # Sets a publish for publish_at: the draft as it is now, at revision,
  # is kept as a "scheduled" version, and PublishPageJob puts that version
  # live when the time comes, whatever the draft holds by then. A pending
  # schedule of the page is replaced. Returns the schedule and the one it
  # replaced (or nil).
  #
  # revision is the draft revision the person scheduling has seen: if
  # someone saved since, Draft::Conflict, as for a publish. Refused with
  # ActiveRecord::RecordInvalid: a time not after `at` or more than
  # ScheduledPublication::FURTHEST ahead (:publish_at), and a revision
  # already live, since that publish would change nothing (:revision).
  def schedule_publish!(revision:, publish_at:, at: Time.current)
    schedule, replaced = transaction do
      draft = Draft.find_by!(page_id: id)
      raise Draft::Conflict.new(current_revision: draft.revision, last_save_id: draft.last_save_id) if revision != draft.revision

      schedule = ScheduledPublication.new(page: self, revision: revision, publish_at: publish_at, state: "pending", created_at: at, updated_at: at)
      if publish_at <= at
        schedule.errors.add(:publish_at, :in_the_past, message: "must be later than now")
      elsif publish_at > at + ScheduledPublication::FURTHEST
        schedule.errors.add(:publish_at, :too_far, message: "must be within a year from now")
      end
      if published? && published_revision >= revision
        schedule.errors.add(:revision, :already_live, message: "is already live: there is nothing to schedule")
      end
      raise ActiveRecord::RecordInvalid, schedule if schedule.errors.any?

      replaced = ScheduledPublication.pending.find_by(page_id: id)
      replaced&.settle!("replaced", at: at)
      schedule.version = PageVersion.record!(page_id: id, document: draft.checked_document, reason: "scheduled", at: at)
      schedule.save!
      [ schedule, replaced ]
    end
    # After the commit: the job must find the row when it runs, however
    # soon that is. If the queue refuses the job, the schedule says it
    # failed rather than staying pending with nothing to fire it.
    begin
      PublishPageJob.set(wait_until: schedule.publish_at).perform_later(schedule.id)
    rescue StandardError
      schedule.settle!("failed", at: at)
      raise
    end
    [ schedule, replaced ]
  end

  # Puts a scheduled version live (ScheduledPublication#run!): its
  # document, upgraded to the current schema and checked again, as a new
  # "publish" version. What is live is then the draft as it was at the
  # schedule's revision. The address is the draft's as it is now, as for
  # any publish: the next address takes effect at the next publish.
  def publish_scheduled!(schedule, at: Time.current)
    transaction do
      draft = Draft.find_by!(page_id: id)
      put_live!(Draft.upgrade_and_check(schedule.version.document), revision: schedule.revision, slug: draft.slug, at: at)
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
  #
  # Before anything is copied, the draft as it is now is kept as a
  # "before-restore" version, so the edits a restore replaces can always
  # be had back: the automatic versions come at most every ten minutes and
  # may miss the last ones. When the draft is exactly the page's newest
  # version, nothing would be lost and no copy is made.
  #
  # Returns the draft, the restore version, and the version kept before
  # it (nil when none was needed).
  def restore!(number, at: Time.current)
    transaction do
      source = versions.find_by!(number: number)
      draft = Draft.find_by!(page_id: id)
      current = draft.checked_document
      newest = versions.order(number: :desc).first
      kept = PageVersion.record!(page_id: id, document: current, reason: "before-restore", at: at) unless newest&.document == current
      draft.replace_document!(source.document, at: at)
      version = PageVersion.record!(page_id: id, document: draft.document, reason: "restore", restored_from: source.number, at: at)
      [ draft, version, kept ]
    end
  end

  private

  # Every publish, now or scheduled, ends here: a new "publish" version of
  # document, served from now on at slug. revision is the draft revision
  # document was taken from: the draft's saves after it are what is not
  # live yet.
  def put_live!(document, revision:, slug:, at:)
    version = PageVersion.record!(page_id: id, document: document, reason: "publish", at: at)
    previous_slug = self.slug
    self.slug = slug
    self.published_version = version
    self.published_revision = revision
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

  def published_at_never_moves_back
    return unless published_at_changed? && published_at_was && published_at
    return if published_at >= published_at_was

    errors.add(:published_at, :moved_back, message: "cannot be earlier than the last publish")
  end
end
