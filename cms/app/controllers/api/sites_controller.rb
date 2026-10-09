# frozen_string_literal: true

module Api
  # The site's header and footer (Site): the name beside the mark, the
  # menu, the header's button and the footer's two lines, as every page
  # draws them (layouts/public.html.erb). The editor reads them to draw its
  # canvas and changes them; a change reaches every published page at its
  # next visit. With them, the site's time zone, in which the editor sets
  # scheduled publishes, and which only config/site.yml sets.
  class SitesController < BaseController
    # A write from an older revision that would change the header and
    # footer: the answer holds them as they are now, in the shape a change
    # sends them, so the editor can show what it would have overwritten and
    # send its own again from currentRevision.
    rescue_from Site::Conflict do |e|
      render_error :conflict, "conflict", "The header and footer have changed since the revision sent.",
                   currentRevision: e.site.revision, site: e.site.values
    end

    # The checks below find every fault first; this answers one found only
    # as the header and footer are written, in the same shape.
    rescue_from Site::Invalid do |e|
      render_error :unprocessable_content, "invalid_request", "The request is not valid.", errors: e.errors.map(&:as_json)
    end

    # GET /api/site
    def show
      render json: site_json(Site.current)
    end

    # PUT /api/site {revision, name, menu, action, footer}: the header and
    # footer whole, with the revision they were read at. The four members
    # are checked as Site checks them ($defs/site of the page schema), and
    # every fault, the revision's included, comes back in one 422.
    def update
      check = BodyCheck.new(body, allowed: [ "revision", *Site::MEMBERS ])
      check.integer("revision", required: true, minimum: 0, maximum: BlockDocument::Rules::MAX_SAFE_INTEGER)
      members = Site::MEMBERS.map { |member| check.required(member) }
      check.concat(Site.check(values).errors) if members.all?
      check.finish!

      render json: site_json(Site.replace!(revision: body["revision"], values: values))
    end

    private

    def values
      body.slice(*Site::MEMBERS)
    end
  end
end
