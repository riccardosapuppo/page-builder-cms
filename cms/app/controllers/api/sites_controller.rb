# frozen_string_literal: true

module Api
  # The theme's parts around every page (config/site.yml): the site's name,
  # the header's menu and action button, the footer's line. Read only: the
  # editor draws them on its canvas, locked, as the published layout draws
  # them (layouts/public.html.erb), so the page is edited in its place.
  #
  # A link goes through RenderPolicy as the layout's do (SiteHelper): one
  # whose address the policy refuses is left out here too, so the editor
  # never draws a link the page would not have.
  class SitesController < BaseController
    # GET /api/site
    def show
      site = Rails.configuration.x.site
      render json: {
        name: site[:name].to_s,
        menu: Array(site[:menu]).filter_map { |link| site_link_json(link) },
        action: site_link_json(site[:action]),
        footer: { lead: site.dig(:footer, :lead).to_s, text: site.dig(:footer, :text).to_s }
      }
    end

    private

    def site_link_json(link)
      return nil unless link.is_a?(Hash)

      href = RenderPolicy.link_href(link[:href])
      href && { label: link[:label].to_s, href: href }
    end
  end
end
