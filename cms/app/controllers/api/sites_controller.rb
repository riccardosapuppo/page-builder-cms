# frozen_string_literal: true

module Api
  # The site's own settings, which only config/site.yml sets: its time
  # zone, in which the editor shows and sets scheduled publishes. The
  # header and footer are the site's parts, pages of their own kind
  # (GET /api/pages lists them).
  class SitesController < BaseController
    # GET /api/site
    def show
      render json: site_json
    end
  end
end
