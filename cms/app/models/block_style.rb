# frozen_string_literal: true

# Turns a block's style ({base, tablet?, phone?}, token names only) into the
# classes the page carries and into its data-style attribute.
#
# A token becomes a class of app/assets/stylesheets/tokens.css: spaceInside
# "l" becomes pad-l, and the same value overridden on tablets becomes
# tablet-pad-l, which applies only inside the tablet container query. The
# block partials decide which element gets which class (a button's
# background goes on the button, not on its wrapper).
#
# Only the keys and values the schema's enums name ever become a class, so
# a document that reached the renderer without the schema's check cannot
# write a class of its own choosing. data-style repeats the stored style,
# canonically, for the contract between this renderer and the editor's: it
# compares settings that would otherwise exist only as classes and CSS.
module BlockStyle
  DEVICES = %w[base tablet phone].freeze

  # The class family of each style key.
  FAMILY = {
    "spaceInside" => "pad",
    "spaceBetween" => "gap",
    "spaceAbove" => "space-above",
    "spaceBelow" => "space-below",
    "background" => "bg",
    "color" => "fg",
    "textSize" => "size",
    "align" => "align",
    "verticalAlign" => "valign",
    "aspect" => "aspect"
  }.freeze

  # The schema's enum for each key, read once from the schema file.
  ENUM_OF = {
    "spaceInside" => "spaceToken",
    "spaceBetween" => "spaceToken",
    "spaceAbove" => "sectionSpaceToken",
    "spaceBelow" => "sectionSpaceToken",
    "background" => "backgroundToken",
    "color" => "paletteSlot",
    "textSize" => "typeStep",
    "align" => "alignToken",
    "verticalAlign" => "verticalAlignToken",
    "visibility" => "visibilityToken",
    "aspect" => "aspectToken"
  }.freeze

  ALLOWED = ENUM_OF.transform_values do |name|
    JSON.parse(File.read(Rails.application.config.x.schema_dir.join("block-document.schema.json"), encoding: "UTF-8"))
        .fetch("$defs").fetch(name).fetch("enum").freeze
  end.freeze

  module_function

  # The classes for one key: the base value (or default, when the style has
  # none), then the tablet and phone overrides with their prefix. family
  # replaces the key's own family where a block means it differently: a
  # section's spaceBetween is the gap between its columns (cols-gap), a
  # divider's colour is the colour of its line (line).
  def classes(style, key, family: FAMILY.fetch(key), default: nil)
    DEVICES.filter_map do |device|
      value = value(style, device, key)
      value = default if value.nil? && device == "base"
      next if value.nil?

      name = SiteTheme::TokenCss.class_value(value)
      device == "base" ? "#{family}-#{name}" : "#{device}-#{family}-#{name}"
    end
  end

  # hide-desktop, hide-tablet and hide-phone where the block is hidden. A
  # device without an override shows what base says.
  def visibility_classes(style)
    base = value(style, "base", "visibility") || "visible"
    {
      "desktop" => base,
      "tablet" => value(style, "tablet", "visibility") || base,
      "phone" => value(style, "phone", "visibility") || base
    }.filter_map { |device, shown| "hide-#{device}" if shown == "hidden" }
  end

  # "base.textSize=display;phone.textSize=heading-1": every stored setting,
  # devices in this order and keys sorted, or nil when there is none.
  def data_attribute(style)
    pairs = DEVICES.flat_map do |device|
      part = style.is_a?(Hash) ? style[device] : nil
      next [] unless part.is_a?(Hash)

      part.keys.sort.filter_map do |key|
        value = value(style, device, key)
        "#{device}.#{key}=#{value}" unless value.nil?
      end
    end
    pairs.empty? ? nil : pairs.join(";")
  end

  # The stored value, if the schema allows it for that key.
  def value(style, device, key)
    return nil unless style.is_a?(Hash) && style[device].is_a?(Hash)

    value = style[device][key]
    ALLOWED.fetch(key, []).include?(value) ? value : nil
  end
end
