# frozen_string_literal: true

# The published pages: / serves the page marked as home, /<slug> every
# other page, each with the version that was published last.
#
# An address a page had before it was published under a new one answers
# 301 to where the page is now, and the home page's own slug answers 301
# to /, so each page has one address. Anything else is the site's 404 page.
#
# Caching (ETag, Cache-Control, fragments in Solid Cache) arrives with the
# publishing stage: until then these responses carry what Rails sends by
# default.
class PagesController < ApplicationController
  include PublicPage

  # GET /
  def home
    page = Page.includes(:published_version).find_by(home: true)
    return render_not_found unless page&.published?

    render_document(page.published_version.document)
  end

  # GET /:slug
  def show
    slug = request.path_parameters[:slug].to_s
    page = Page.includes(:published_version).find_by(slug: slug)
    if page&.published?
      return redirect_to("/", status: :moved_permanently) if page.home?

      render_document(page.published_version.document)
    elsif (moved = SlugRedirect.includes(:page).find_by(from_slug: slug)) && moved.page.published?
      redirect_to moved.page.live_path, status: :moved_permanently
    else
      render_not_found
    end
  end
end
