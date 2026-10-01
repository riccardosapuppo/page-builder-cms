# frozen_string_literal: true

module Api
  # Publishing a page.
  class PublicationsController < BaseController
    # POST /api/pages/:id/publish {revision?}
    #
    # Puts live what the draft holds now, as a new version. With revision,
    # the publish happens only if the draft is still at that revision, so a
    # person never puts live a save they have not seen: otherwise 409, like
    # a save. The draft's next address takes effect, and the old address
    # answers with a redirect from then on.
    def create
      check = BodyCheck.new(body(optional: true), allowed: %w[revision])
      check.integer("revision", minimum: 0)
      check.finish!

      page = Page.find(path_integer(:id))
      version = page.publish!(expected_revision: body(optional: true)["revision"])
      page.reload
      render json: {
        "published" => published_json(page),
        "version" => version_json(version, published_version_id: page.published_version_id),
        "links" => page_links_json(page)
      }
    end
  end
end
