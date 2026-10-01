# frozen_string_literal: true

module Api
  # The list of pages, a new page, one page, and its next address.
  class PagesController < BaseController
    # GET /api/pages
    def index
      pages = Page.includes(:draft, :published_version).order(:id)
      render json: { "pages" => pages.map { |page| page_summary_json(page) } }
    end

    # POST /api/pages {title, slug}
    def create
      check = BodyCheck.new(body, allowed: %w[title slug])
      check.required("title")
      check.string("slug", required: true)
      check.finish!

      page = Page.create_with_draft!(title: body["title"], slug: body["slug"])
      render json: page_json(page), status: :created
    rescue BlockDocument::Invalid => e
      # The only document value a new page takes from the request is the
      # title, and the document's /title is the body's /title.
      render_error :unprocessable_content, "invalid_request", "The request is not valid.", errors: e.errors.map(&:as_json)
    end

    # GET /api/pages/:id
    def show
      render json: page_json(find_page)
    end

    # PATCH /api/pages/:id {slug}: the address the page will have after its
    # next publish. The live address does not change until then.
    def update
      check = BodyCheck.new(body, allowed: %w[slug])
      check.string("slug", required: true)
      check.finish!

      page = find_page
      page.draft.update!(slug: body["slug"])
      render json: page_json(page)
    end

    private

    def find_page
      Page.includes(:draft, :published_version).find(path_integer(:id))
    end
  end
end
