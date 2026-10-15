# frozen_string_literal: true

module Api
  # The list of pages, a new page, one page, and its next address.
  class PagesController < BaseController
    # Why a part or a template takes no address and no home mark.
    PART_NO_ADDRESS = "A header or footer has no address and is never the home page: it is drawn on every page."
    TEMPLATE_NO_ADDRESS = "A template has no address and is never the home page: it draws its collection's entries at theirs."
    # GET /api/pages
    #
    # The site's pages, and its parts, the header and the footer, which the
    # editor edits as pages and the layout draws around every one. The parts
    # are made here the first time the list is asked for, each with its
    # starter as its draft and nothing live (Page.part!): the editor always
    # finds both. The collections' templates are listed with their
    # collections (CollectionsController), not here.
    def index
      Page.parts!
      pages = Page.includes(:draft, :published_version, pending_schedule: :version).where(kind: [ "page", *Page::PARTS ]).order(:id).to_a
      render json: {
        "pages" => pages.select { |page| page.kind == "page" }.map { |page| page_summary_json(page) },
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
    # drawn on every page, nor for a collection's template, which draws
    # its entries at theirs: 422, keyword part or template.
    def update
      check = BodyCheck.new(body, allowed: %w[slug home])
      check.any_of("slug", "home")
      check.string("slug")
      check.boolean("home")
      check.finish!

      page = find_page
      if page.addressless?
        member = body.key?("slug") ? "slug" : "home"
        return render_error(:unprocessable_content, "invalid_request", "The request is not valid.",
                            errors: [ { "pointer" => "/#{member}", "keyword" => page.part? ? "part" : "template", "blockPointer" => nil,
                                        "message" => page.part? ? PART_NO_ADDRESS : TEMPLATE_NO_ADDRESS } ])
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
