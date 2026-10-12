# frozen_string_literal: true

module Api
  # The list of pages, a new page, one page, and its next address.
  class PagesController < BaseController
    # GET /api/pages
    #
    # The site's pages, and its parts, the header and the footer, which the
    # editor edits as pages and the layout draws around every one. The parts
    # are made here the first time the list is asked for, each with its
    # starter as its draft and nothing live (Page.part!): the editor always
    # finds both.
    def index
      Page.parts!
      pages = Page.includes(:draft, :published_version, pending_schedule: :version).order(:id).to_a
      render json: {
        "pages" => pages.reject(&:part?).map { |page| page_summary_json(page) },
        "parts" => Page::PARTS.map { |kind| page_summary_json(pages.find { |page| page.kind == kind }) }
      }
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

    # PATCH /api/pages/:id {slug?, home?}
    #
    # slug: the address the page will have after its next publish. The
    # live address does not change until then.
    # home: true makes this the page / serves, at once, and the page that
    # was home stops being it; false leaves / with no page.
    # Neither is for a header or a footer, which has no address and is
    # drawn on every page: 422.
    def update
      check = BodyCheck.new(body, allowed: %w[slug home])
      check.any_of("slug", "home")
      check.string("slug")
      check.boolean("home")
      check.finish!

      page = find_page
      if page.part?
        member = body.key?("slug") ? "slug" : "home"
        return render_error(:unprocessable_content, "invalid_request", "The request is not valid.",
                            errors: [ { "pointer" => "/#{member}", "keyword" => "part", "blockPointer" => nil,
                                        "message" => "A header or footer has no address and is never the home page: it is drawn on every page." } ])
      end
      Page.transaction do
        page.draft.update!(slug: body["slug"]) if body.key?("slug")
        if body["home"] == true
          page.make_home!
        elsif body["home"] == false
          page.unmake_home!
        end
      end
      render json: page_json(page)
    end

    private

    def find_page
      Page.includes(:draft, :published_version, pending_schedule: :version).find(path_integer(:id))
    end
  end
end
