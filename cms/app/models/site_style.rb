# frozen_string_literal: true

# The site style: which tone each palette slot has, how strongly the type
# scale steps up, and how wide the Headings typeface is drawn. Every published page takes its colours and sizes
# from it. A slot takes one of its curated tones (SiteTokens) or a colour of
# the site's own, "#1d4e6f" (FreeColors); there is no free size. And the
# site's own stylesheet, its custom CSS, which every page draws inside the
# site, after the theme's (CustomCss).
#
# One row for the whole site, id 1. Until someone changes the style there
# is no row, and the defaults of tokens.json apply.
#
# And the style as it was before the Assistant's last new site (kept): its
# palette, type scale and letter width, and when it was kept, which the
# editor's "Put the old style back" puts back in one click. Kept by the
# change that brings the new site's style (the API's kept: "now"), let go
# of by the one that puts it back (kept: "none"); every other change leaves
# it as it is. Null while there is none.
class SiteStyle < ApplicationRecord
  ID = 1
  KEPT_MEMBERS = %w[palette typeScale letterWidth keptAt].freeze

  validate :palette_has_a_curated_tone_for_every_slot
  validates :type_scale, inclusion: { in: ->(_) { SiteTokens.type_scales }, message: "is not one of the type-scale choices" }
  validates :letter_width, inclusion: { in: ->(_) { SiteTokens.letter_widths }, message: "is not one of the letter-width choices" }
  validate :custom_css_keeps_to_the_site
  validate :kept_is_a_style_or_none

  def self.current
    find_by(id: ID) || new(id: ID, palette: SiteTokens.default_palette, type_scale: SiteTokens.default_type_scale, letter_width: SiteTokens.default_letter_width)
  end

  # The style as it is now, as kept to be put back, at `at`.
  def keepable(at = Time.current)
    { "palette" => palette, "typeScale" => type_scale, "letterWidth" => letter_width, "keptAt" => at.utc.iso8601(3) }
  end

  # Errors on one slot are recorded as "palette/<slot>"; this is the value
  # such an error is about.
  def read_attribute_for_validation(name)
    return super unless name.start_with?("palette/")

    palette.is_a?(Hash) ? palette[name.to_s.delete_prefix("palette/")] : nil
  end

  private

  # What is kept is a style as keepable writes it, or nothing.
  def kept_is_a_style_or_none
    return if kept.nil?

    errors.add(:kept, :invalid, message: "must be a style kept to be put back, or null") unless kept.is_a?(Hash) && kept.keys.sort == KEPT_MEMBERS.sort
  end

  # The custom CSS must keep to its scope, as the editor checks it before
  # sending it (CustomCss.check): the problem, with its line.
  def custom_css_keeps_to_the_site
    unless custom_css.is_a?(String)
      errors.add(:custom_css, :invalid, message: "must be a string")
      return
    end
    problem = CustomCss.check(custom_css)
    errors.add(:custom_css, :invalid, message: "line #{problem.line}: #{problem.message}") if problem
  end

  # The palette must name every slot, each with one of that slot's tones,
  # and nothing else. Errors are keyed by slot, so the API can point at the
  # value that is wrong.
  def palette_has_a_curated_tone_for_every_slot
    unless palette.is_a?(Hash)
      errors.add(:palette, :invalid, message: "must be an object of palette slots")
      return
    end

    slots = SiteTokens.slots
    slots.each do |name, slot|
      if !palette.key?(name)
        errors.add(:"palette/#{name}", :blank, message: "is missing")
      elsif !slot.tones.include?(palette[name]) && !FreeColors.color?(palette[name])
        errors.add(:"palette/#{name}", :inclusion, message: "must be one of #{slot.tones.join(', ')}, or a colour as #rrggbb")
      end
    end
    (palette.keys - slots.keys).each do |name|
      errors.add(:"palette/#{BlockDocument::Rules.escape_pointer(name.to_s)}", :unknown, message: "is not a palette slot")
    end
  end
end
