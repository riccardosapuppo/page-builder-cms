# frozen_string_literal: true

# The published pages: / serves the page marked as home, /<slug> every
# other page, each with the version that was published last, cached in
# the browser and in Solid Cache (PublicPage#render_published).
#
# An address a page had before it was published under a new one answers
# 301 to where the page is now, and the home page's own slug answers 301
# to /, so each page has one address. Anything else is the site's 404 page.
#
# The page row is read without its version: a request the browser's copy
# answers (304), or the cache, never reads the version's document.
class PagesController < ApplicationController
  include PublicPage

  # GET /
  def home
    page = Page.find_by(home: true)
    return render_not_found unless page&.published?

    render_published(page)
  end

  # GET /:slug
  def show
    slug = request.path_parameters[:slug].to_s
    page = Page.find_by(slug: slug)
    if page&.published?
      return redirect_to("/", status: :moved_permanently) if page.home?

      render_published(page)
    elsif (moved = SlugRedirect.includes(:page).find_by(from_slug: slug)) && moved.page.published?
      redirect_to moved.page.live_path, status: :moved_permanently
    else
      render_not_found
    end
  end
end
