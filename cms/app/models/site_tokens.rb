# frozen_string_literal: true

# What the site style may hold, read from schema/tokens.json: the palette
# slots with their curated tones and defaults (site-tones), the type-scale
# choices (site-type-scale) and the letter widths (site-letter-width). The schema lint checks that the
# schema's slot names are these, so the editor, the schema and this server
# share one list.
module SiteTokens
  PATH = Rails.application.config.x.schema_dir.join("tokens.json")

  # tones are colour names of tokens.json, in the order the editor offers
  # them; tone_labels gives each the name a person reads (Sea, Harbour...).
  Slot = Data.define(:name, :label, :default, :tones, :tone_labels)

  module_function

  def slots
    @slots ||= read.fetch("site-tones").filter_map do |name, entry|
      next if name.start_with?("$")

      tones = entry.fetch("tones")
      Slot.new(name: name, label: entry.fetch("label"), default: entry.fetch("default"),
               tones: tones.map { |tone| tone.fetch("color") }.freeze,
               tone_labels: tones.to_h { |tone| [ tone.fetch("color"), tone.fetch("label") ] }.freeze)
    end.index_by(&:name).freeze
  end

  def type_scales
    type_scale_labels.keys
  end

  def type_scale_labels
    @type_scale_labels ||= read.fetch("site-type-scale").fetch("choices").to_h { |choice| [ choice.fetch("name"), choice.fetch("label") ] }.freeze
  end

  def default_palette
    slots.transform_values(&:default)
  end

  def default_type_scale
    read.fetch("site-type-scale").fetch("default")
  end

  def letter_widths
    letter_width_labels.keys
  end

  def letter_width_labels
    @letter_width_labels ||= read.fetch("site-letter-width").fetch("choices").to_h { |choice| [ choice.fetch("name"), choice.fetch("label") ] }.freeze
  end

  def default_letter_width
    read.fetch("site-letter-width").fetch("default")
  end

  # The tallest line of each type step on a desktop, a tablet and a phone,
  # in whole pixels: of the three type scales (type.site, type.site-gentle,
  # type.site-strong), the largest size times its line height.
  def text_lines
    @text_lines ||= begin
      scales = %w[site-gentle site site-strong].map { |name| read.fetch("type").fetch(name) }
      %w[display heading-1 heading-2 heading-3 large body small].to_h do |step|
        [ step, %w[desktop tablet phone].map { |device| scales.map { |scale| size, height = scale.fetch(step).fetch(device); (size * height).ceil }.max } ]
      end.freeze
    end
  end

  # The space steps a column's spaceInside and spaceBetween may name, in
  # pixels (tokens.json, space.site), the same on every device.
  def site_space
    @site_space ||= read.fetch("space").fetch("site").freeze
  end

  # The space steps a section's spaceAbove and spaceBelow may name, in
  # pixels: the site's steps and the section steps (tokens.json, space.site
  # and space.site-section), the same on every device.
  def section_space
    @section_space ||= read.fetch("space").fetch("site").merge(read.fetch("space").fetch("site-section")).freeze
  end

  def read
    @read ||= JSON.parse(File.read(PATH, encoding: "UTF-8")).freeze
  end
end
