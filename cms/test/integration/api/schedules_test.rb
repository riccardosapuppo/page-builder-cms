require "test_helper"

# Publishing at a set time, through the API, with the job run the way the
# queue runs it: at its time and not before (perform_enqueued_jobs(at:);
# PIANO, section 6). Each test looks at what a visitor gets at the page's
# address, before and after the time.
class Api::SchedulesTest < ActionDispatch::IntegrationTest
  include ActiveJob::TestHelper

  NOW = Time.utc(2026, 10, 4, 9, 0)
  AT = Time.utc(2026, 10, 5, 7, 15)

  setup do
    @page = create_page(title: "Spring swims", slug: "spring")
  end

  def schedule(at: AT, revision: @page.draft.reload.revision)
    travel_to(NOW) { api :post, "/api/pages/#{@page.id}/schedules", { "revision" => revision, "at" => at.utc.iso8601(3) } }
  end

  # Runs the jobs due at `time`, as the queue would then.
  def run_jobs_at(time)
    travel_to(time) { perform_enqueued_jobs(at: Time.current) }
  end

  def visitor_sees(heading)
    get "/spring"
    assert_response :ok
    assert_select "main h1", text: heading
  end

  def logged
    io = StringIO.new
    saved = ActiveJob::Base.logger
    ActiveJob::Base.logger = ActiveSupport::Logger.new(io)
    yield
    io.string
  ensure
    ActiveJob::Base.logger = saved
  end

  test "a scheduled publish puts the draft as it was when scheduled live at its time, and not before" do
    save_draft @page, revision: 0, document: page_document(title: "Spring swims, live at seven")

    schedule
    assert_response :created
    scheduled = json["schedule"]
    assert_equal({ "at" => "2026-10-05T07:15:00.000Z", "revision" => 1, "state" => "pending", "createdAt" => "2026-10-04T09:00:00.000Z",
                   "settledAt" => nil, "publishedVersionNumber" => nil }, scheduled.except("id", "versionNumber"))
    assert_equal [ "scheduled", false ], json["version"].values_at("reason", "published")
    assert_equal scheduled["versionNumber"], json.dig("version", "number")
    assert_nil json["replaced"]

    # Edits after scheduling wait for the next publish.
    travel_to(NOW + 1.hour) { save_draft @page, revision: 1, document: page_document(title: "Not for seven") }

    run_jobs_at(AT - 1.second)
    get "/spring"
    assert_response :not_found
    api :get, "/api/pages/#{@page.id}"
    assert_equal scheduled, json["scheduled"]
    assert_nil json["published"]

    run_jobs_at(AT)
    visitor_sees "Spring swims, live at seven"
    assert_no_match "Not for seven", response.body
    api :get, "/api/pages/#{@page.id}"
    assert_nil json["scheduled"]
    assert_equal({ "slug" => "spring", "draftRevision" => 1, "publishedAt" => "2026-10-05T07:15:00.000Z" }, json["published"].except("versionNumber"))
    assert_equal 2, json.dig("draft", "revision")

    api :get, "/api/pages/#{@page.id}/schedules"
    done = json["schedules"].sole
    assert_equal [ "published", "2026-10-05T07:15:00.000Z" ], done.values_at("state", "settledAt")
    api :get, "/api/pages/#{@page.id}/versions/#{done['publishedVersionNumber']}"
    assert_equal [ "publish", true, "Spring swims, live at seven" ], [ json["reason"], json["published"], json.dig("document", "title") ]
  end

  test "a restore before the time changes nothing: the scheduled revision goes live" do
    save_draft @page, revision: 0, document: page_document(title: "Before"), save_id: "a1"
    api :post, "/api/pages/#{@page.id}/versions", { "name" => "Before" }
    before = json["number"]
    save_draft @page, revision: 1, document: page_document(title: "Scheduled words"), save_id: "a2"
    schedule

    travel_to(NOW + 1.hour) { api :post, "/api/pages/#{@page.id}/versions/#{before}/restore" }
    assert_equal "Before", json.dig("draft", "document", "title")

    run_jobs_at(AT)
    visitor_sees "Scheduled words"
  end

  test "a cancelled publish does nothing at its time, and says so in the log" do
    save_draft @page, revision: 0, document: page_document(title: "Never live")
    schedule
    id = json.dig("schedule", "id")

    travel_to(NOW + 1.hour) { api :post, "/api/pages/#{@page.id}/schedules/#{id}/cancel" }
    assert_response :ok
    assert_equal [ "cancelled", "2026-10-04T10:00:00.000Z" ], json["schedule"].values_at("state", "settledAt")
    api :get, "/api/pages/#{@page.id}"
    assert_nil json["scheduled"]

    log = logged { run_jobs_at(AT) }
    get "/spring"
    assert_response :not_found
    assert_match "scheduled publish #{id} of page #{@page.id}: cancelled at 2026-10-04T10:00:00Z, nothing to do", log
  end

  test "a second schedule replaces the first, whose time then passes with nothing published" do
    save_draft @page, revision: 0, document: page_document(title: "First plan"), save_id: "a1"
    schedule(at: AT)
    first = json.dig("schedule", "id")
    save_draft @page, revision: 1, document: page_document(title: "Second plan"), save_id: "a2"

    schedule(at: AT + 1.day)
    assert_response :created
    assert_equal [ first, "replaced" ], json["replaced"].values_at("id", "state")

    log = logged { run_jobs_at(AT) }
    get "/spring"
    assert_response :not_found
    assert_match "scheduled publish #{first} of page #{@page.id}: replaced", log

    run_jobs_at(AT + 1.day)
    visitor_sees "Second plan"
    api :get, "/api/pages/#{@page.id}/schedules"
    assert_equal [ "published", "replaced" ], json["schedules"].map { |s| s["state"] }
  end

  test "a publish by hand supersedes the schedule at once, and at its time the page does not go back" do
    save_draft @page, revision: 0, document: page_document(title: "Scheduled"), save_id: "a1"
    schedule
    id = json.dig("schedule", "id")
    save_draft @page, revision: 1, document: page_document(title: "Published by hand"), save_id: "a2"
    travel_to(NOW + 1.hour) { api :post, "/api/pages/#{@page.id}/publish", { "revision" => 2 } }

    api :get, "/api/pages/#{@page.id}"
    assert_nil json["scheduled"]
    api :get, "/api/pages/#{@page.id}/schedules"
    assert_equal [ "superseded", "2026-10-04T10:00:00.000Z" ], json["schedules"].sole.values_at("state", "settledAt")

    log = logged { run_jobs_at(AT) }

    visitor_sees "Published by hand"
    assert_match "scheduled publish #{id} of page #{@page.id}: superseded at 2026-10-04T10:00:00Z, nothing to do", log
  end

  test "a job that finds its revision already live, however it got there, publishes nothing" do
    save_draft @page, revision: 0, document: page_document(title: "Scheduled"), save_id: "a1"
    schedule
    id = json.dig("schedule", "id")
    save_draft @page, revision: 1, document: page_document(title: "Live another way"), save_id: "a2"
    # Live at revision 2 without passing through Page#publish!, which
    # would have settled the schedule: the job's own look must hold.
    live = @page.send(:put_live!, @page.draft.reload.checked_document, revision: 2, slug: "spring", at: NOW + 1.hour)

    log = logged { run_jobs_at(AT) }

    visitor_sees "Live another way"
    assert_equal live.id, @page.reload.published_version_id
    assert_equal "superseded", ScheduledPublication.find(id).state
    assert_match "scheduled publish #{id} of page #{@page.id}: revision 1 or a later one is already live, nothing to do", log
  end

  test "a job that runs twice publishes once, and the second run says why it does nothing" do
    save_draft @page, revision: 0, document: page_document(title: "Once")
    schedule
    id = json.dig("schedule", "id")
    run_jobs_at(AT)
    versions = @page.versions.count

    log = logged { travel_to(AT + 1.minute) { PublishPageJob.perform_now(id) } }

    assert_equal versions, @page.versions.count
    assert_match "scheduled publish #{id} of page #{@page.id}: published at 2026-10-05T07:15:00Z, nothing to do", log
  end

  test "a job run before its time publishes nothing and is set again for its time" do
    save_draft @page, revision: 0, document: page_document(title: "Patience")
    schedule
    id = json.dig("schedule", "id")
    clear_enqueued_jobs

    travel_to(AT - 1.hour) { PublishPageJob.perform_now(id) }

    get "/spring"
    assert_response :not_found
    assert_enqueued_with(job: PublishPageJob, args: [ id ], at: AT)
    run_jobs_at(AT)
    visitor_sees "Patience"
  end

  test "the scheduled publish takes the draft's address as it is at the time, like any publish" do
    save_draft @page, revision: 0, document: page_document(title: "Moved")
    schedule
    api :patch, "/api/pages/#{@page.id}", { "slug" => "spring-swims" }

    run_jobs_at(AT)

    get "/spring-swims"
    assert_response :ok
    assert_select "main h1", text: "Moved"
  end

  test "a time that has passed, or is more than a year away, or does not exist, is refused at /at" do
    save_draft @page, revision: 0, document: page_document(title: "Whenever")
    [ [ "2026-10-04T09:00:00.000Z", "inThePast" ], [ "2026-10-04T08:59:59Z", "inThePast" ], [ "2027-10-04T09:00:01Z", "tooFar" ],
      [ "2026-02-30T08:00:00Z", "format" ], [ "2026-10-05T24:00:00Z", "format" ], [ "2026-10-05 08:00", "pattern" ],
      [ "2026-10-05T08:00:00+01:00", "pattern" ], [ 1_791_000_000, "type" ] ].each do |at, keyword|
      travel_to(NOW) { api :post, "/api/pages/#{@page.id}/schedules", { "revision" => 1, "at" => at } }

      assert_response :unprocessable_content, at.inspect
      assert_equal [ [ "/at", keyword ] ], error_pointers, at.inspect
    end
    travel_to(NOW) { api :post, "/api/pages/#{@page.id}/schedules", { "revision" => 1, "at" => "2027-10-04T09:00:00Z" } }
    assert_response :created, "exactly a year ahead is within a year"
  end

  test "a revision already live is refused at /revision; a missing member at its place" do
    save_draft @page, revision: 0, document: page_document(title: "Live already")
    api :post, "/api/pages/#{@page.id}/publish"

    schedule(revision: 1)
    assert_response :unprocessable_content
    assert_equal [ [ "/revision", "alreadyLive" ] ], error_pointers

    travel_to(NOW) { api :post, "/api/pages/#{@page.id}/schedules", {} }
    assert_equal [ [ "/revision", "required" ], [ "/at", "required" ] ], error_pointers
    assert_equal 0, ScheduledPublication.count
    assert_equal 0, enqueued_jobs.size
  end

  test "scheduling from a revision someone has saved past is a conflict, and nothing is scheduled" do
    save_draft @page, revision: 0, document: page_document(title: "Seen"), save_id: "a1"
    save_draft @page, revision: 1, document: page_document(title: "Not seen"), save_id: "a2"

    schedule(revision: 1)

    assert_response :conflict
    assert_equal [ 2, "a2" ], json.values_at("currentRevision", "lastSaveId")
    assert_equal 0, ScheduledPublication.count
    assert_equal [], @page.versions.where(reason: "scheduled").to_a
  end

  test "cancelling one that is no longer pending is a conflict that says what became of it" do
    save_draft @page, revision: 0, document: page_document(title: "Gone live")
    schedule
    id = json.dig("schedule", "id")
    run_jobs_at(AT)

    api :post, "/api/pages/#{@page.id}/schedules/#{id}/cancel"

    assert_response :conflict
    assert_equal [ "not_pending", "published" ], [ json["error"], json.dig("schedule", "state") ]
    visitor_sees "Gone live"
  end

  test "a schedule is found only under its own page" do
    save_draft @page, revision: 0, document: page_document(title: "Mine")
    schedule
    id = json.dig("schedule", "id")
    other = create_page(title: "Other", slug: "other")

    api :post, "/api/pages/#{other.id}/schedules/#{id}/cancel"
    assert_response :not_found
    api :post, "/api/pages/#{@page.id}/schedules/0/cancel"
    assert_response :not_found
    api :get, "/api/pages/#{other.id}/schedules"
    assert_equal [], json["schedules"]
    assert_equal "pending", ScheduledPublication.find(id).state
  end

  test "the page list says which pages have a publish waiting" do
    save_draft @page, revision: 0, document: page_document(title: "Waiting")
    schedule
    create_page(title: "Other", slug: "other")

    api :get, "/api/pages"

    assert_equal [ [ "spring", "2026-10-05T07:15:00.000Z" ], [ "other", nil ] ],
                 json["pages"].map { |page| [ page["slug"], page.dig("scheduled", "at") ] }
    assert_equal "/api/pages/#{@page.id}/schedules", json["pages"].first.dig("links", "schedules")
  end
end
