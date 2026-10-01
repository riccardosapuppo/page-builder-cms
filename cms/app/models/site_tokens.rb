# frozen_string_literal: true

# What the site style may hold, read from schema/tokens.json: the palette
# slots with their curated tones and defaults (site-tones) and the
# type-scale choices (site-type-scale). The schema lint checks that the
# schema's slot names are these, so the editor, the schema and this server
# share one list.
module SiteTokens
  PATH = Rails.application.config.x.schema_dir.join("tokens.json")

  Slot = Data.define(:name, :label, :default, :tones)

  module_function

  def slots
    @slots ||= read.fetch("site-tones").filter_map do |name, entry|
      next if name.start_with?("$")

      Slot.new(name: name, label: entry.fetch("label"), default: entry.fetch("default"),
               tones: entry.fetch("tones").map { |tone| tone.fetch("color") }.freeze)
    end.index_by(&:name).freeze
  end

  def type_scales
    @type_scales ||= read.fetch("site-type-scale").fetch("choices").map { |choice| choice.fetch("name") }.freeze
  end

  def default_palette
    slots.transform_values(&:default)
  end

  def default_type_scale
    read.fetch("site-type-scale").fetch("default")
  end

  def read
    @read ||= JSON.parse(File.read(PATH, encoding: "UTF-8")).freeze
  end
end
