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

    sections = Array(document["sections"]).select { |section| section.is_a?(Hash) }
    STICKY_ROW.each_index.map do |device|
      height = sections.sum { |section| section_height(section, device) }
      ([ height - STICKY_SPARE, 0 ].max.to_f / STICKY_ROW[device]).ceil.clamp(1, 9)
    end.join(" ")
  end

  # A section's height in a sticky header on a device (0 a desktop, 1 a
  # tablet, 2 a phone), as the rows count it: its columns side by side, the
  # tallest; one under the other (no stack: tablets and phones; phone:
  # phones; never: none), all of them; and its own space above and below
  # past the header's. A section's space between its columns is across
  # them only: their gap, one under the other, is the theme's.
  def section_height(section, device)
    columns = section["children"].is_a?(Array) ? section["children"] : []
    heights = columns.map { |column| column_height(column, device) }
    heights = [ STICKY_ROW[device] ] if heights.empty?
    stack = section["props"].is_a?(Hash) ? section["props"]["stack"] : nil
    stacked = heights.size >= 2 && (device == 1 ? !%w[phone never].include?(stack) : device == 2 && stack != "never")
    (stacked ? heights.sum : heights.max) + space_over(section, device)
  end

  # A column's height: its rows (column_rows); its own space inside, above
  # and below; the space between its blocks past the theme's (site.css,
  # .col's --col-gap); and each heading's and text's line past what a row
  # holds (text_over).
  def column_height(column, device)
    return STICKY_ROW[device] unless column.is_a?(Hash)

    blocks = column["children"].is_a?(Array) ? column["children"] : []
    inside = step(column, "spaceInside", device, SITE_SPACE) || 0
    between = step(column, "spaceBetween", device, SITE_SPACE) || COLUMN_GAP
    texts = blocks.sum { |block| text_over(block, column, device) }
    (column_rows(column) * STICKY_ROW[device]) + (2 * inside) + ([ between - COLUMN_GAP, 0 ].max * [ blocks.size - 1, 0 ].max) + texts
  end

  # The pixels a heading's or a text's line takes past what a header's row
  # holds (the row less the header's space above and below), on one line:
  # a heading at its own type step, else its level's (h1 heading-1 to h4
  # large, as _heading.html.erb draws it); a text at its own, else its
  # column's, else body. A text that wraps is taller still; the page has no
  # script to measure it.
  def text_over(block, column, device)
    return 0 unless block.is_a?(Hash)

    size = case block["type"]
    when "heading"
      level = block["props"].is_a?(Hash) ? block["props"]["level"] : nil
      named(block, "textSize", device) || LEVEL_STEPS[(level.is_a?(Integer) && level.between?(1, 4) ? level : 2) - 1]
    when "text"
      named(block, "textSize", device) || named(column, "textSize", device) || "body"
    end
    size.nil? ? 0 : [ TEXT_LINE.fetch(size)[device] - (STICKY_ROW[device] - (2 * HEADER_SPACE[device])), 0 ].max
  end

  # A block's own type step for a style key on a device, as the page's
  # classes apply it (step's rule), or nil.
  def named(block, key, device)
    style = block["style"].is_a?(Hash) ? block["style"] : {}
    own = style[[ nil, "tablet", "phone" ][device]]
    base = style["base"]
    [ own.is_a?(Hash) ? own[key] : nil, base.is_a?(Hash) ? base[key] : nil ].find { |value| TEXT_LINE.key?(value) }
  end

  # The pixels of a block's own step for a style key on a device: the
  # device's own where it names a step of the table, else the base's, a
  # phone's never the tablet's, as the page's classes apply them; nil where
  # neither does.
  def step(block, key, device, table)
    style = block["style"].is_a?(Hash) ? block["style"] : {}
    own = style[[ nil, "tablet", "phone" ][device]]
    base = style["base"]
    name = [ own.is_a?(Hash) ? own[key] : nil, base.is_a?(Hash) ? base[key] : nil ].find { |value| table.key?(value) }
    name.nil? ? nil : table.fetch(name)
  end

  # What a header's row is counted at, and the header's own space above
  # and below a section that sets none, on a desktop, a tablet and a phone;
  # and the pixels to spare under it all, which a section's own space uses
  # first (site.css: --sticky-row, .sw-header's --sec-y, the 16 added).
  STICKY_ROW = [ 88, 88, 68 ].freeze
  HEADER_SPACE = [ 20, 20, 12 ].freeze
  STICKY_SPARE = 16

  # The space steps a column's spaceInside and spaceBetween may name, and
  # those a section's spaceAbove and spaceBelow may, in pixels, the same on
  # every device: tokens.json's space.site, and space.site-section with
  # them, which render_policy_test.rb holds these to (the module needs
  # nothing of Rails, so the editor's twins can run it). A column's blocks
  # stand the theme's l apart where it sets no space between them.
  SITE_SPACE = { "none" => 0, "xs" => 4, "s" => 8, "m" => 16, "l" => 24, "xl" => 32, "xxl" => 48 }.freeze
  SECTION_SPACE = SITE_SPACE.merge("section-s" => 64, "section-l" => 96).freeze
  COLUMN_GAP = SITE_SPACE.fetch("l")

  # The tallest line of each type step on a desktop, a tablet and a phone,
  # in whole pixels: of the three type scales, the largest size times its
  # line height (tokens.json, type.site, type.site-gentle and
  # type.site-strong, which render_policy_test.rb holds this to), so a
  # site's own scale is never above it. A heading's level draws it at a
  # step when it names none.
  TEXT_LINE = {
    "display" => [ 102, 68, 51 ], "heading-1" => [ 76, 54, 43 ], "heading-2" => [ 57, 43, 36 ], "heading-3" => [ 45, 37, 33 ],
    "large" => [ 37, 32, 30 ], "body" => [ 29, 28, 26 ], "small" => [ 23, 23, 21 ]
  }.freeze
  LEVEL_STEPS = %w[heading-1 heading-2 heading-3 large].freeze

  # The pixels a section's own space above and below adds on a device (0 a
  # desktop, 1 a tablet, 2 a phone) over the header's own: the device's own
  # step where it names one, else the base's, a phone's never the tablet's,
  # as the page's classes apply them; none where the section's space is the
  # header's or less.
  def space_over(section, device)
    sides = %w[spaceAbove spaceBelow].sum { |key| step(section, key, device, SECTION_SPACE) || HEADER_SPACE[device] }
    [ sides - (2 * HEADER_SPACE[device]), 0 ].max
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
