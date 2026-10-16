# frozen_string_literal: true

# A fake of Stripe's API for the tests, listening on 127.0.0.1, so that no
# test reaches the network: the two calls the shop makes, answered as
# Stripe answers them, its JSON and its errors, and nothing else.
#
# - POST /v1/checkout/sessions, form encoded as Stripe reads it: a session
#   of mode payment for its line items, with an id of Stripe's test mode
#   (cs_test_...), the address of its page on the fake's own origin
#   (/c/pay/<id>), open and unpaid, its amount the sum of its lines. A
#   parameter missing, or a line whose unit amount is no whole number of
#   the smallest unit, is Stripe's 400 (invalid_request_error).
# - GET /v1/checkout/sessions/<id>: the session as it is now; one it never
#   made is Stripe's 404 (resource_missing).
# - Anything else is Stripe's 404, and a key other than the fake's Stripe's
#   401, "Invalid API Key provided", the key masked as Stripe masks it.
#
# And what a test does to it, which Stripe's API has no call for: a
# session paid, as a visitor paying on Stripe's page leaves it (complete,
# paid, the email they gave; for a total of nothing, complete and needing
# no payment, as Stripe completes a session that costs nothing), complete
# and unpaid (a payment that takes days), or expired; the next answers
# made Stripe's 500. A test of the CMS calls these on the object, in its own process
# (FakeStripe.start); the editor's harness, which runs the fake as a
# process of its own (ruby test/support/fake_stripe.rb, which prints its
# address), through POST /_fake/... on the same origin. The session's page,
# GET /c/pay/<id>, is a form that pays it and sends the browser to the
# session's success address, as Stripe's page does once paid.
if $PROGRAM_NAME == __FILE__
  require "bundler/setup"
  require "securerandom"
end
require "json"
require "rack"
require "puma"

class FakeStripe
  # The fake's own key, shaped as a key of Stripe's test mode: no key of
  # Stripe's, real or not, is written anywhere in the repository.
  KEY = "sk_test_TheTestsOwnFake"

  # A running fake: its address, the fake itself, and how to stop it.
  Server = Data.define(:url, :stripe, :puma) do
    def stop
      puma.stop(true)
    end
  end

  # A fake on 127.0.0.1, on port (0: any free one), in threads of this
  # process.
  def self.start(key: KEY, port: 0)
    stripe = new(key: key)
    # Puma sets RACK_ENV for the whole process when it is not set; the
    # tests' own processes, started from this one, must not inherit it.
    rack_env = ENV.fetch("RACK_ENV", nil)
    puma = Puma::Server.new(stripe, nil, min_threads: 0, max_threads: 4, log_writer: Puma::LogWriter.null)
    ENV["RACK_ENV"] = rack_env
    puma.add_tcp_listener("127.0.0.1", port)
    puma.run
    stripe.origin = "http://127.0.0.1:#{puma.connected_ports.first}"
    Server.new(url: stripe.origin, stripe: stripe, puma: puma)
  end

  attr_accessor :origin
  # Where the sessions' pages are said to be: the fake's own origin,
  # unless a test makes it another, as no Stripe would.
  attr_writer :page_origin
  # Every call to Stripe's API it was asked, in order: [method, path,
  # parameters], for the tests to read what the CMS sent.
  attr_reader :calls

  def initialize(key: KEY)
    @key = key
    @sessions = {}
    @calls = []
    @failures = 0
    @lock = Mutex.new
  end

  def call(env)
    request = Rack::Request.new(env)
    path = request.path_info
    return control(request) if path.start_with?("/_fake/")
    return page(request, Regexp.last_match(1)) if path.match(%r{\A/c/pay/([0-9A-Za-z_]+)\z})

    params = request.post? ? Rack::Utils.parse_nested_query(request.body.read) : {}
    @lock.synchronize { @calls << [ request.request_method, path, params ] }
    unless env["HTTP_AUTHORIZATION"] == "Bearer #{@key}"
      return error(401, "invalid_request_error", "Invalid API Key provided: #{mask(env['HTTP_AUTHORIZATION'].to_s.delete_prefix('Bearer '))}")
    end
    return error(500, "api_error", "An unknown error occurred: the fake was told to fail.") if fail_now?

    if request.post? && path == "/v1/checkout/sessions"
      create(params)
    elsif request.get? && (found = path.match(%r{\A/v1/checkout/sessions/([^/]+)\z}))
      session = @lock.synchronize { @sessions[found[1]]&.dup }
      session ? json(200, session) : error(404, "invalid_request_error", "No such checkout.session: '#{found[1]}'", code: "resource_missing", param: "session")
    else
      error(404, "invalid_request_error", "Unrecognized request URL (#{request.request_method}: #{path}).")
    end
  end

  # A session as a visitor who paid on Stripe's page leaves it: complete,
  # and paid, or, for a total of nothing, needing no payment, as Stripe
  # completes a session that costs nothing.
  def pay(id, email: "buyer@example.com")
    change(id) do |session|
      payment = session["amount_total"].zero? ? "no_payment_required" : "paid"
      session.merge("status" => "complete", "payment_status" => payment, "customer_details" => { "email" => email, "name" => nil }, "url" => nil)
    end
  end

  # A session completed by a payment that takes days to arrive: complete,
  # and unpaid until it does.
  def complete_unpaid(id, email: "buyer@example.com")
    change(id) { |session| session.merge("status" => "complete", "payment_status" => "unpaid", "customer_details" => { "email" => email, "name" => nil }, "url" => nil) }
  end

  # A session a day old and never paid.
  def expire(id)
    change(id) { |session| session.merge("status" => "expired", "url" => nil) }
  end

  # The next count answers of Stripe's API are its 500.
  def fail_next(count = 1)
    @lock.synchronize { @failures = count }
  end

  def sessions
    @lock.synchronize { @sessions.values.map(&:dup) }
  end

  private

  def create(params)
    missing = %w[mode success_url line_items].find { |name| params[name].nil? || params[name] == "" }
    return error(400, "invalid_request_error", "Missing required param: #{missing}.", code: "parameter_missing", param: missing) if missing

    items = params["line_items"].is_a?(Hash) ? params["line_items"].sort_by { |index, _| index.to_i }.map(&:last) : []
    total = 0
    currency = nil
    items.each_with_index do |item, i|
      price = item.is_a?(Hash) ? item["price_data"] : nil
      unit = price.is_a?(Hash) ? price["unit_amount"] : nil
      quantity = item.is_a?(Hash) ? item["quantity"] : nil
      unless unit.is_a?(String) && unit.match?(/\A[0-9]{1,12}\z/)
        return error(400, "invalid_request_error", "Invalid integer: #{unit}", code: "parameter_invalid_integer", param: "line_items[#{i}][price_data][unit_amount]")
      end
      unless quantity.is_a?(String) && quantity.match?(/\A[1-9][0-9]{0,5}\z/)
        return error(400, "invalid_request_error", "Invalid integer: #{quantity}", code: "parameter_invalid_integer", param: "line_items[#{i}][quantity]")
      end
      currency ||= price["currency"]
      total += unit.to_i * quantity.to_i
    end
    return error(400, "invalid_request_error", "Missing required param: line_items.", code: "parameter_missing", param: "line_items") if items.empty?

    id = "cs_test_#{SecureRandom.alphanumeric(58)}"
    now = Time.now.to_i
    session = {
      "id" => id, "object" => "checkout.session", "livemode" => false, "mode" => params["mode"],
      "amount_subtotal" => total, "amount_total" => total, "currency" => currency,
      "client_reference_id" => params["client_reference_id"], "customer_details" => nil,
      "payment_status" => "unpaid", "status" => "open",
      "success_url" => params["success_url"], "cancel_url" => params["cancel_url"],
      "url" => "#{@page_origin || origin}/c/pay/#{id}", "created" => now, "expires_at" => now + 86_400
    }
    @lock.synchronize { @sessions[id] = session }
    json(200, session)
  end

  def change(id)
    @lock.synchronize do
      session = @sessions.fetch(id) { raise ArgumentError, "the fake made no session #{id}" }
      @sessions[id] = yield(session)
    end
  end

  def fail_now?
    @lock.synchronize do
      next false unless @failures.positive?

      @failures -= 1
      true
    end
  end

  # What the editor's harness does to the fake from another process.
  def control(request)
    return json(405, { "error" => "POST only" }) unless request.post? || request.path_info == "/_fake/sessions"
    return json(200, { "sessions" => sessions }) if request.path_info == "/_fake/sessions"

    params = Rack::Utils.parse_nested_query(request.body.read)
    case request.path_info
    when %r{\A/_fake/sessions/([0-9A-Za-z_]+)/pay\z} then json(200, pay(Regexp.last_match(1), email: params.fetch("email", "buyer@example.com")))
    when %r{\A/_fake/sessions/([0-9A-Za-z_]+)/expire\z} then json(200, expire(Regexp.last_match(1)))
    when "/_fake/fail-next" then fail_next(Integer(params.fetch("count", "1"), 10)) && json(200, { "failing" => true })
    else json(404, { "error" => "no such control" })
    end
  rescue ArgumentError => e
    json(404, { "error" => e.message })
  end

  # The session's page: a form that pays it, as a visitor does on Stripe's
  # page, and sends the browser to the success address with the session's
  # id; and a link back, as the page's own.
  def page(request, id)
    session = @lock.synchronize { @sessions[id]&.dup }
    return [ 404, { "content-type" => "text/plain" }, [ "No such session." ] ] unless session

    if request.post?
      pay(id, email: "buyer@example.com")
      return [ 303, { "location" => session["success_url"].to_s.sub("{CHECKOUT_SESSION_ID}", id) }, [] ]
    end
    html = <<~HTML
      <!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake checkout</title></head>
      <body><h1>Fake checkout</h1><p>The tests' stand-in for Stripe's page.</p>
      <form method="post"><button type="submit">Pay</button></form>
      <p><a href="#{Rack::Utils.escape_html(session['cancel_url'].to_s)}">Back</a></p></body></html>
    HTML
    [ 200, { "content-type" => "text/html; charset=utf-8" }, [ html ] ]
  end

  def json(status, body)
    [ status, { "content-type" => "application/json" }, [ JSON.generate(body) ] ]
  end

  def error(status, type, message, code: nil, param: nil)
    json(status, { "error" => { "type" => type, "message" => message, "code" => code, "param" => param }.compact })
  end

  # A key as Stripe writes it back: its kind, then stars, then its last
  # four characters.
  def mask(key)
    key.length > 12 ? "#{key[0, 8]}#{'*' * (key.length - 12)}#{key[-4..]}" : "****"
  end
end

# Run by itself, for the editor's harness: a fake on the port given (or
# any), its address and its key, the fake's own, on the first line
# printed, until the process is stopped.
if $PROGRAM_NAME == __FILE__
  server = FakeStripe.start(port: Integer(ARGV.fetch(0, "0"), 10))
  $stdout.puts "fake Stripe on #{server.url} with the key #{FakeStripe::KEY}"
  $stdout.flush
  %w[INT TERM].each do |signal|
    Signal.trap(signal) do
      Thread.new do
        server.stop
        exit
      end
    end
  end
  sleep
end
