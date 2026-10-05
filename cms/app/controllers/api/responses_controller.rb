# frozen_string_literal: true

module Api
  # What visitors sent with the forms of a page's published versions
  # (SubmissionsController keeps them): the list, a part at a time and
  # newest first; one response whole; deleting one.
  #
  # Each response keeps the published version its form was read from and a
  # copy of the form's fields as that version had them, so it reads the
  # same after the form changes. A visitor's words come back as JSON
  # strings, and the editor shows them as text.
  class ResponsesController < BaseController
    # The most responses one answer of the list holds. A form can be sent
    # many times a day, and a long text is up to 5000 characters, so the
    # list comes a part at a time rather than whole.
    PER_PAGE = 50

    # The list's query, by parameter: the form of a form block's id (the
    # schema's blockId), and a response's id.
    QUERY = { "form" => /\A[A-Za-z0-9_-]{1,64}\z/, "before" => /\A[1-9][0-9]{0,17}\z/ }.freeze

    # A query this list does not take: a parameter it does not know, one
    # named twice, or a value not in its parameter's form.
    class InvalidQuery < StandardError
      attr_reader :parameter

      def initialize(parameter, message)
        @parameter = parameter
        super(message)
      end
    end

    rescue_from InvalidQuery do |e|
      render_error :bad_request, "invalid_query", e.message, parameter: e.parameter
    end

    # GET /api/pages/:id/responses?form=<form id>&before=<response id>
    #
    # Newest first, PER_PAGE at most; next is the before that continues the
    # list, null at its end. forms counts each form's responses on the page,
    # whatever the query says, so the editor offers only forms that have
    # some.
    def index
      page = find_page
      query = list_query

      rows = with_version_number(page.submissions)
      rows = rows.where(form_id: query["form"]) if query["form"]
      rows = rows.where(id: ...query["before"].to_i) if query["before"]
      rows = rows.order(id: :desc).limit(PER_PAGE + 1).to_a
      more = rows.length > PER_PAGE
      rows = rows.first(PER_PAGE)

      render_visitor_text({
        "responses" => rows.map { |row| response_summary_json(row) },
        "next" => more ? rows.last.id : nil,
        "forms" => page.submissions.group(:form_id).order(:form_id).count.map { |form_id, count| { "formId" => form_id, "count" => count } }
      })
    end

    # GET /api/pages/:id/responses/:response_id
    def show
      render_visitor_text(response_json(with_version_number(find_page.submissions).find(path_integer(:response_id))))
    end

    # DELETE /api/pages/:id/responses/:response_id: gone for good, as a
    # visitor may ask; the page and its versions stay as they are.
    def destroy
      find_page.submissions.find(path_integer(:response_id)).destroy!
      head :no_content
    end

    private

    def find_page
      Page.find(path_integer(:id))
    end

    # These are the only answers of the API that carry what strangers
    # wrote, so <, > and & are written as <, > and &: the
    # same strings once parsed, but no markup even if the body is ever
    # read as HTML, or set inside a page's script. Rails 8.1 stopped doing
    # this for every JSON answer; it is asked for here.
    def render_visitor_text(json)
      render json: json, escape: true
    end

    # Each response with the number of its version, read in the same query
    # rather than by loading every version with its document.
    def with_version_number(submissions)
      submissions.joins(:page_version).select("submissions.*", "page_versions.number AS version_number")
    end

    # The query, read from the address itself: Rails' params keep only the
    # last of a parameter named twice, and read form[]=x as a list.
    def list_query
      query = Rack::Utils.parse_query(request.query_string)
      query.each do |name, value|
        pattern = QUERY[name]
        raise InvalidQuery.new(name, "This list takes only the parameters form and before.") unless pattern
        raise InvalidQuery.new(name, "The parameter #{name} is given more than once.") if value.is_a?(Array)
        raise InvalidQuery.new(name, "The parameter #{name} is not in the form it takes.") unless value.is_a?(String) && value.valid_encoding? && value.match?(pattern)
      end
      query
    end
  end
end
