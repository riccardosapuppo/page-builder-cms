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
# and adds the file's slack for the few it sets apart. A character the face
# lacks is drawn by whatever font the visitor's machine falls back to, so
# the file holds, for the scripts a header may hold (Greek, Cyrillic,
# Hebrew, Arabic, CJK), the widest advance each letter was drawn with where
# it was measured, after any letter of its script or in any of its joined
# forms (for CJK, the script's widest letter), and a letter of one counts
# that; any other character counts 1.5 times the font size,
# wider than any letter of the face. So the sum errs wide: in the face's own
# letters a menu may fold a step early, never late. For a letter of another script it is as good as
# the measure: a font that draws one wider than counted, or a character
# counted at 1.5 em that is drawn wider still (a ligature such as U+FDFD),
# can put the bar on two rows, which site.css lets the links do inside the
# bar rather than leave the page. The editor's canvas must add up the same
# file the same way to draw the same header at the same widths.
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
    text.to_s.each_char.sum { |ch| advance(place, ch) } * (1 + metrics.fetch("slack"))
  end

  # What one character counts in a place: its own advance in the face; else,
  # in a script the file measured, its own width if the script lists its
  # letters, and the script's widest letter if not; else the place's
  # `otherwise`.
  def advance(place, ch)
    place.fetch("advances").fetch(ch) do
      point = ch.ord
      script = place.fetch("scripts").find { |s| s.fetch("ranges").any? { |from, to| point.between?(from, to) } }
      script ? script.fetch("letters").fetch(ch, script.fetch("advance")) : place.fetch("otherwise")
    end
  end

  def metrics
    @metrics ||= JSON.parse(File.read(PATH, encoding: "UTF-8")).freeze
  end
end
