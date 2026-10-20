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
# write a class of its own choosing. A free colour a background or a colour
# names (the schema's freeColor, "#1d4e6f") is no class: it is a data
# attribute (free_color_data), which the stylesheet of the page's free
# colours reads (FreeColors); so is free type (free_type_data), which the
# stylesheet of the page's free type reads (FreeType); and so are a
# section's picture's veil, strength and focus (picture_data) and every
# block's motion (motion_data), which site.css draws. data-style repeats
# the stored style,
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
    "typeface" => "face",
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
    "typeface" => "typefaceToken",
    "align" => "alignToken",
    "verticalAlign" => "verticalAlignToken",
    "visibility" => "visibilityToken",
    "aspect" => "aspectToken",
    "veil" => "veilToken",
    "veilStrength" => "veilStrengthToken",
    "focus" => "focusToken",
    "motion" => "motionToken"
  }.freeze

  # The keys a section's picture reads, each carried by a data attribute
  # of its own (picture_data): its veil, the veil's strength, and the point
  # of it kept in view. No class: site.css draws the attributes.
  PICTURE_FAMILY = { "veil" => "veil", "veilStrength" => "veil-strength", "focus" => "focus" }.freeze

  DEFS = JSON.parse(File.read(Rails.application.config.x.schema_dir.join("block-document.schema.json"), encoding: "UTF-8")).fetch("$defs")

  ALLOWED = ENUM_OF.transform_values { |name| DEFS.fetch(name).fetch("enum").freeze }.freeze

  # The column-width presets a section may name ("3:2", "2:1:1"...).
  COLUMN_WIDTHS = DEFS.fetch("columnWidthsToken").fetch("enum").freeze
  # Where a section's columns may stack other than on tablets and phones.
  STACKS = DEFS.fetch("stackToken").fetch("enum").freeze

  module_function

  # A section's columnWidths when the schema lists it and it has one part
  # per column the section holds; nil otherwise, and the columns share the
  # width equally. A preset for another count is never stretched to fit.
  def column_widths(props, count)
    value = props.is_a?(Hash) ? props["columnWidths"] : nil
    COLUMN_WIDTHS.include?(value) && value.split(":").size == count ? value : nil
  end

  # A section's stack when the schema lists it and the section has columns
  # to stack, two or more; nil otherwise, and they stack on tablets and
  # phones.
  def stack(props, count)
    value = props.is_a?(Hash) ? props["stack"] : nil
    STACKS.include?(value) && count >= 2 ? value : nil
  end

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

  # The free colour a background or a colour holds on a device, or nil.
  def free_color(style, device, key)
    return nil unless %w[background color].include?(key) && style.is_a?(Hash) && style[device].is_a?(Hash)

    value = style[device][key]
    FreeColors.color?(value) ? value : nil
  end

  # The free colours of a background or a colour as data attributes, named
  # by the key's family and the device's prefix as a class is
  # ({ "bg" => "#1d4e6f", "tablet-bg" => "#c2352b" }): a divider's colour
  # is the colour of its line (line).
  def free_color_data(style, key, family: FAMILY.fetch(key))
    DEVICES.each_with_object({}) do |device, data|
      color = free_color(style, device, key)
      data[device == "base" ? family : "#{device}-#{family}"] = color if color
    end
  end

  # The value of free type a key holds on a device, as the page writes it
  # ("6vw", "800", "-0.02"), or nil when it holds none the schema and the
  # rules take.
  def free_type(style, device, key)
    return nil unless FreeType::KEYS.include?(key) && style.is_a?(Hash) && style[device].is_a?(Hash) && style[device].key?(key)

    FreeType.text(key, style[device][key])
  end

  # A block's free type as data attributes, named by the key's family and
  # the device's prefix as a class is ({ "font-size" => "6vw",
  # "tablet-font-size" => "4vw" }).
  def free_type_data(style)
    FreeType::KEYS.each_with_object({}) do |key, data|
      DEVICES.each do |device|
        text = free_type(style, device, key)
        data[device == "base" ? FreeType::FAMILY.fetch(key) : "#{device}-#{FreeType::FAMILY.fetch(key)}"] = text if text
      end
    end
  end

  # A section's picture's settings as data attributes, named by the key's
  # family and the device's prefix as a free colour's are ({ "veil" =>
  # "dark", "tablet-veil-strength" => "strong", "phone-focus" => "top" }):
  # only values the schema lists. The partial writes them only while the
  # section draws its picture.
  def picture_data(style)
    PICTURE_FAMILY.each_with_object({}) do |(key, family), data|
      DEVICES.each do |device|
        token = value(style, device, key)
        data[device == "base" ? family : "#{device}-#{family}"] = token if token
      end
    end
  end

  # How a block comes into view, on every device it says one, as data
  # attributes ({ "motion" => "rise", "phone-motion" => "none" }), which
  # site.css plays: every block's root carries them (BlocksHelper#block_root).
  def motion_data(style)
    DEVICES.each_with_object({}) do |device, data|
      token = value(style, device, "motion")
      data[device == "base" ? "motion" : "#{device}-motion"] = token if token
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

  # "base.textSize=display;phone.textSize=heading-1": every stored setting
  # (a free colour and free type too, as the page writes them), devices in
  # this order and keys sorted, or nil when there is none.
  def data_attribute(style)
    pairs = DEVICES.flat_map do |device|
      part = style.is_a?(Hash) ? style[device] : nil
      next [] unless part.is_a?(Hash)

      part.keys.sort.filter_map do |key|
        value = value(style, device, key) || free_color(style, device, key) || free_type(style, device, key)
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
