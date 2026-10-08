require "test_helper"

# A visitor's form, sent from a published page as the browser sends it
# (application/x-www-form-urlencoded, with the Origin header a browser sets
# on every form it posts), and what comes back: the confirmation, the page
# drawn again with what to put right, or a refusal; and what is kept.
class SubmissionsTest < ActionDispatch::IntegrationTest
  include PageCacheStore

  ORIGIN = "http://www.example.com".freeze

  FIELDS = [
    { "name" => "name", "kind" => "text", "label" => "Name", "required" => true, "maxLength" => 100 },
    { "name" => "email", "kind" => "email", "label" => "Email", "required" => true },
    { "name" => "notes", "kind" => "textarea", "label" => "Anything we should know?", "required" => false, "maxLength" => 1000 },
    { "name" => "distance", "kind" => "checkbox", "label" => "I can swim 200 meters", "required" => true }
  ].freeze

  GOOD = { "name" => "Ann Diver", "email" => "ann@example.org", "notes" => "Cold water\r\nis fine", "distance" => "yes" }.freeze

  setup { SubmissionsController::LIMIT_STORE.clear }

  def form_block(id = "join-form", items: FIELDS, confirmation: "Thank you. We reply within two days.")
    { "id" => id, "type" => "form", "props" => { "items" => items, "submitLabel" => "Send request", "confirmation" => confirmation }, "style" => { "base" => {} }, "children" => [] }
  end

  def publish(title: "Join", slug: "join", widgets: [ heading_block("h", "Join a trial swim"), form_block ], home: false, page: nil)
    page ||= create_page(title: title, slug: slug)
    draft = Draft.find_by!(page_id: page.id)
    Draft.save_document!(page_id: page.id, revision: draft.revision, document: page_document(title: title, widgets: widgets), save_id: "s#{draft.revision}")
    page.publish!
    page.make_home! if home
    page.reload
  end

  # The form as the page's own markup sends it: the block's id, each answer
  # by field name, the field for robots empty.
  def send_form(path, answers = GOOD, form: "join-form", website: "", origin: ORIGIN, env: {})
    headers = origin ? { "Origin" => origin } : {}
    post path, params: { "form" => form, "answers" => answers, "website" => website }, headers: headers, env: env
    response
  end

  def html = Nokogiri::HTML5(response.body)

  def with_forgery_protection
    before = ActionController::Base.allow_forgery_protection
    ActionController::Base.allow_forgery_protection = true
    yield
  ensure
    ActionController::Base.allow_forgery_protection = before
  end

  def assert_private(what)
    assert_equal "no-store", response.headers["Cache-Control"], what
    assert_equal "noindex", response.headers["X-Robots-Tag"], what
    assert_nil response.headers["Set-Cookie"], "#{what} set a cookie"
  end

  # The token-based protection is on, as in production: the form carries
  # no token, and is kept all the same.
  test "a form sent from the published page is kept with its version and a copy of its fields, then 303 to a confirmation no one stores" do
    page = publish
    with_forgery_protection do
      assert_difference -> { Submission.count }, 1 do
        send_form("/join")
      end
      assert_response :see_other
      assert_equal "#{ORIGIN}/join/sent/join-form", response.location
      assert_private "the answer to the post"

      kept = Submission.last
      assert_equal [ page, page.published_version, "join-form" ], [ kept.page, kept.page_version, kept.form_id ]
      assert_equal FIELDS, kept.fields
      assert_equal({ "name" => "Ann Diver", "email" => "ann@example.org", "notes" => "Cold water\nis fine", "distance" => true }, kept.answers)

      follow_redirect!
      assert_response :ok
      assert_private "the confirmation"
      assert_select "title", "Form sent: Join"
      assert_select "h1", "Form sent"
      assert_select "main p", "Thank you. We reply within two days."
      assert_select "main a[href='/join']", "Back to Join"
      assert_select "meta[name=robots][content=noindex]"
    end
  end

  test "the home page's form posts to / and its confirmation is at /sent/<form id>; its slug's is not a second address" do
    publish(title: "Slack Water", slug: "home", home: true)

    send_form("/")
    assert_response :see_other
    assert_equal "#{ORIGIN}/sent/join-form", response.location
    follow_redirect!
    assert_response :ok
    assert_select "main a[href='/']", "Back to Slack Water"

    get "/home/sent/join-form"
    assert_response :not_found
    get "/sent/no-such-form"
    assert_response :not_found
    assert_private "a confirmation that does not exist"
  end

  test "an answer keeps the fields as they were when the form changes in a later version" do
    page = publish
    send_form("/join")
    first = Submission.last

    renamed = FIELDS.map { |f| f["name"] == "name" ? f.merge("label" => "Full name") : f }.reject { |f| f["name"] == "notes" }
    publish(page: page, title: "Join", widgets: [ form_block(items: renamed) ])
    send_form("/join", GOOD.merge("notes" => "no longer asked"))

    assert_equal FIELDS, first.reload.fields
    assert_equal "Cold water\nis fine", first.answers["notes"]
    latest = Submission.last
    assert_equal page.reload.published_version, latest.page_version
    assert_not_equal first.page_version, latest.page_version
    assert_equal [ "Full name", "Email", "I can swim 200 meters" ], latest.fields.map { |f| f["label"] }
    assert_not latest.answers.key?("notes"), "an answer to a field the form no longer has is not kept"
  end

  test "a form sent from a page the cache served is kept, and neither the post nor its refusal touches the page's cache" do
    publish
    with_page_cache do |calls|
      get "/join"
      written = written(calls)
      assert_operator written, :>, 0, "the first visit draws the page and keeps it"

      calls.clear
      get "/join"
      assert_response :ok
      assert_equal [ 0, 1, 1 ], [ written(calls), asked(calls), found(calls) ], "the second visit reads the whole page from the cache"
      form = html.at_css("form.sw-form")
      assert_equal "join-form", form.at_css("input[name=form]")["value"]

      calls.clear
      send_form("/join")
      assert_response :see_other
      follow_redirect!
      assert_response :ok
      send_form("/join", GOOD.merge("email" => "not an address"))
      assert_response :unprocessable_content
      assert_equal [], calls, "a post, its confirmation and a refusal read and write nothing in the page's cache"

      get "/join"
      assert_equal [ 0, 1 ], [ written(calls), found(calls) ], "the page is still read whole from the cache"
    end
    assert_equal 1, Submission.count
  end

  test "a refused form is drawn again with what was written, each refusal tied to its field and listed above the page, and nothing is kept" do
    publish
    assert_no_difference -> { Submission.count } do
      send_form("/join", { "name" => "   ", "email" => "not an address", "notes" => "Hello\r\nthere" })
    end
    assert_response :unprocessable_content
    assert_private "the page drawn again"
    assert_select "title", "Error: Join"

    page = html
    name = page.at_css("input[name='answers[name]']")
    email = page.at_css("input[name='answers[email]']")
    notes = page.at_css("textarea[name='answers[notes]']")
    box = page.at_css("input[name='answers[distance]']")
    assert_equal "   ", name["value"]
    assert_equal "not an address", email["value"]
    assert_equal "Hello\nthere", notes.text
    assert_nil box["checked"]
    { name => FormAnswers::FILL, email => FormAnswers::EMAIL, box => FormAnswers::TICK }.each do |field, message|
      assert_equal "true", field["aria-invalid"]
      assert_equal message, page.at_css("[id='#{field['aria-describedby']}']")&.text, field["name"]
    end
    assert_nil notes["aria-invalid"]

    summary = page.at_css("main > #form_errors [role=alert]")
    assert_equal "Your form was not sent", summary.at_css("h2").text
    assert_equal [ [ "#join-form:name", "Name: #{FormAnswers::FILL}" ], [ "#join-form:email", "Email: #{FormAnswers::EMAIL}" ], [ "#join-form:distance", "I can swim 200 meters: #{FormAnswers::TICK}" ] ],
                 summary.css("li a").map { |a| [ a["href"], a.text ] }
    summary.css("li a").each { |a| assert page.at_css("[id='#{a['href'].delete_prefix('#')}']"), "#{a['href']} names a field on the page" }
  end

  test "a form from another site, or with no Origin, is refused with 403 and nothing is kept" do
    publish
    [ "https://elsewhere.example", "http://www.example.com:8080", "https://www.example.com", "null", nil ].each do |origin|
      assert_no_difference -> { Submission.count } do
        send_form("/join", origin: origin)
      end
      assert_response :forbidden, origin.inspect
      assert_private "a refusal"
      assert_select "h1", "Not sent"
      assert_select "main a[href='/join']", "Back to the page"
    end
  end

  # Behind a front proxy every visitor is one address, so a form refused for
  # its Origin must not count: a page of another site could use up the
  # whole site's count. These come first and go past the limit; were they
  # counted, the last would be 429 and the first kept form after them too.
  test "the eleventh form from one address within ten minutes is refused with 429, forms from another site do not count, another address is not refused, and after the window the first can send again" do
    publish
    first = { "REMOTE_ADDR" => "198.51.100.7" }
    (SubmissionsController::LIMIT + 1).times do |i|
      send_form("/join", origin: i.even? ? "https://elsewhere.example" : nil, env: first)
      assert_response :forbidden, "form #{i + 1} from another site, or with no Origin"
    end
    SubmissionsController::LIMIT.times do |i|
      kept = i.even?
      send_form("/join", kept ? GOOD : GOOD.merge("email" => "bad"), env: first)
      assert_response kept ? :see_other : :unprocessable_content, "form #{i + 1}: kept, or refused for what it holds, which counts too"
    end

    assert_no_difference -> { Submission.count } do
      send_form("/join", env: first)
    end
    assert_response :too_many_requests
    assert_equal "600", response.headers["Retry-After"]
    assert_private "the limit's refusal"
    assert_select "main p", /Too many forms were sent from your connection/

    send_form("/join", env: { "REMOTE_ADDR" => "198.51.100.8" })
    assert_response :see_other

    travel SubmissionsController::WINDOW + 1.second do
      send_form("/join", env: first)
      assert_response :see_other
    end
  end

  # The count is under the socket's peer. Rails' own remote_ip takes
  # X-Forwarded-For and Client-Ip from any peer, so a limit keyed on it was
  # no limit: one header changed at every send gave a count of its own, and
  # one naming another visitor's address used that visitor's up. 203.0.113.9
  # is a public address (RFC 5737), no proxy of ours.
  test "the address a form is counted under is the socket's peer: a header naming another does not change it, and does not use up that address's count" do
    publish
    peer = "203.0.113.9"
    victim = "198.51.100.77"
    sent = ->(i, header) { send_form("/join", env: { "REMOTE_ADDR" => peer, header => i.even? ? victim : "192.0.2.#{i + 1}" }) }

    SubmissionsController::LIMIT.times do |i|
      sent.(i, i % 3 == 0 ? "HTTP_CLIENT_IP" : "HTTP_X_FORWARDED_FOR")
      assert_response :see_other, "form #{i + 1} from one peer"
    end
    assert_no_difference -> { Submission.count } do
      sent.(SubmissionsController::LIMIT, "HTTP_X_FORWARDED_FOR")
    end
    assert_response :too_many_requests, "the eleventh from one peer, whatever its headers name"

    send_form("/join", env: { "REMOTE_ADDR" => victim })
    assert_response :see_other, "the address those headers named still has its whole count"
  end

  # The harness's own way to give each test an address (config/environments/
  # e2e.rb sets it): the limit asks config.x.submission_limit_by at every
  # send, so this takes effect without a restart of anything.
  test "the address the limit counts under is the one config.x.submission_limit_by names" do
    publish
    config = Rails.configuration.x
    saved = config.submission_limit_by
    config.submission_limit_by = ->(request) { request.remote_ip }
    from = ->(address) { send_form("/join", env: { "REMOTE_ADDR" => "127.0.0.1", "HTTP_X_FORWARDED_FOR" => address }) }
    begin
      (SubmissionsController::LIMIT + 1).times do |i|
        from.("198.51.100.#{i + 1}")
        assert_response :see_other, "form #{i + 1}, each naming an address of its own"
      end
      (SubmissionsController::LIMIT - 1).times do |i|
        from.("198.51.100.1")
        assert_response :see_other, "form #{i + 2} of the first address"
      end
      from.("198.51.100.1")
      assert_response :too_many_requests, "the eleventh of the first address"
    ensure
      config.submission_limit_by = saved
    end
  end

  # What a visitor writes is kept in the database, never in the log. The
  # parameters line of the request is where Rails would write it.
  test "what a visitor wrote is filtered from the log" do
    publish
    log = StringIO.new
    saved = ActionController::Base.logger
    ActionController::Base.logger = ActiveSupport::Logger.new(log)
    begin
      send_form("/join", GOOD.merge("name" => "Ann Diver", "email" => "ann.diver@example.org", "notes" => "I swim at dawn, call me Ishmael"))
    ensure
      ActionController::Base.logger = saved
    end

    assert_response :see_other
    # Ruby 3.4 prints a hash as {"answers" => ...}, Ruby 3.3 as {"answers"=>...}.
    assert_match(/"answers" ?=> ?"\[FILTERED\]"/, log.string, "the request's parameters were logged, answers filtered")
    [ "Ann Diver", "ann.diver@example.org", "Ishmael" ].each { |answer| refute_includes log.string, answer }
  end

  test "a form with the field for robots filled in is answered as if kept, and nothing is kept" do
    publish
    assert_no_difference -> { Submission.count } do
      send_form("/join", website: "https://spam.example")
    end
    assert_response :see_other
    assert_equal "#{ORIGIN}/join/sent/join-form", response.location
  end

  # The page's markup names the field "website" and sends it empty; only a
  # client that does not use the page sends it as a list or a hash, even an
  # empty one, so that is a robot too.
  test "the field for robots sent as a list or a hash, even empty, is answered as if kept, and nothing is kept" do
    publish
    [ [ "" ], [ "https://spam.example" ], { "url" => "" } ].each do |website|
      assert_no_difference -> { Submission.count }, website.inspect do
        send_form("/join", website: website)
      end
      assert_response :see_other, website.inspect
      assert_equal "#{ORIGIN}/join/sent/join-form", response.location, website.inspect
    end
    send_form("/join")
    assert_response :see_other
    assert_equal 1, Submission.count, "a person's form is still kept"
  end

  test "each answer is held to its field's limit, counting a line break as one character as the browser does" do
    publish(widgets: [ form_block(items: [ FIELDS[0], FIELDS[2].merge("maxLength" => 10) ]) ])

    send_form("/join", { "name" => "a" * 101, "notes" => "abcd\r\nefgh\r\n" })
    assert_response :unprocessable_content
    assert_equal "Use at most 100 characters; this answer has 101.", html.at_css("[id='join-form:name:error']")&.text
    assert_nil html.at_css("[id='join-form:notes:error']"), "ten characters once each CR LF is one"

    send_form("/join", { "name" => "é" * 100, "notes" => "abcd\r\nefghij" })
    assert_response :unprocessable_content
    assert_nil html.at_css("[id='join-form:name:error']"), "100 characters of two bytes each are 100"
    assert_equal "Use at most 10 characters; this answer has 11.", html.at_css("[id='join-form:notes:error']")&.text
  end

  # The body's limit sits above the largest body a browser can send, so it
  # never takes the place of a field's own: a field one character over is
  # told so by its message, and only a body no form makes is refused whole.
  test "the largest form the schema allows passes the body's limit at every field's limit and one character over, and a larger body gets 413" do
    longest = FormBlock::LONGEST.values.max
    items = (1..FormBlock::MOST_FIELDS).map { |n| { "name" => "field-#{n}", "kind" => "textarea", "label" => "Field #{n}", "required" => true, "maxLength" => longest } }
    publish(widgets: [ form_block(items: items) ])
    answers = items.to_h { |item| [ item["name"], "\u{1D11E}" * longest ] }
    answers["field-20"] += "\u{1D11E}"

    send_form("/join", answers)
    assert_operator request.content_length, :<=, SubmissionsController::MAX_BODY
    assert_response :unprocessable_content
    assert_equal "Use at most 5000 characters; this answer has 5001.", html.at_css("[id='join-form:field-20:error']")&.text
    assert_equal 1, html.css(".sw-field-error").size

    body = "form=join-form&answers%5Bfield-1%5D=" + ("a" * (SubmissionsController::MAX_BODY - 35))
    assert_equal SubmissionsController::MAX_BODY + 1, body.bytesize
    assert_no_difference -> { Submission.count } do
      post "/join", params: body, headers: { "Origin" => ORIGIN, "CONTENT_TYPE" => "application/x-www-form-urlencoded" }
    end
    assert_response :content_too_large
    assert_private "the size's refusal"
  end

  test "only a form's own encoding is read: anything else is 415, and answers no browser sends from the form are 400" do
    publish
    post "/join", params: { "form" => "join-form", "answers" => GOOD }.to_json, headers: { "Origin" => ORIGIN, "CONTENT_TYPE" => "application/json" }
    assert_response :unsupported_media_type
    post "/join", params: { "form" => "join-form", "answers" => GOOD }, headers: { "Origin" => ORIGIN, "CONTENT_TYPE" => "multipart/form-data" }
    assert_response :unsupported_media_type

    [
      { "answers" => GOOD },
      { "form" => [ "join-form" ], "answers" => GOOD },
      { "form" => "join-form", "answers" => "Ann" },
      { "form" => "join-form", "answers" => GOOD.merge("name" => [ "Ann" ]) },
      { "form" => "join-form", "answers" => GOOD.merge("name" => { "first" => "Ann" }) },
      { "form" => "join-form", "answers" => GOOD.merge("distance" => "on") }
    ].each do |params|
      post "/join", params: params.merge("website" => ""), headers: { "Origin" => ORIGIN }
      assert_response :bad_request, params.inspect
      assert_select "h1", "Not sent"
    end
    assert_equal 0, Submission.count
  end

  test "a form no longer on the page is 409, an address with no page is 404, and an old address of the page still takes its form" do
    page = publish
    send_form("/join", form: "gone-form")
    assert_response :conflict
    assert_select "main p", /no longer on the page/

    send_form("/nowhere")
    assert_response :not_found
    assert_private "the 404 page after a post"

    page.draft.update!(slug: "join-us")
    page.publish!
    send_form("/join")
    assert_response :see_other
    assert_equal "#{ORIGIN}/join-us/sent/join-form", response.location
    assert_equal [ page.id ], Submission.pluck(:page_id)
  end

  # A page never published has no live address but its draft may already
  # hold a form; marked as home, it is the page / would serve. Neither its
  # form nor its confirmation exists for a visitor yet.
  test "a form or a confirmation of a page never published is 404, the home page's included, and nothing is kept" do
    home = create_page(title: "Home", slug: "home")
    other = create_page(title: "Join", slug: "join")
    [ home, other ].each do |page|
      draft = Draft.find_by!(page_id: page.id)
      Draft.save_document!(page_id: page.id, revision: draft.revision, document: page_document(title: "Join", widgets: [ form_block ]), save_id: "s#{draft.revision}")
    end
    home.make_home!

    assert_no_difference -> { Submission.count } do
      { "/" => "the home page", "/join" => "a page at its draft's address", "/home" => "the home page at its draft's address" }.each do |path, what|
        send_form(path)
        assert_response :not_found, "a form posted to #{what}"
        assert_private "the 404 after a form posted to #{what}"
      end
    end
    [ "/sent/join-form", "/join/sent/join-form", "/home/sent/join-form" ].each do |path|
      get path
      assert_response :not_found, path
      assert_private "the confirmation at #{path}"
    end
  end

  test "a form sent from the draft preview is answered that forms are sent from the published page, and nothing is kept" do
    page = publish
    with_forgery_protection do
      assert_no_difference -> { Submission.count } do
        post "/preview/#{page.id}", params: { "form" => "join-form", "answers" => GOOD, "website" => "" }
      end
    end
    assert_response :forbidden
    assert_private "the preview's refusal"
    assert_select "h1", "Not sent from a preview"
    assert_select "main a[href='/preview/#{page.id}']", "Back to the page"
  end
end
