# frozen_string_literal: true

# The site's own stylesheet (Custom CSS in Site style), drawn inside the
# site (CustomCss.scoped), at the address the layout links:
# /custom.css?v=<its digest>. An answer to the address of the stylesheet
# as it is now is kept for good; an older address, which a copy of a page
# in a cache may still link, gets the stylesheet as it is now, kept by no
# one, so it is never the old rules for long.
class CustomCssController < ActionController::Base
  def show
    css = CustomCss.scoped(SiteStyle.current.custom_css)
    response.headers["Cache-Control"] = params[:v] == CustomCss.digest(css) ? "public, max-age=31536000, immutable" : "no-cache"
    render plain: css, content_type: "text/css"
  end
end
