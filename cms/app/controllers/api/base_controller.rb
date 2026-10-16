# frozen_string_literal: true

module Api
  # The JSON API the editor talks to, described by cms/openapi.yaml.
  #
  # ActionController::API, not the HTML application's base: no session, no
  # cookies, no CSRF token to fetch first. The API has no authentication, so
  # the server listens on 127.0.0.1 only, and writes are refused from other
  # sites (refuse_writes_from_other_sites).
  #
  # Every error has one shape:
  #   {"error": <code>, "message": <sentence>, ...}
  # and a 422 adds "errors": [{pointer, keyword, blockPointer, message}],
  # one per problem, with JSON pointers into the request body.
  class BaseController < ActionController::API
    include Representation

    # The body is parsed once, by JsonBody; Rails' params wrapper would
    # parse it a second time for nothing.
    wrap_parameters false

    # Anything no handler below names: logged with its backtrace, and
    # answered in the error shape, never as Rails' HTML error page. It is
    # declared first because rescue_from tries the handlers declared last
    # first, so every particular one below wins over it.
    rescue_from StandardError do |e|
      logger&.error("#{e.class}: #{e.message}\n  #{Array(e.backtrace).first(20).join("\n  ")}")
      render_error :internal_server_error, "internal_error", "The server failed to answer this request."
    end

    # A body Rails itself failed to parse, in an action that reads params.
    rescue_from ActionDispatch::Http::Parameters::ParseError do
      render_error :bad_request, "malformed_json", "The body is not valid JSON."
    end

    rescue_from JsonBody::Malformed do |e|
      render_error :bad_request, "malformed_json", e.message
    end

    rescue_from JsonBody::DuplicateKey do |e|
      error = BlockDocument::Error.new(pointer: e.pointer, keyword: "duplicateKey", block_pointer: block_pointer_in_body(e.pointer), message: e.message)
      render_error :unprocessable_content, "duplicate_key", e.message, pointer: e.pointer, errors: [ error.as_json ]
    end

    rescue_from BodyCheck::Failed do |e|
      render_error :unprocessable_content, "invalid_request", "The request is not valid.", errors: e.errors.map(&:as_json)
    end

    rescue_from ActiveRecord::RecordInvalid do |e|
      render_error :unprocessable_content, "invalid_request", "The request is not valid.", errors: record_errors(e.record, record_error_pointers)
    end

    rescue_from BlockDocument::Invalid do |e|
      render_error :unprocessable_content, "invalid_document", "The document is not valid.",
                   errors: e.errors.map { |error| error.under("/document").as_json }
    end

    # A collection's definition or an entry the collection's rules refuse,
    # at pointers into the body: the members of a definition, an entry's
    # title, slug and values, which every body that carries them names
    # alike, and a publish of the entry as stored too.
    rescue_from CollectionDocument::Invalid do |e|
      render_error :unprocessable_content, "invalid_request", "The request is not valid.", errors: e.errors.map(&:as_json)
    end

    # The draft moved past the revision the request named. The answer says
    # where it is now, and the saveId of the save that took it there.
    rescue_from Draft::Conflict do |e|
      render_error :conflict, "conflict", "The draft has changed since the revision sent.",
                   currentRevision: e.current_revision, lastSaveId: e.last_save_id
    end

    # The same for an entry.
    rescue_from Entry::Conflict do |e|
      render_error :conflict, "conflict", "The entry has changed since the revision sent.",
                   currentRevision: e.current_revision, lastSaveId: e.last_save_id
    end

    rescue_from ActiveRecord::RecordNotFound do
      render_error :not_found, "not_found", "There is nothing at this address."
    end

    # The shop's settings refused, each fault at its member (ShopRules).
    rescue_from ShopSetting::Invalid do |e|
      errors = e.faults.map { |f| BlockDocument::Error.new(pointer: f.pointer, keyword: f.keyword, block_pointer: nil, message: f.message).as_json }
      render_error :unprocessable_content, "invalid_request", "The request is not valid.", errors: errors
    end

    # A delete of the collection the shop sells from.
    rescue_from Collection::InShop do |e|
      render_error :conflict, "collection_in_shop", e.message
    end

    # Listening on 127.0.0.1 keeps other machines out, not other sites: a
    # page from anywhere, open in a browser on this machine, can send the
    # API requests that need no CORS preflight (a form POST, a fetch with
    # mode "no-cors" and a text/plain body), and the browser delivers them.
    # So every write must say it is JSON, which no such request can do
    # without a preflight the API never grants, and must not come from
    # another site.
    before_action :refuse_writes_from_other_sites

    WRITES = %w[POST PUT PATCH DELETE].freeze
    WRITES_WITH_A_BODY = %w[POST PUT PATCH].freeze

    # Rails reads the request's parameters for its log before the action
    # starts, outside the reach of rescue_from. A body whose strings are not
    # UTF-8 fails there with BadRequest, and would get an HTML error page.
    def process_action(...)
      super
    rescue ActionController::BadRequest
      render_error :bad_request, "malformed_json", "The request is not valid UTF-8 JSON."
    end

    private

    # 403 when the browser says the request comes from another site
    # (Sec-Fetch-Site), or when it names an origin other than the CMS's own
    # (Origin): a browser sends Origin with every write. A client that is
    # not a browser, such as curl or the repository's tools, sends neither,
    # and is let through. Then 415 unless the body is declared JSON, even
    # an empty one. The CMS's own origin is the one the request is
    # addressed to; in production, config.hosts limits which names that can
    # be, so a rebound domain cannot pass for it. The editor's development
    # server forwards /api keeping the Host, so through it the editor's
    # origin is the one addressed (test/integration/api/other_sites_test.rb).
    def refuse_writes_from_other_sites
      return unless WRITES.include?(request.request_method)

      origin = request.headers["Origin"]
      if %w[cross-site same-site].include?(request.headers["Sec-Fetch-Site"]) || (origin && origin != request.base_url)
        render_error :forbidden, "forbidden_origin", "The API takes writes only from the CMS's own origin."
      elsif WRITES_WITH_A_BODY.include?(request.request_method) && request.media_type != "application/json"
        render_error :unsupported_media_type, "unsupported_media_type", "Send the request as application/json, even with no body."
      end
    end

    def render_error(status, code, message, **extra)
      render json: { "error" => code, "message" => message, **extra.transform_keys(&:to_s) }, status: status
    end

    # The request body, read once. See JsonBody.
    def body(optional: false)
      @body ||= JsonBody.parse(request.raw_post, optional: optional)
    end

    # An id from the path, never from params (see JsonBody). Only digits:
    # "12abc" is not page 12.
    def path_integer(name)
      value = request.path_parameters[name]
      raise ActiveRecord::RecordNotFound unless value.is_a?(String) && value.match?(/\A[1-9][0-9]{0,17}\z/)

      value.to_i
    end

    # A string id from the path, in the form its parameter has in
    # openapi.yaml, or not found: anything else (a %00, a space) never
    # reaches a query.
    def path_string(name, pattern)
      value = request.path_parameters[name]
      raise ActiveRecord::RecordNotFound unless value.is_a?(String) && value.match?(pattern)

      value
    end

    # Attributes a controller's body names differently from the model, as
    # {attribute: pointer}.
    def record_error_pointers
      {}
    end

    # Pointers into the body for a model's validation errors. An attribute
    # is named in the body in camelCase (type_scale -> /typeScale); a nested
    # one is written attribute/key by the model (palette/primary).
    def record_errors(record, pointers = {})
      record.errors.map do |error|
        head, *rest = error.attribute.to_s.split("/")
        pointer = pointers.fetch(error.attribute.to_sym) { "/#{[ head.camelize(:lower), *rest ].join('/')}" }
        BlockDocument::Error.new(pointer: pointer, keyword: error.type.to_s.camelize(:lower), block_pointer: nil, message: error.message).as_json
      end
    end

    # In a draft body the document sits under /document; the block that
    # holds a value is found from the pointer inside the document.
    def block_pointer_in_body(pointer)
      return nil unless pointer.start_with?("/document/")

      inner = BlockDocument.block_pointer(pointer.delete_prefix("/document"))
      inner && "/document#{inner}"
    end

    def iso(time)
      time&.utc&.iso8601(3)
    end
  end
end
