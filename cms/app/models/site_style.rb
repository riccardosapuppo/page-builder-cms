# frozen_string_literal: true

# The site style: which tone each palette slot has, and how strongly the
# type scale steps up. Every published page takes its colours and sizes
# from it. Only the values of schema/tokens.json are accepted (SiteTokens):
# there is no free colour and no free size.
#
# One row for the whole site, id 1. Until someone changes the style there
# is no row, and the defaults of tokens.json apply.
class SiteStyle < ApplicationRecord
  ID = 1

  validate :palette_has_a_curated_tone_for_every_slot
  validates :type_scale, inclusion: { in: ->(_) { SiteTokens.type_scales }, message: "is not one of the type-scale choices" }

  def self.current
    find_by(id: ID) || new(id: ID, palette: SiteTokens.default_palette, type_scale: SiteTokens.default_type_scale)
  end

  # Errors on one slot are recorded as "palette/<slot>"; this is the value
  # such an error is about.
  def read_attribute_for_validation(name)
    return super unless name.start_with?("palette/")

    palette.is_a?(Hash) ? palette[name.to_s.delete_prefix("palette/")] : nil
  end

  private

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
      elsif !slot.tones.include?(palette[name])
        errors.add(:"palette/#{name}", :inclusion, message: "must be one of #{slot.tones.join(', ')}")
      end
    end
    (palette.keys - slots.keys).each do |name|
      errors.add(:"palette/#{BlockDocument::Rules.escape_pointer(name.to_s)}", :unknown, message: "is not a palette slot")
    end
  end
end
