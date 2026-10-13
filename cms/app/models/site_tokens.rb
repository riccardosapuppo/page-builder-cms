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

  def read
    @read ||= JSON.parse(File.read(PATH, encoding: "UTF-8")).freeze
  end
end
