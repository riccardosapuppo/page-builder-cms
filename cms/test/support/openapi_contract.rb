# frozen_string_literal: true

require "yaml"

# Holds every API response of the request tests to cms/openapi.yaml.
#
# After each request an integration session makes under /api/, the
# response is looked up in the document by path, method, status and media
# type, and its body is validated against the schema found there, with
# json_schemer's OpenAPI 3.1 support and the options the API uses for
# documents (ECMA regular expressions, no format checks). A response the
# document does not describe fails the test, as does a body that does not
# match: the document is a contract, not a description written afterwards.
module OpenapiContract
  PATH = Rails.root.join("openapi.yaml")
  DOCUMENT = YAML.safe_load_file(PATH)
  # json_schemer takes a Hash here, not a Pathname, so the base URI is built
  # the way it builds one for a Pathname; ../schema/... then resolves from
  # cms/, spaces in the folder names included.
  BASE_URI = URI.parse(File.join("file:", JSONSchemer::URI_PARSER.escape(PATH.to_s)))
  SCHEMER = JSONSchemer.openapi(
    DOCUMENT,
    base_uri: BASE_URI,
    ref_resolver: JSONSchemer::CachedResolver.new(&JSONSchemer::FILE_URI_REF_RESOLVER),
    regexp_resolver: "ecma",
    format: false
  )

  # Each path template as a pattern: {name} stands for one path segment.
  TEMPLATES = DOCUMENT.fetch("paths").keys.map do |template|
    pattern = template.split(/(\{[^}]+\})/).map { |part| part.start_with?("{") ? "[^/]+" : Regexp.escape(part) }.join
    [ template, /\A#{pattern}\z/ ]
  end.freeze

  # A test failure, so Minitest's own class: its summary counts failures by
  # exact class, and a subclass would fail the run while the summary line
  # said "0 failures".
  Mismatch = Minitest::Assertion

  @checked = Concurrent::AtomicFixnum.new(0)
  @seen = Concurrent::AtomicFixnum.new(0)

  # Where each parallel test worker leaves its counts for the main process
  # (on Windows the tests run in one process, and nothing is written).
  COUNTS = Rails.root.join("tmp", "openapi-contract")

  class << self
    def checked
      @checked.value
    end

    # Requests the application received under /api/, counted where they
    # enter it (AppCounter), apart from the hook, so a hook that stops
    # checking cannot go unnoticed.
    def seen
      @seen.value
    end

    def saw!
      @seen.increment
    end

    def save_counts(worker)
      FileUtils.mkdir_p(COUNTS)
      File.write(COUNTS.join("worker-#{worker}-#{Process.pid}.json"), JSON.generate("seen" => seen, "checked" => checked))
    end

    # This process's counts plus those the workers left, which are then
    # removed.
    def totals
      files = Dir.glob(COUNTS.join("*.json").to_s)
      counts = files.map { |file| JSON.parse(File.read(file)) }
      FileUtils.rm_rf(COUNTS)
      [ seen + counts.sum { |c| c["seen"] }, checked + counts.sum { |c| c["checked"] } ]
    end

    def check!(method, path, status, media_type, body)
      template = template_for(path) or raise Mismatch, "openapi.yaml has no path for #{path}"
      operation = DOCUMENT.dig("paths", template, method) or raise Mismatch, "openapi.yaml does not describe #{method.upcase} #{template}"
      pointer = "#/paths/#{escape(template)}/#{method}/responses/#{status}"
      response = operation.dig("responses", status.to_s) or raise Mismatch, "openapi.yaml does not describe #{status} for #{method.upcase} #{template}"
      if (ref = response["$ref"])
        pointer = ref
        response = DOCUMENT.dig(*ref.delete_prefix("#/").split("/"))
      end

      content = response["content"]
      if content.nil?
        raise Mismatch, "#{method.upcase} #{template} #{status} has a body, and openapi.yaml describes none" unless body.empty?
      else
        content.key?(media_type.to_s) or raise Mismatch, "#{method.upcase} #{template} #{status} answered #{media_type.inspect}, openapi.yaml describes #{content.keys.inspect}"
        schema = SCHEMER.ref("#{pointer}/content/#{escape(media_type)}/schema")
        errors = schema.validate(JSON.parse(body)).first(5)
        unless errors.empty?
          raise Mismatch, "#{method.upcase} #{path} #{status} does not match openapi.yaml:\n" +
                          errors.map { |e| "  #{e['data_pointer'].inspect}: #{e['error']}" }.join("\n") + "\n  body: #{body[0, 600]}"
        end
      end
      @checked.increment
    end

    private

    # The most specific template wins: /api/media/direct_uploads over
    # /api/media/{id}.
    def template_for(path)
      TEMPLATES.select { |_, pattern| pattern.match?(path) }.max_by { |template, _| template.count("{") * -1 }&.first
    end

    # A JSON pointer token inside a URI fragment: ~ and / escaped as the
    # pointer syntax says, and the braces of {id} percent-encoded, which a
    # URI cannot hold raw.
    def escape(token)
      token.to_s.gsub("~", "~0").gsub("/", "~1").gsub("{", "%7B").gsub("}", "%7D")
    end
  end

  # Wraps every request of an integration session, the ones a test opens
  # with open_session included.
  module SessionHook
    def process(method, path, **options)
      status = super
      if request.path.start_with?("/api/")
        OpenapiContract.check!(method.to_s.downcase, request.path, response.status, response.media_type, response.body)
      end
      status
    end
  end
end

ActionDispatch::Integration::Session.prepend(OpenapiContract::SessionHook)

module OpenapiContract
  # Counts every request the application receives under /api/, at the
  # application's own door and with its own path test, not the hook's.
  module AppCounter
    def call(env)
      OpenapiContract.saw! if env["PATH_INFO"].to_s.start_with?("/api/")
      super
    end
  end
end

Rails.application.singleton_class.prepend(OpenapiContract::AppCounter)

# Counts left over from an earlier run would be added to this one's.
FileUtils.rm_rf(OpenapiContract::COUNTS)

# With parallel workers (forked processes, on Linux and macOS) each worker
# counts its own requests: it leaves them in a file as it stops, and the
# main process adds them up.
ActiveSupport::TestCase.parallelize_teardown { |worker| OpenapiContract.save_counts(worker) }

module OpenapiContract
  # Counts, in the main process, the results of the API's request tests
  # (class Api::...), wherever they ran: Rails sends every worker's results
  # to the main process's reporters. If they ran, responses must have been
  # checked, even if no worker's counts arrived.
  class ApiTestCounter < Minitest::AbstractReporter
    attr_reader :count

    def initialize
      super
      @count = 0
    end

    def record(result)
      @count += 1 if result.klass.to_s.start_with?("Api::")
    end
  end

  API_TESTS = ApiTestCounter.new
end

module Minitest
  def self.plugin_openapi_contract_init(_options)
    reporter << OpenapiContract::API_TESTS
  end
end
Minitest.extensions << "openapi_contract"

# The run fails unless every request the API answered had its response
# held to the document, and unless some were when the API's request tests
# ran: a hook that stopped checking (a changed path test, a session class
# it no longer wraps, worker counts that never arrive) would otherwise
# leave the suite green, saying only "0 checked".
Minitest.after_run do
  seen, checked = OpenapiContract.totals
  api_tests = OpenapiContract::API_TESTS.count
  puts "openapi: #{checked} API response(s) checked against cms/openapi.yaml"
  if checked != seen
    abort "openapi: #{seen} API request(s) answered by the API, #{checked} held to openapi.yaml: every one must be"
  elsif api_tests.positive? && checked.zero?
    abort "openapi: #{api_tests} API request test(s) ran and no response was held to openapi.yaml"
  end
end
