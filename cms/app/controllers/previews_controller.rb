# frozen_string_literal: true

# The draft of a page as it would look published: the same layout and
# partials as the live page, from the draft's document, inside the drafts
# of the site's header and footer, so a preview shows the site as the
# editor holds it. Never stored by a cache (Cache-Control: no-store), since
# a draft changes with every save, and never indexed (X-Robots-Tag and a
# robots meta tag).
#
# The header and footer have no page of their own: the preview of one is
# the home page's draft inside them, or no page at all when the site has
# no home page.
class PreviewsController < ApplicationController
  include PublicPage

  # What a part's preview shows below and above it when the site has no
  # home page.
  NO_HOME = { "schemaVersion" => 1, "title" => "No home page", "sections" => [] }.freeze

  before_action :never_store

  # GET /preview/:page_id
  def show
    @noindex = true
    id = request.path_parameters[:page_id].to_s
    draft = Draft.includes(:page).find_by(page_id: id.to_i) if id.match?(/\A[1-9][0-9]{0,17}\z/)
    return render_not_found unless draft

    if draft.page.part?
      document = Page.home_page&.draft&.document || NO_HOME
      render_document(document, title: "Preview: #{draft.document['title']}")
    else
      render_document(draft.document, title: "Preview: #{draft.document['title']}")
    end
  end

  private

  # The parts' drafts, which the editor holds, rather than what is live.
  def site_parts
    @site_parts ||= SiteParts.drafts
  end

  def never_store
    no_store
    response.headers["X-Robots-Tag"] = "noindex"
  end
end
