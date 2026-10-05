require "test_helper"

# The responses as the editor reads them: what visitors sent with the forms
# of a published page, listed, read whole and deleted through the API. The
# responses are sent the way a visitor's browser sends them, to the page's
# own address (SubmissionsController), unless a test needs more of them
# than a visitor may send.
class Api::ResponsesTest < ActionDispatch::IntegrationTest
  ORIGIN = "http://www.example.com".freeze # the integration session's host
  ELSEWHERE = "https://evil.example".freeze

  FIELDS = [
    { "name" => "name", "kind" => "text", "label" => "Your name", "required" => false, "maxLength" => 120 },
    { "name" => "email", "kind" => "email", "label" => "Email", "required" => false },
    { "name" => "notes", "kind" => "textarea", "label" => "Anything we should know?", "required" => false, "maxLength" => 1000 },
    { "name" => "distance", "kind" => "checkbox", "label" => "I can swim 200 meters", "required" => false }
  ].freeze

  setup do
    SubmissionsController::LIMIT_STORE.clear
    @page = create_page(title: "Join", slug: "join")
  end

  def form_block(id = "join-form", items: FIELDS)
    { "id" => id, "type" => "form", "props" => { "items" => items, "submitLabel" => "Send request", "confirmation" => "Thank you." }, "style" => { "base" => {} }, "children" => [] }
  end

  def publish(*forms, page: @page)
    draft = Draft.find_by!(page_id: page.id)
    Draft.save_document!(page_id: page.id, revision: draft.revision, document: page_document(title: "Join", widgets: forms), save_id: "s#{draft.revision}")
    page.publish!
    page.reload
  end

  # A visitor sends a form from the published page, as its markup does, at
  # the time given; the response kept.
  def visitor_sends(answers, at:, form: "join-form", path: "/join")
    travel_to(at) { post path, params: { "form" => form, "answers" => answers, "website" => "" }, headers: { "Origin" => ORIGIN } }
    assert_response :see_other
    Submission.order(:id).last
  end

  def list(query = "")
    api :get, "/api/pages/#{@page.id}/responses#{query}"
    assert_response :ok
    json
  end

  test "the list holds the page's responses newest first, each with its form, its version and an excerpt, and counts each form's" do
    publish form_block, form_block("call-form", items: [ FIELDS[3], FIELDS[0] ])
    version = @page.published_version.number
    first = visitor_sends({ "name" => "Ann Diver", "email" => "ann@example.org", "notes" => "", "distance" => "yes" }, at: Time.utc(2026, 10, 5, 9, 0))
    second = visitor_sends({ "name" => "  ", "email" => "", "notes" => "Cold\r\n\twater   is fine " }, at: Time.utc(2026, 10, 5, 9, 5))
    third = visitor_sends({ "distance" => "yes", "name" => "Bo" }, form: "call-form", at: Time.utc(2026, 10, 5, 9, 10))
    fourth = visitor_sends({ "distance" => "yes" }, at: Time.utc(2026, 10, 5, 9, 15))

    answer = list

    assert_equal [
      { "id" => fourth.id, "formId" => "join-form", "versionNumber" => version, "submittedAt" => "2026-10-05T09:15:00.000Z", "excerpt" => nil },
      { "id" => third.id, "formId" => "call-form", "versionNumber" => version, "submittedAt" => "2026-10-05T09:10:00.000Z",
        "excerpt" => { "label" => "Your name", "text" => "Bo", "truncated" => false } },
      { "id" => second.id, "formId" => "join-form", "versionNumber" => version, "submittedAt" => "2026-10-05T09:05:00.000Z",
        "excerpt" => { "label" => "Anything we should know?", "text" => "Cold water is fine", "truncated" => false } },
      { "id" => first.id, "formId" => "join-form", "versionNumber" => version, "submittedAt" => "2026-10-05T09:00:00.000Z",
        "excerpt" => { "label" => "Your name", "text" => "Ann Diver", "truncated" => false } }
    ], answer["responses"]
    assert_nil answer["next"]
    assert_equal [ { "formId" => "call-form", "count" => 1 }, { "formId" => "join-form", "count" => 3 } ], answer["forms"]

    by_form = list("?form=call-form")
    assert_equal [ third.id ], by_form["responses"].map { |r| r["id"] }
    assert_equal answer["forms"], by_form["forms"], "the counts are the page's, whatever the query"
    assert_equal [], list("?form=gone-form")["responses"]
  end

  test "a page no one has answered has an empty list" do
    publish form_block

    assert_equal({ "responses" => [], "next" => nil, "forms" => [] }, list)
  end

  test "the list comes fifty at a time, and next continues it until it says null" do
    publish form_block, form_block("call-form")
    version = @page.published_version
    start = Time.utc(2026, 10, 5, 8, 0)
    kept = Array.new(56) do |i|
      form = FormBlock.find(version.document, i % 10 == 9 ? "call-form" : "join-form")
      Submission.record!(page: @page, version: version, form: form, answers: FormAnswers.new(form.fields, { "name" => "Visitor #{i}" }), at: start + i.minutes)
    end
    newest_first = kept.reverse.map(&:id)

    head = list
    assert_equal newest_first.first(50), head["responses"].map { |r| r["id"] }
    assert_equal newest_first[49], head["next"]
    tail = list("?before=#{head['next']}")
    assert_equal newest_first.drop(50), tail["responses"].map { |r| r["id"] }
    assert_nil tail["next"]

    joins = kept.select { |row| row.form_id == "join-form" }.reverse.map(&:id)
    assert_equal 51, joins.length
    by_form = list("?form=join-form")
    assert_equal [ joins.first(50), joins[49] ], [ by_form["responses"].map { |r| r["id"] }, by_form["next"] ]
    rest = list("?form=join-form&before=#{by_form['next']}")
    assert_equal [ joins.drop(50), nil ], [ rest["responses"].map { |r| r["id"] }, rest["next"] ]
    assert_equal [ { "formId" => "call-form", "count" => 5 }, { "formId" => "join-form", "count" => 51 } ], rest["forms"]
  end

  test "a response read whole keeps the version and the fields it was sent with, after the form changes and is published again" do
    publish form_block
    old_version = @page.published_version.number
    old = visitor_sends({ "name" => "Ann Diver", "email" => "ann@example.org", "notes" => "Cold water\r\nis fine", "distance" => "yes" }, at: Time.utc(2026, 10, 5, 9, 0))
    changed = [ FIELDS[0].merge("label" => "Full name"), { "name" => "phone", "kind" => "text", "label" => "Phone", "required" => false, "maxLength" => 30 } ]
    publish form_block(items: changed)
    new = visitor_sends({ "name" => "Bo", "phone" => "555 0100", "notes" => "dropped with its field" }, at: Time.utc(2026, 10, 5, 10, 0))

    api :get, "/api/pages/#{@page.id}/responses/#{old.id}"
    assert_response :ok
    assert_equal({
      "id" => old.id, "formId" => "join-form", "versionNumber" => old_version, "submittedAt" => "2026-10-05T09:00:00.000Z",
      "fields" => FIELDS,
      "answers" => { "name" => "Ann Diver", "email" => "ann@example.org", "notes" => "Cold water\nis fine", "distance" => true }
    }, json)

    api :get, "/api/pages/#{@page.id}/responses/#{new.id}"
    assert_response :ok
    assert_equal [ @page.published_version.number, changed, { "name" => "Bo", "phone" => "555 0100" } ], json.values_at("versionNumber", "fields", "answers")
    refute_equal old_version, json["versionNumber"]
  end

  test "what a visitor wrote comes back as the string written, in JSON that holds no markup" do
    publish form_block
    script = %(<script>alert("x")</script>)
    breakout = %(</textarea><img src=x onerror=alert(1)> & 'more')
    kept = visitor_sends({ "name" => script, "notes" => breakout }, at: Time.utc(2026, 10, 5, 9, 0))

    api :get, "/api/pages/#{@page.id}/responses/#{kept.id}"
    assert_equal "application/json", response.media_type
    assert_equal "nosniff", response.headers["X-Content-Type-Options"]
    assert_equal [ script, breakout ], json["answers"].values_at("name", "notes")
    assert_no_match(/[<>&]/, response.body, "no character of markup is written as itself")

    list_body = list
    assert_equal script, list_body.dig("responses", 0, "excerpt", "text")
    assert_no_match(/[<>&]/, response.body)
  end

  test "a response deleted is gone from the list and cannot be read; deleting it again is not found, and nothing else changes" do
    publish form_block
    published = @page.published_version_id
    kept = visitor_sends({ "name" => "Ann Diver" }, at: Time.utc(2026, 10, 5, 9, 0))
    other = visitor_sends({ "name" => "Bo" }, at: Time.utc(2026, 10, 5, 9, 5))

    api :delete, "/api/pages/#{@page.id}/responses/#{kept.id}"
    assert_response :no_content
    assert_empty response.body

    assert_equal [ other.id ], list["responses"].map { |r| r["id"] }
    assert_equal [ { "formId" => "join-form", "count" => 1 } ], list["forms"]
    api :get, "/api/pages/#{@page.id}/responses/#{kept.id}"
    assert_response :not_found
    api :delete, "/api/pages/#{@page.id}/responses/#{kept.id}"
    assert_response :not_found
    assert_equal({ "error" => "not_found", "message" => "There is nothing at this address." }, json)
    assert_equal published, @page.reload.published_version_id
    assert PageVersion.exists?(kept.page_version_id)
  end

  test "a response is found only under its own page, and by an id in the form of one" do
    publish form_block
    kept = visitor_sends({ "name" => "Ann Diver" }, at: Time.utc(2026, 10, 5, 9, 0))
    other = create_page(title: "Other", slug: "other")

    [ :get, :delete ].each do |method|
      api method, "/api/pages/#{other.id}/responses/#{kept.id}"
      assert_response :not_found, method
      [ "0", "-1", "#{kept.id}abc", "#{kept.id}.0", "99999999" ].each do |id|
        api method, "/api/pages/#{@page.id}/responses/#{id}"
        assert_response :not_found, "#{method} #{id}"
      end
    end
    api :get, "/api/pages/999999/responses"
    assert_response :not_found
    assert Submission.exists?(kept.id)
  end

  test "a delete from another site or another origin is refused, and the response stays" do
    publish form_block
    kept = visitor_sends({ "name" => "Ann Diver" }, at: Time.utc(2026, 10, 5, 9, 0))

    [ { "Origin" => ELSEWHERE }, { "Origin" => "null" }, { "Sec-Fetch-Site" => "cross-site" } ].each do |browser|
      delete "/api/pages/#{@page.id}/responses/#{kept.id}", headers: ApiRequests::JSON_HEADERS.merge(browser)
      assert_response :forbidden, browser.inspect
      assert_equal "forbidden_origin", json["error"]
    end
    assert Submission.exists?(kept.id)
  end

  test "a query the list does not take is 400 invalid_query naming its parameter" do
    publish form_block
    {
      "?page=2" => "page",
      "?form=join-form&form=call-form" => "form",
      "?form[]=join-form" => "form[]",
      "?form" => "form",
      "?form=" => "form",
      "?form=join%20form" => "form",
      "?form=#{'f' * 65}" => "form",
      "?before=0" => "before",
      "?before=-3" => "before",
      "?before=1.5" => "before",
      "?before=1e3" => "before",
      "?before=7&before=8" => "before"
    }.each do |query, parameter|
      api :get, "/api/pages/#{@page.id}/responses#{query}"
      assert_response :bad_request, query
      assert_equal [ "invalid_query", parameter ], json.values_at("error", "parameter"), query
    end
  end

  test "a query that is not UTF-8 cannot be read" do
    publish form_block

    api :get, "/api/pages/#{@page.id}/responses?form=%FF"

    assert_response :bad_request
    assert_equal "malformed_json", json["error"]
  end
end
