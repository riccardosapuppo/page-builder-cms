# frozen_string_literal: true

# The rules the page renderer applies to every address it writes into a
# page: links, image sources, and the players and maps a visitor can load;
# and to a block's anchor and classes of the site's own.
#
# The schema already refuses a document with a bad address, so on a stored
# document these rules change nothing. They are the last check before a
# browser sees the value, for a document that reached the renderer some
# other way (an older schema, a bug, a hand-edited row): an address they
# refuse is dropped, never repaired, and the text around it stays.
#
# Small and pure on purpose: plain Ruby with no Rails, no URI parser and no
# state. The editor gets a TypeScript twin of this module in stage 2, and
# the contract goldens (contract/) hold the two to the same output.
module RenderPolicy
  # The characters an address may hold after its scheme and host, as the
  # schema's href lists them: no space, no control character, no quote or
  # angle bracket, and no backslash, which browsers read as a slash ("/\x"
  # would become "//x", another site). Anything else arrives
  # percent-encoded.
  CHAR = "(?:[A-Za-z0-9._~!$&'()*+,;=:@/?#-]|%[0-9A-Fa-f]{2})"
  HOST = "[A-Za-z0-9.-]+(?::[0-9]{1,5})?"
  # https, http and mailto as written in lowercase, tel, a site path (never
  # //host), a query or a fragment: the forms of the schema's href.
  LINK = %r{\A(?:https?://#{HOST}(?:[/?#]#{CHAR}*)?|mailto:#{CHAR}+|tel:\+?[0-9][0-9().-]{0,31}|/(?!/)#{CHAR}*|[?#]#{CHAR}*)\z}
  # An image from another site: https only (no mixed content), or a site path.
  IMAGE = %r{\A(?:https://#{HOST}(?:[/?#]#{CHAR}*)?|/(?!/)#{CHAR}+)\z}
  MAX_URL_LENGTH = 2048

  # The video providers the schema allows, with the id each one takes and
  # the player address built from it. The privacy-enhanced YouTube host
  # sets no cookie until the video plays; Vimeo is asked not to track.
  #
  # The page never names a provider to the visitor: the approved design's
  # card says "the provider", and a provider's own name or brand is theirs.
  # The provider id stays in the document and in data-provider.
  VIDEO = {
    "youtube" => { origin: "https://www.youtube-nocookie.com", id: /\A[A-Za-z0-9_-]{11}\z/, path: "/embed/%s" },
    "vimeo" => { origin: "https://player.vimeo.com", id: /\A[0-9]{1,12}\z/, path: "/video/%s?dnt=1" }
  }.freeze

  MAP = { origin: "https://www.openstreetmap.org" }.freeze

  # Every origin a page may frame, for the Content-Security-Policy.
  FRAME_ORIGINS = (VIDEO.values.map { |provider| provider[:origin] } + [ MAP[:origin] ]).freeze

  module_function

  # The href to write, or nil to write the text without a link.
  def link_href(value)
    url?(value, LINK) ? value : nil
  end

  # The src of an image from another site, or nil to leave the image out.
  def image_src(value)
    url?(value, IMAGE) ? value : nil
  end

  # The player address for a provider and video id, or nil.
  def video_src(provider, video_id)
    rule = VIDEO[provider]
    return nil unless rule && video_id.is_a?(String) && rule[:id].match?(video_id)

    rule[:origin] + format(rule[:path], video_id)
  end

  def video_provider?(provider)
    VIDEO.key?(provider)
  end

  # A block's anchor, the id #anchor links scroll to, or nil.
  def anchor(value)
    value.is_a?(String) && /\A[a-z][a-z0-9-]{0,63}\z/.match?(value) ? value : nil
  end

  # The blocks a header's column counts three rows for: drawn taller than a
  # bar's logo, menu or button.
  TALL_BLOCKS = %w[image gallery video map iconbox quote accordion].freeze

  # The rows a sticky header draws on a desktop, a tablet and a phone, as
  # "desktop tablet phone" (each from 1 to 9), or nil for a document that is
  # not a sticky header's. A column is a row for each of its blocks, three
  # for a tall one, and at least one; a section is as many rows as its
  # tallest column, or, on the devices where its columns go one under the
  # other, as all its columns together: with no stack, on tablets and
  # phones; with stack phone, on phones; with never, on none. The page's
  # anchors stop that many rows below the window's top (site.css): the page
  # has no script to measure the header.
  def sticky_rows(document)
    return nil unless document.is_a?(Hash) && document["sticky"] == true

    rows = Array(document["sections"]).select { |section| section.is_a?(Hash) }.reduce([ 0, 0, 0 ]) do |(desktop, tablet, phone), section|
      columns = (section["children"].is_a?(Array) ? section["children"] : []).map { |column| column_rows(column) }
      columns = [ 1 ] if columns.empty?
      stack = section["props"].is_a?(Hash) ? section["props"]["stack"] : nil
      side = columns.max
      stacked = columns.size >= 2 ? columns.sum : side
      [ desktop + side, tablet + (stack == "phone" || stack == "never" ? side : stacked), phone + (stack == "never" ? side : stacked) ]
    end
    rows.map { |count| count.clamp(1, 9) }.join(" ")
  end

  # A column's rows, one for each of its blocks, three for a tall one, and
  # at least one.
  def column_rows(column)
    blocks = column.is_a?(Hash) && column["children"].is_a?(Array) ? column["children"] : []
    [ blocks.sum { |block| block.is_a?(Hash) && TALL_BLOCKS.include?(block["type"]) ? 3 : 1 }, 1 ].max
  end

  # A block's classes of the site's own, as the page writes them: the
  # names between single spaces of its className that are class names and
  # not the theme's (BlockDocument::Rules), in order, once each.
  def classes(value)
    return [] unless value.is_a?(String)

    value.split(/ /, -1).select { |name| /\A[A-Za-z][A-Za-z0-9_-]{0,39}\z/.match?(name) && BlockDocument::Rules.reserved_class(name).nil? }.uniq
  end

  # The map address for a point and a zoom level, or nil. The frame shows
  # an area about 800 by 450 pixels at that zoom, the 16:9 of the card the
  # approved design draws, centred on the point, with a marker on it.
  # Numbers are written with six decimals, about 10 cm, so the address is
  # the same on every machine.
  def map_src(latitude, longitude, zoom)
    return nil unless finite?(latitude) && finite?(longitude) && zoom.is_a?(Integer)
    return nil unless latitude.between?(-90, 90) && longitude.between?(-180, 180) && zoom.between?(1, 19)

    half_width = 360.0 / (2**zoom) * 400 / 256
    half_height = half_width * 450 / 800 * Math.cos([ latitude.abs, 85 ].min * Math::PI / 180)
    # Zoomed far out, the area would run past the edges of the map: it is
    # cut at the meridian 180 and at 85 degrees, where the map itself ends.
    box = [
      [ longitude - half_width, -180 ].max, [ latitude - half_height, -85 ].max,
      [ longitude + half_width, 180 ].min, [ latitude + half_height, 85 ].min
    ]
    "#{MAP[:origin]}/export/embed.html?bbox=#{box.map { |n| decimal(n) }.join('%2C')}" \
      "&layer=mapnik&marker=#{decimal(latitude)}%2C#{decimal(longitude)}"
  end

  def url?(value, pattern)
    value.is_a?(String) && value.length <= MAX_URL_LENGTH && pattern.match?(value)
  end

  def finite?(value)
    value.is_a?(Numeric) && value.to_f.finite?
  end

  # 6 decimals, never "-0.000000".
  def decimal(number)
    text = format("%.6f", number)
    text == "-0.000000" ? "0.000000" : text
  end
end
