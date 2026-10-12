# frozen_string_literal: true

# Where a menu's links fold into Menu, worked out from their words: a
# published page runs no script and cannot measure itself.
#
# A menu block is a container of its own (site.css): its links stand in a
# row while the block is as wide as the row needs, and fold into Menu
# below that, wherever the block sits, in a header's column as wide as
# what is left beside the logo, or across a page. So the width the row
# needs is added up from the widths of its letters, measured once in the
# site's typeface (schema/header-metrics.json, which tools/header-metrics.ts
# writes), and the gaps between the links, and the block names the
# narrowest of site.css's fold steps at which the row fits (data-fold);
# "all" folds it at every width, for a row wider than the widest step.
#
# The sum leaves out kerning, which in this face pulls most pairs together,
# and adds the file's slack for the few it sets apart. A character the face
# lacks is drawn by whatever font the visitor's machine falls back to, so
# the file holds, for the scripts a label may hold (Greek, Cyrillic,
# Hebrew, Arabic, CJK), the widest advance each letter was drawn with where
# it was measured, after any letter of its script or in any of its joined
# forms (for CJK, the script's widest letter), and a letter of one counts
# that; any other character counts 1.5 times the font size, wider than any
# letter of the face. So the sum errs wide: in the face's own letters a
# menu may fold a step early, never late. For a letter of another script it
# is as good as the measure: a font that draws one wider than counted, or a
# character counted at 1.5 em that is drawn wider still (a ligature such as
# U+FDFD), can put the row on two lines, which site.css lets the links do
# inside the block rather than leave the page. The editor's canvas must add
# up the same file the same way (builder/src/render/header-fit.ts) to draw
# the same menu at the same widths.
module HeaderFit
  PATH = Rails.application.config.x.schema_dir.join("header-metrics.json")

  module_function

  # data-fold for a menu whose links have these labels, or nil for one with
  # no link, which has nothing to fold.
  def menu_fold(labels)
    return nil if labels.empty?

    needed = width_needed(labels)
    step = metrics.fetch("fold").fetch("steps").find { |width| needed <= width }
    step ? step.to_s : "all"
  end

  # The width of the row: every label, and the gap between two links.
  def width_needed(labels)
    link = metrics.fetch("link")
    labels.sum { |label| run(link, label) } + link.fetch("gap") * (labels.size - 1)
  end

  # A run of text in a link, by code point, with the slack.
  def run(place, text)
    text.to_s.each_char.sum { |ch| advance(place, ch) } * (1 + metrics.fetch("slack"))
  end

  # What one character counts: its own advance in the face; else, in a
  # script the file measured, its own width if the script lists its
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
