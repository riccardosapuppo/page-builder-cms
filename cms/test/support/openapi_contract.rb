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

  class << self
    def checked
      @checked.value
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

Minitest.after_run do
  puts "openapi: #{OpenapiContract.checked} API response(s) checked against cms/openapi.yaml"
end
