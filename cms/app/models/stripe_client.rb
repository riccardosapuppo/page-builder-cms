# frozen_string_literal: true

require "net/http"

# Stripe's API, the two calls the shop makes, over Net::HTTP and with no
# library of Stripe's: create a Checkout Session (POST
# /v1/checkout/sessions, its parameters form encoded as Stripe reads them,
# line_items[0][price_data][currency]=gbp) and retrieve one (GET
# /v1/checkout/sessions/<id>). Each answers the session as Stripe's JSON
# gives it, or raises Failed.
#
# Where it goes and with what key are StripeSettings', which only a test
# key and Stripe's own address or 127.0.0.1 pass. The key travels in the
# Authorization header and nowhere else: not in an address, not in a
# message, not in a log line (a message Stripe answers is scrubbed of
# anything shaped like a key before it is raised).
class StripeClient
  OPEN_TIMEOUT = 5
  READ_TIMEOUT = 20

  # A key of any kind, Stripe's shape, or as Stripe writes one back, its
  # middle masked with stars: what a message is scrubbed of.
  KEY_SHAPE = /\b(?:sk|rk|pk)_(?:test|live)_[0-9A-Za-z*]+/

  # Stripe could not be asked, or refused. status is the HTTP status of
  # Stripe's answer, nil when none came; type is the error's type in
  # Stripe's answer (invalid_request_error, api_error...), if any.
  class Failed < StandardError
    attr_reader :status, :type

    def initialize(message, status: nil, type: nil)
      @status = status
      @type = type
      super(message)
    end
  end

  def initialize(settings = StripeSettings.current)
    raise ArgumentError, "Checkout is not set up: #{settings.reason}" unless settings.ready?

    @settings = settings
  end

  def create_checkout_session(params)
    call(Net::HTTP::Post, "/v1/checkout/sessions", params)
  end

  def retrieve_checkout_session(id)
    call(Net::HTTP::Get, "/v1/checkout/sessions/#{ERB::Util.url_encode(id)}")
  end

  # Stripe's form encoding of nested parameters: a hash's members as
  # name[member], a list's items as name[0], name[1]..., in their order.
  def self.form(params)
    pairs = []
    walk = lambda do |name, value|
      case value
      when Hash then value.each { |member, inner| walk.("#{name}[#{member}]", inner) }
      when Array then value.each_with_index { |inner, i| walk.("#{name}[#{i}]", inner) }
      else pairs << [ name, value.to_s ]
      end
    end
    params.each { |name, value| walk.(name.to_s, value) }
    URI.encode_www_form(pairs)
  end

  def self.scrub(text)
    text.to_s.gsub(KEY_SHAPE, "[FILTERED]")
  end

  def inspect
    "#<StripeClient #{@settings.base}>"
  end

  private

  def call(kind, path, params = nil)
    uri = URI("#{@settings.base}#{path}")
    request = kind.new(uri)
    request["Authorization"] = "Bearer #{@settings.key}"
    request["Accept"] = "application/json"
    if params
      request["Content-Type"] = "application/x-www-form-urlencoded"
      request.body = self.class.form(params)
    end
    response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https", open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT, write_timeout: READ_TIMEOUT) do |http|
      http.request(request)
    end
    answer = read(response.body)
    return answer if response.is_a?(Net::HTTPSuccess) && answer.is_a?(Hash)

    error = answer.is_a?(Hash) && answer["error"].is_a?(Hash) ? answer["error"] : {}
    said = error["message"].is_a?(String) ? error["message"] : "no message"
    raise Failed.new(self.class.scrub("Stripe answered #{response.code}: #{said}"), status: response.code.to_i, type: (error["type"] if error["type"].is_a?(String)))
  rescue Timeout::Error, SystemCallError, SocketError, IOError, OpenSSL::SSL::SSLError, Net::HTTPBadResponse, Net::ProtocolError => e
    raise Failed.new("Stripe could not be reached (#{e.class}).")
  end

  def read(body)
    JSON.parse(body.to_s)
  rescue JSON::ParserError
    nil
  end
end
