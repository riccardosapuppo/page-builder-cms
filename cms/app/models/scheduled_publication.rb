# frozen_string_literal: true

# A publish set for a time: the page, the version of its draft that will go
# live (reason "scheduled", made when the publish was set), the draft
# revision that version came from, and when.
#
# PublishPageJob puts it live when the time comes, and only then decides
# whether it still should: the job runs once at the time it was enqueued
# for, whatever happened since, so everything that can change in between
# is looked at again there. See run!.
#
# The states, and what becomes of a pending one (the migration lists them
# too): published by the job; cancelled by a person; replaced by a newer
# schedule of the page, since a page has at most one pending; superseded,
# when by its time a publish had already put this revision of the draft or
# a later one live; failed, when the job could not put it live.
class ScheduledPublication < ApplicationRecord
  STATES = %w[pending published cancelled replaced superseded failed].freeze

  # How far ahead a publish may be set: a year covers any plan, and a
  # mistyped year is refused instead of waiting for decades.
  FURTHEST = 1.year

  # Cancelling one that is no longer pending.
  class NotPending < StandardError
    attr_reader :schedule

    def initialize(schedule)
      @schedule = schedule
      super("The scheduled publish is #{schedule.state}: there is nothing left to cancel.")
    end
  end

  belongs_to :page
  belongs_to :version, class_name: "PageVersion", foreign_key: :page_version_id, inverse_of: false
  belongs_to :published_version, class_name: "PageVersion", optional: true, inverse_of: false

  validates :state, inclusion: { in: STATES }
  validates :revision, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  scope :pending, -> { where(state: "pending") }

  def pending?
    state == "pending"
  end

  # How late a pending schedule has to be before the sweep (below) sets
  # its job again, and how long the sweep then leaves it alone. A job that
  # is only retrying, or running, is late by seconds, and the retries
  # (PublishPageJob) are over in a few minutes.
  SWEEP_AFTER = 1.minute
  SWEEP_LEASE = 5.minutes

  # Sets PublishPageJob again for every pending schedule whose time has
  # passed by more than `after`, and that has not been set again in the
  # last `lease` (when given): one whose job never reached the queue, or
  # failed for good (a hard stop that Solid Queue found too late, a
  # database busy past the retries), would otherwise stay pending forever.
  # A job that was still coming anyway runs too, and finds the schedule
  # settled. Returns the ids set again.
  #
  # Run as the queue starts (config/initializers/solid_queue.rb), for every
  # overdue schedule, and every minute while it runs (the sweep, below).
  # The row's updated_at is when it was last set again: a schedule whose
  # job fails every time is tried every `lease`, not every minute.
  def self.enqueue_overdue!(at: Time.current, after: 0.seconds, lease: nil)
    due = pending.where(publish_at: ..(at - after))
    due = due.where(updated_at: ..(at - lease)) if lease
    due.order(:publish_at).pluck(:id).select do |id|
      next false unless pending.where(id: id).update_all(updated_at: at).positive?

      PublishPageJob.perform_later(id)
      true
    end
  end

  # The sweep EnqueueOverdueSchedulesJob runs each minute.
  def self.sweep_overdue!(at: Time.current)
    enqueue_overdue!(at: at, after: SWEEP_AFTER, lease: SWEEP_LEASE)
  end

  # Cancels it if it is still pending, and raises NotPending if it is not:
  # whoever cancels learns that the publish already happened, or that
  # someone else cancelled or replaced it. The job, when it comes, finds it
  # cancelled and does nothing.
  def cancel!(at: Time.current)
    raise NotPending, reload unless settle!("cancelled", at: at)

    self
  end

  # What PublishPageJob does when the time comes. Looks at everything again
  # first, inside one transaction (SQLite runs write transactions one at a
  # time, so nothing changes in between), and returns what it found:
  #
  #   :missing     the row is gone (its page was deleted);
  #   :not_pending it was cancelled, replaced, already run (a job that
  #                runs twice), or settled otherwise: nothing to do;
  #   :early       its time has not come (the job was run before it): it
  #                stays pending, and the caller sets the job again;
  #   :superseded  a publish since put this revision of the draft, or a
  #                later one, live: putting this one live would take the
  #                page back;
  #   :published   put live, as a new "publish" version of the scheduled
  #                document;
  #   :failed      the scheduled document no longer passes the checks.
  #
  # The scheduled version is what goes live, never the draft as it is
  # now: edits made after scheduling wait for the next publish.
  def run!(at: Time.current)
    self.class.transaction do
      begin
        reload
      rescue ActiveRecord::RecordNotFound
        return :missing
      end
      return :not_pending unless pending?
      return :early if at < publish_at

      page = Page.find(page_id)
      if page.published? && page.published_revision >= revision
        settle!("superseded", at: at)
        return :superseded
      end

      published = page.publish_scheduled!(self, at: at)
      settle!("published", at: at, published_version_id: published.id)
      :published
    end
  rescue BlockDocument::Invalid
    settle!("failed", at: at)
    :failed
  end

  # Moves it from pending to state, if it is still pending: one UPDATE that
  # names the state it expects, decided by the rows it changed, so two
  # writers can never both settle it. Returns whether it did.
  def settle!(state, at:, published_version_id: nil)
    changed = self.class.where(id: id, state: "pending")
      .update_all(state: state, settled_at: at, published_version_id: published_version_id, updated_at: at)
    reload if changed.positive?
    changed.positive?
  end
end
