# frozen_string_literal: true

# Free colours: a colour of the site's own choosing, "#1d4e6f", where a
# palette slot of Site style or a block's colour setting names one instead
# of a curated name (the schema's freeColor). A page carries it as a data
# attribute (BlockStyle.free_color_data, SiteHelper#site_style_data), never
# as an inline style, which the pages' Content-Security-Policy would block;
# the rules that colour it are a stylesheet made for the colours the page
# uses, kept once under its digest (ColorSheet) and linked as
# /colors/<digest>.css (FreeColorsController), written here exactly as the
# editor writes them for its canvas (builder/src/render/free-colors-css.ts):
# the same input, the same bytes.
#
# A free background brings the colours that read on it, as a slot's does
# (tokens.css, bg-<slot>): of the site's Text and Background tones, the one
# that reads better on it is its text, and headings, links, icons and
# captions follow it. A tablet or phone override in a slot's tone on a
# block whose own colour is free is drawn again here, after the base rule
# for the free colour, which would otherwise win on that device too.
module FreeColors
  PATTERN = /\A#[0-9a-f]{6}\z/

  # The first line of every sheet, which names what it holds.
  HEAD = "/* Free colours of this page: Site style's own tones, then the colours its blocks name. */"

  module_function

  def color?(value)
    value.is_a?(String) && PATTERN.match?(value)
  end

  # WCAG 2's contrast ratio of two #RRGGBB colours, from 1 to 21.
  def contrast(a, b)
    x = luminance(a)
    y = luminance(b)
    ([ x, y ].max + 0.05) / ([ x, y ].min + 0.05)
  end

  def luminance(hex)
    r, g, b = [ 1, 3, 5 ].map do |at|
      c = hex[at, 2].to_i(16) / 255.0
      c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055)**2.4
    end
    (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
  end

  # "dark" when the site's Background tone reads better on the colour than
  # its Text tone, "ink" otherwise.
  def pairing(color, text:, background:)
    contrast(color, background) > contrast(color, text) ? "dark" : "ink"
  end

  # The site style's Text and Background tones as colours, and its free
  # tones by slot.
  def site_colors(style)
    palette = style.palette.is_a?(Hash) ? style.palette : {}
    colors = SiteTokens.read.fetch("color")
    hex = lambda do |slot|
      value = palette[slot]
      next value if color?(value)

      tone = SiteTokens.slots.fetch(slot).tones.include?(value) ? value : SiteTokens.slots.fetch(slot).default
      colors.fetch(tone)
    end
    slots = SiteTokens.slots.keys.each_with_object({}) { |slot, free| free[slot] = palette[slot] if color?(palette[slot]) }
    { text: hex.call("text"), background: hex.call("background"), slots: slots }
  end

  # Every free colour a document's blocks name, as a background or a
  # colour, on any device.
  def of_document(document)
    found = []
    walk = lambda do |blocks|
      Array(blocks).each do |block|
        next unless block.is_a?(Hash)

        (block["style"].is_a?(Hash) ? block["style"].values : []).each do |part|
          next unless part.is_a?(Hash)

          %w[background color].each { |key| found << part[key] if color?(part[key]) }
        end
        walk.call(block["children"])
      end
    end
    walk.call(document.is_a?(Hash) ? document["sections"] : nil)
    found
  end

  SLOTS = BlockStyle::ALLOWED.fetch("color")

  # The stylesheet, from the site's Text and Background tones, its free
  # tones by slot and the free colours a page's blocks name: empty when
  # there are none.
  def css(text:, background:, slots:, colors:)
    colors = colors.select { |c| color?(c) }.uniq.sort
    free_slots = SLOTS.select { |slot| color?(slots[slot]) }
    return "" if colors.empty? && free_slots.empty?

    out = [ HEAD ]
    free_slots.each { |slot| out << %(.site[data-#{slot}="#{slots[slot]}"] { --sw-#{slot}: #{slots[slot]}; }) }
    unless colors.empty?
      site = { text: text, background: background }
      out.concat(background_rules("", colors, site), colour_rules("", colors), slot_colours_over_free)
      queries.each do |device, query|
        prefix = "#{device}-"
        out << "@container site (#{query}) {"
        rules = background_rules(prefix, colors, site) + slot_backgrounds_over_free(prefix) + colour_rules(prefix, colors) + slot_colours_over_device_free(prefix)
        out.concat(rules.map { |rule| "  #{rule}" })
        out << "}"
      end
    end
    "#{out.join("\n")}\n"
  end

  def queries
    breakpoints = SiteTokens.read.fetch("breakpoints").fetch("container")
    {
      "tablet" => "#{breakpoints.fetch('phone-below')}px <= width < #{breakpoints.fetch('tablet-below')}px",
      "phone" => "width < #{breakpoints.fetch('phone-below')}px"
    }
  end

  # Which colour wins, as tokens.css has it for the curated tones, kept with
  # free colours (a rule weighs what its selector does): on one device, a
  # block's own colour over the colour its background brings, curated or
  # free; a tablet's or a phone's own background brings its colour over the
  # desktop's own colour, a device's rules weighing two, the desktop's one.
  # The editor's twin says it at length (free-colors-css.ts).
  def attribute(prefix, family, color)
    prefix.empty? ? %([data-#{family}="#{color}"]) : %([data-#{prefix}#{family}="#{color}"][data-#{prefix}#{family}])
  end

  def background_rules(prefix, colors, site)
    colors.flat_map do |color|
      declarations, ring = free_background(color, site)
      selector = attribute(prefix, "bg", color)
      [ "#{selector} { #{declarations} }", "#{selector} > * { --ring-color: #{ring}; }" ]
    end
  end

  def colour_rules(prefix, colors)
    colors.flat_map { |color| [ "#{attribute(prefix, 'fg', color)} { color: #{color}; }", "#{attribute(prefix, 'line', color)} { --line-color: #{color}; }" ] }
  end

  def slot_colours_over_free
    SLOTS.map { |slot| "[data-bg].fg-#{slot} { color: var(--sw-#{slot}); }" }
  end

  def slot_backgrounds_over_free(prefix)
    [ "none", *SLOTS ].flat_map do |slot|
      declarations, ring = SiteTheme::TokenCss.background(slot)
      selector = ":is([data-bg], [data-fg]).#{prefix}bg-#{slot}"
      [ "#{selector} { #{declarations} }", "#{selector} > * { --ring-color: #{ring}; }" ]
    end
  end

  def slot_colours_over_device_free(prefix)
    SLOTS.map { |slot| ":is([data-bg], [data-fg], [data-#{prefix}bg]).#{prefix}fg-#{slot} { color: var(--sw-#{slot}); }" } +
      SLOTS.map { |slot| "[data-line].#{prefix}line-#{slot} { --line-color: var(--sw-#{slot}); }" }
  end

  def free_background(color, site)
    if pairing(color, **site) == "dark"
      [ "background-color: #{color}; color: var(--sw-background); --heading-color: currentColor; --link-color: currentColor; --icon-color: currentColor; " \
        "--mark-disc: var(--sw-background); --mark-line: #{color}; --caption-color: currentColor;", "var(--sw-background)" ]
    else
      [ "background-color: #{color}; color: var(--sw-text); --heading-color: currentColor; --link-color: currentColor; --icon-color: currentColor; " \
        "--mark-disc: initial; --mark-line: initial; --caption-color: currentColor;", "var(--sw-text)" ]
    end
  end

  # The address of a page's stylesheet, or nil when it needs none: its
  # rules, from the site's tones, its free tones and the colours, kept
  # (ColorSheet) and named by their digest, so the address holds them for
  # good, however many colours the page names.
  def path(style, documents)
    site = site_colors(style)
    colors = documents.flat_map { |document| of_document(document) }.uniq.sort
    return nil if colors.empty? && site[:slots].empty?

    "/colors/#{ColorSheet.keep(css(text: site[:text], background: site[:background], slots: site[:slots], colors: colors))}.css"
  end
end
