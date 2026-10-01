# frozen_string_literal: true

# What a visitor can read on a page: its text, the page title, and the
# alt, title, aria-label and placeholder attributes a browser shows or
# reads aloud. Addresses, classes and data- attributes are not in it: a
# provider's host in an iframe's src is how the page reaches the provider,
# not something it says.
module VisibleText
  # Names a published page must never show a visitor: the video and map
  # providers RenderPolicy frames, and brands an example page might reach
  # for. Matched as whole words, in any case.
  BRANDS = %w[
    YouTube Vimeo OpenStreetMap Google Apple Microsoft Facebook Instagram
    Twitter TikTok Spotify Amazon Netflix Mapbox Wikipedia GitHub
  ].freeze

  def visible_text(html)
    fragment = Nokogiri::HTML5.fragment(html)
    texts = fragment.xpath(".//text()[not(ancestor::script) and not(ancestor::style)]").map(&:text)
    labels = fragment.xpath(".//@alt | .//@title | .//@aria-label | .//@placeholder").map(&:value)
    (texts + labels).join("\n")
  end

  # The brands of BRANDS that html shows a visitor.
  def brands_in(html)
    text = visible_text(html)
    BRANDS.select { |brand| text.match?(/\b#{Regexp.escape(brand)}\b/i) }
  end
end
