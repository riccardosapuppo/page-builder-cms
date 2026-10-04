# frozen_string_literal: true

module Api
  # Publishing at a set time: the page's scheduled publishes, a new one,
  # and cancelling one. PublishPageJob does the publishing when the time
  # comes.
  class SchedulesController < BaseController
    # GET /api/pages/:id/schedules, newest first: the pending one, if any,
    # and what became of the earlier ones.
    def index
      page = find_page
      schedules = page.scheduled_publications.includes(:version, :published_version).order(id: :desc)
      render json: { "schedules" => schedules.map { |schedule| schedule_json(schedule) } }
    end

    # POST /api/pages/:id/schedules {revision, at}
    #
    # Keeps the draft at revision as a "scheduled" version and publishes
    # that version at `at`, an ISO 8601 time in UTC. revision is the draft
    # revision the person scheduling has seen: 409 if the draft has moved
    # on, as for a publish. A pending schedule of the page is replaced, and
    # answered as `replaced`.
    def create
      check = BodyCheck.new(body, allowed: %w[revision at])
      check.integer("revision", required: true, minimum: 0)
      check.utc_time("at", required: true)
      check.finish!

      page = find_page
      schedule, replaced = page.schedule_publish!(revision: body["revision"], publish_at: Time.iso8601(body["at"]))
      render json: {
        "schedule" => schedule_json(schedule),
        "version" => version_json(schedule.version, published_version_id: page.published_version_id),
        "replaced" => replaced && schedule_json(replaced)
      }, status: :created
    end

    # POST /api/pages/:id/schedules/:schedule_id/cancel
    #
    # 409 when it is no longer pending (published, cancelled, replaced...),
    # with the schedule as it is: the person learns what happened instead.
    def cancel
      schedule = find_page.scheduled_publications.find(path_integer(:schedule_id))
      schedule.cancel!
      render json: { "schedule" => schedule_json(schedule) }
    rescue ScheduledPublication::NotPending => e
      render_error :conflict, "not_pending", e.message, schedule: schedule_json(e.schedule)
    end

    private

    def find_page
      Page.find(path_integer(:id))
    end

    def record_error_pointers
      { publish_at: "/at", revision: "/revision" }
    end
  end
end
