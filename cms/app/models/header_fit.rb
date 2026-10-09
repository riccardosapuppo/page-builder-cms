# frozen_string_literal: true

# Where the header's links fold into Menu, worked out from the words the
# header holds: a published page runs no script and cannot measure itself.
#
# The design's bar holds its four links from 800 px up, with 46 px to
# spare, and folds them into Menu below that, as on a tablet. The editor
# sets the name, the links and the button's label (Site), and a longer
# menu would no longer fit the bar there: site.css would let the bar wrap
# onto two rows rather than leave the window. So the width the bar needs
# is added up from the widths of its letters, measured once in the site's
# typeface (schema/header-metrics.json, which tools/header-metrics.ts
# writes) and the spacing around them, and the header names the narrowest
# of site.css's data-fold widths at which that fits. Below it the links
# fold into Menu; nil keeps the design's 800, and "all" folds them at
# every width, for a menu wider than the widest bar.
#
# The sum leaves out kerning, which in this face pulls most pairs together,
# and adds the file's slack for the few it sets apart; a character the
# face lacks counts as 1.5 times the font size, wider than any it has. So
# the sum errs wide: a menu may fold one step early, never late. The
# editor's canvas adds up the same file the same way, so it draws the same
# header at the same widths.
module HeaderFit
  PATH = Rails.application.config.x.schema_dir.join("header-metrics.json")

  module_function

  # data-fold for the header of site, or nil.
  def fold(site)
    links = Array(site.menu)
    return nil if links.empty?

    needed = width_needed(site)
    fold = metrics.fetch("fold")
    return nil if needed <= fold.fetch("breakpoint")

    step = fold.fetch("steps").find { |width| needed <= [ width, fold.fetch("widest") ].min }
    step ? step.to_s : "all"
  end

  # The width of the page at which the bar holds the brand, every link and
  # the button on one row, with the page's padding on both sides.
  def width_needed(site)
    m = metrics
    links = Array(site.menu)
    brand = m["brand"]["fixed"] + run(m["brand"], site.name) + m["brand"]["after"]
    menu = links.sum { |link| run(m["link"], link["label"]) } + m["link"]["gap"] * (links.size - 1) + m["link"]["after"]
    button = site.action ? m["nav"]["gap"] + m["button"]["fixed"] + run(m["button"], site.action["label"]) : 0
    (2 * m["page"]["padX"]) + brand + menu + button
  end

  # A run of text in one of the header's places, by code point, with the
  # slack.
  def run(place, text)
    advances = place.fetch("advances")
    otherwise = place.fetch("otherwise")
    text.to_s.each_char.sum { |ch| advances.fetch(ch, otherwise) } * (1 + metrics.fetch("slack"))
  end

  def metrics
    @metrics ||= JSON.parse(File.read(PATH, encoding: "UTF-8")).freeze
  end
end
