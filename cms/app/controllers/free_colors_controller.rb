# frozen_string_literal: true

# The stylesheet of a page's free colours (FreeColors), by the digest the
# page links (/colors/<digest>.css): its rules were written and kept
# (ColorSheet) when the page was drawn, so the same address is the same
# bytes for good, and is kept so. An address no page links is a 404, and
# so is the digest of a sheet of free type, which a page links at its own
# address (FreeTypeController).
class FreeColorsController < ActionController::Base
  def show
    sheet = ColorSheet.find_by(digest: params[:digest])
    return head(:not_found) unless sheet&.css&.start_with?(FreeColors::HEAD)

    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    render plain: sheet.css, content_type: "text/css"
  end
end
