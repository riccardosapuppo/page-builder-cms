# frozen_string_literal: true

# The stylesheet of a page's free colours (FreeColors), from its address
# alone: the site's Text and Background tones (t, b), its free tones by slot
# (s), the free colours the page's blocks name (c), and the release (v),
# whose code writes the rules. The page writes the address (FreeColors.path);
# nothing is read here, so the same address is the same rules for good, and
# is kept so. An address no page writes is a 404.
class FreeColorsController < ActionController::Base
  HEX = /\A[0-9a-f]{6}\z/
  # More colours than a site could name on one page: an address longer than
  # that is not one a page wrote.
  MOST = 256

  def show
    text = hex(params[:t])
    background = hex(params[:b])
    slots = slots(params[:s])
    colors = list(params[:c])
    return head(:not_found) if [ text, background, slots, colors ].any?(&:nil?)

    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    render plain: FreeColors.css(text: text, background: background, slots: slots, colors: colors), content_type: "text/css"
  end

  private

  def hex(value)
    value.is_a?(String) && HEX.match?(value) ? "##{value}" : nil
  end

  # "primary-1d4e6f,accent-f2c94c": a slot of the palette and its colour.
  def slots(value)
    return {} if value.nil?
    return nil unless value.is_a?(String)

    value.split(",").each_with_object({}) do |pair, found|
      slot, color = pair.split("-", 2)
      return nil unless SiteTokens.slots.key?(slot) && hex(color) && !found.key?(slot)

      found[slot] = hex(color)
    end
  end

  def list(value)
    return [] if value.nil?
    return nil unless value.is_a?(String)

    colors = value.split(",").map { |color| hex(color) }
    colors.any?(&:nil?) || colors.size > MOST ? nil : colors
  end
end
