# frozen_string_literal: true

# The draft of a page as it would look published: the same layout and
# partials as the live page, from the draft's document. Never stored by a
# cache (Cache-Control: no-store), since the draft changes with every save,
# and never indexed (X-Robots-Tag and a robots meta tag).
class PreviewsController < ApplicationController
  include PublicPage

  before_action :never_store

  # GET /preview/:page_id
  def show
    @noindex = true
    id = request.path_parameters[:page_id].to_s
    draft = Draft.find_by(page_id: id.to_i) if id.match?(/\A[1-9][0-9]{0,17}\z/)
    return render_not_found unless draft

    document = draft.document
    render_document(document, title: "Preview: #{document['title']}")
  end

  private

  def never_store
    no_store
    response.headers["X-Robots-Tag"] = "noindex"
  end
end
