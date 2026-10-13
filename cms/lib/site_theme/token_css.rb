# frozen_string_literal: true

module SiteTheme
  # Writes app/assets/stylesheets/tokens.css from schema/tokens.json and the
  # style enums of schema/block-document.schema.json: the custom properties
  # of the site theme, and one class per value a block's style may name.
  #
  #   ruby bin/rails tokens:css
  #
  # The file is committed, and test/lib/site_theme/token_css_test.rb fails
  # when it is not exactly what this writes, so a change to tokens.json
  # cannot reach the pages half done.
  #
  # Two kinds of rule come out:
  #
  # - Custom properties, set on the page root. .site holds the palette
  #   (--sw-<slot>), with the tone a new site starts with and, for every
  #   other curated tone, a rule keyed on a data attribute the layout writes
  #   from the site style (.site[data-primary="site-harbour"]): no inline
  #   style, which the pages' Content-Security-Policy would block. .sw holds
  #   the spacing steps (--space-<step>, --section-<step>) and the type
  #   scale (--fs-<step>, --lh-<step>) for desktop, tablet and phone, for
  #   the default type-scale choice; the others are keyed on
  #   .site[data-type-scale] the same way. So is the letter width: how wide
  #   the Headings typeface is drawn (--stretch-<part>), for the default
  #   choice on .sw and for the others on .site[data-letter-width].
  #
  # - Block settings. A block's style names tokens ({"spaceInside": "l"});
  #   the renderer turns each into a class (pad-l), and an override for
  #   tablets or phones into the same class with a prefix (tablet-pad-l),
  #   which applies only inside that device's container query. The classes
  #   set real properties on the element the renderer puts them on, and come
  #   after site.css in the page, so they win over the theme's defaults.
  module TokenCss
    # Where the file goes, from the app's root.
    OUTPUT = "app/assets/stylesheets/tokens.css"

    module_function

    # The file as the generator writes it from the schema folder's two files.
    def from_schema_dir(dir)
      read = ->(name) { JSON.parse(File.read(File.join(dir, name), encoding: "UTF-8")) }
      generate(tokens: read.call("tokens.json"), schema: read.call("block-document.schema.json"))
    end

    def generate(tokens:, schema:)
      breakpoints = tokens.fetch("breakpoints").fetch("container")
      tablet_below = breakpoints.fetch("tablet-below")
      phone_below = breakpoints.fetch("phone-below")
      devices = {
        "tablet" => "#{phone_below}px <= width < #{tablet_below}px",
        "phone" => "width < #{phone_below}px"
      }

      out = []
      out << header
      out << palette(tokens)
      out << spacing(tokens)
      out << type_scale(tokens, tablet_below: tablet_below, phone_below: phone_below)
      out << letter_width(tokens)
      out << "/* ---------- Block settings: one class per token, everywhere ---------- */\n"
      out << setting_rules(tokens, schema, prefix: "").join
      devices.each do |device, query|
        out << "\n/* ---------- The same settings, overridden on #{device}s only ---------- */\n"
        out << "@container site (#{query}) {\n"
        out << setting_rules(tokens, schema, prefix: "#{device}-").map { |rule| "  #{rule}" }.join
        out << "}\n"
      end
      out << visibility(tablet_below: tablet_below, phone_below: phone_below)
      out << column_widths(schema, tablet_below: tablet_below, phone_below: phone_below)
      out << spacers(schema)
      out.join
    end

    # A section's columnWidths is a prop, not a style: the preset's parts as
    # the grid's tracks, a share of the width (1fr, 2fr...) or fit, a column
    # as wide as what it holds (auto), the shares taking what the fit ones
    # leave. They apply wherever the columns stand side by side: on desktop
    # always; on tablets when the section's stack says phone or never
    # (stack-phone, stack-never, on the columns' grid), and on phones when
    # it says never. Elsewhere the columns stack, as site.css lays them out.
    def column_widths(schema, tablet_below:, phone_below:)
      presets = schema.fetch("$defs").fetch("columnWidthsToken").fetch("enum")
      tracks = presets.map do |preset|
        parts = preset.split(":").map { |part| part == "fit" ? "auto" : "minmax(0, #{Integer(part, 10)}fr)" }
        [ class_value(preset), parts.join(" ") ]
      end
      rules = lambda do |selector|
        tracks.map { |name, value| "  #{selector.call(name)} { grid-template-columns: #{value}; }\n" }.join
      end
      "\n/* ---------- Column widths, wherever the columns stand side by side ---------- */\n" \
        "@container site (width >= #{tablet_below}px) {\n#{rules.call(->(name) { ".widths-#{name}" })}}\n" \
        "@container site (#{phone_below}px <= width < #{tablet_below}px) {\n" \
        "#{rules.call(->(name) { ".stack-phone.widths-#{name}, .stack-never.widths-#{name}" })}}\n" \
        "@container site (width < #{phone_below}px) {\n#{rules.call(->(name) { ".stack-never.widths-#{name}" })}}\n"
    end

    # A spacer's size is a prop, not a style: one height for every device.
    def spacers(schema)
      sizes = schema.fetch("$defs").fetch("spaceToken").fetch("enum")
      "\n/* ---------- Spacer heights ---------- */\n" +
        sizes.map { |s| ".spacer-#{s} { height: var(--space-#{s}); }\n" }.join
    end

    def header
      <<~CSS
        /* Generated by `ruby bin/rails tokens:css` from schema/tokens.json and the
           style enums of schema/block-document.schema.json. Do not edit: a test
           fails when this file is not what the generator writes. */

      CSS
    end

    # The six slots, each with its default tone, then one rule per other
    # curated tone. A slot whose tone is chosen in the site style gets a
    # data-<slot> attribute on .site naming the tone.
    def palette(tokens)
      colors = tokens.fetch("color")
      slots = tokens.fetch("site-tones").reject { |name, _| name.start_with?("$") }
      lines = [ "/* ---------- Palette slots, with the tone a new site starts with ---------- */\n", ".site {\n" ]
      slots.each do |slot, entry|
        lines << "  --sw-#{slot}: #{colors.fetch(entry.fetch('default'))};\n"
      end
      lines << "}\n"
      slots.each do |slot, entry|
        entry.fetch("tones").each do |tone|
          name = tone.fetch("color")
          next if name == entry.fetch("default")

          lines << %(.site[data-#{slot}="#{name}"] { --sw-#{slot}: #{colors.fetch(name)}; }\n)
        end
      end
      lines << "\n"
      lines.join
    end

    def spacing(tokens)
      space = tokens.fetch("space")
      steps = space.fetch("site").map { |name, px| "--space-#{name}: #{px}px;" }
      sections = space.fetch("site-section").map { |name, px| "--#{name}: #{px}px;" }
      "/* ---------- Spacing steps (None to XXL) and the section rhythm ---------- */\n" \
        ".sw {\n  #{steps.join(' ')}\n  #{sections.join(' ')}\n}\n\n"
    end

    # The sizes of every type-scale choice of the site style (Gentle,
    # Balanced, Strong; site-type-scale names the scale under type each one
    # draws). Desktop sizes as the base; between a page 800 and 1280 wide
    # every step grows in a straight line from its tablet size to its
    # desktop size (type.site.desktop-fluid); tablet and phone sizes below.
    # The default choice is written on .sw, every other one on
    # .site[data-type-scale="<name>"] .sw: the layout writes the choice on
    # .site, so a page takes its sizes without an inline style. Each of
    # those writes all four blocks, so it never mixes with the default's.
    # The parts of the page that each letter-width choice gives a width
    # (site-letter-width): display, strong and ui, each a custom property
    # site.css and the face classes draw Archivo at.
    STRETCHES = %w[display strong ui].freeze

    # Archivo's width axis: a width outside it would be drawn at its end.
    STRETCH_RANGE = (62.0..125.0)

    def letter_width(tokens)
      widths = tokens.fetch("site-letter-width")
      default = widths.fetch("default")
      choices = widths.fetch("choices").sort_by { |choice| choice.fetch("name") == default ? 0 : 1 }
      raise ArgumentError, "site-letter-width's default #{default} is not one of its choices" unless choices.any? { |choice| choice.fetch("name") == default }

      out = +"/* ---------- Letter width: how wide the Headings typeface is drawn ---------- */\n"
      choices.each do |choice|
        name = choice.fetch("name")
        selector = name == default ? ".sw" : %(.site[data-letter-width="#{name}"] .sw)
        widths_of = STRETCHES.map { |part| "--stretch-#{part}: #{stretch(choice, part)};" }
        out << "/* #{choice.fetch('label')}#{', the default' if name == default} */\n"
        out << "#{selector} { #{widths_of.join(' ')} }\n"
      end
      out << "\n"
    end

    def stretch(choice, part)
      value = choice.fetch(part)
      number = value[/\A(\d+(?:\.\d+)?)%\z/, 1]
      return value if number && STRETCH_RANGE.cover?(number.to_f)

      raise ArgumentError, "the letter width #{choice.fetch('name')} gives #{part} #{value.inspect}: a percentage from 62% to 125%, Archivo's width axis"
    end

    def type_scale(tokens, tablet_below:, phone_below:)
      type = tokens.fetch("type")
      fluid = type.fetch("site").fetch("desktop-fluid")
      from = fluid.fetch("from-page")
      to = fluid.fetch("to-page")
      scale = tokens.fetch("site-type-scale")
      default = scale.fetch("default")
      choices = scale.fetch("choices").sort_by { |choice| choice.fetch("name") == default ? 0 : 1 }

      out = +"/* ---------- Type scale: desktop, growing from #{from} to #{to}, tablet, phone ---------- */\n"
      choices.each do |choice|
        name = choice.fetch("name")
        selector = name == default ? ".sw" : %(.site[data-type-scale="#{name}"] .sw)
        out << "/* #{choice.fetch('label')}#{', the default' if name == default} */\n"
        out << scale_rules(type_steps(type.fetch(choice.fetch("steps"))), selector,
                           from: from, to: to, tablet_below: tablet_below, phone_below: phone_below)
      end
      out << "\n"
    end

    # The steps of one scale under type: the entries with a [size, line
    # height] for each device.
    def type_steps(scale)
      scale.select { |_, value| value.is_a?(Hash) && value.key?("desktop") && value["desktop"].is_a?(Array) }
    end

    def scale_rules(steps, selector, from:, to:, tablet_below:, phone_below:)
      size_lines = ->(device) { steps.map { |name, sizes| "--fs-#{name}: #{px(sizes.fetch(device)[0])}; --lh-#{name}: #{number(sizes.fetch(device)[1])};" } }
      grow = steps.filter_map do |name, sizes|
        low = sizes.fetch("tablet")[0]
        high = sizes.fetch("desktop")[0]
        next if low == high

        slope = (high - low).to_f / (to - from)
        "--fs-#{name}: clamp(#{px(low)}, #{px(low - slope * from)} + #{number(slope * 100, 4)}cqi, #{px(high)});"
      end

      block = ->(query, lines) { "@container site (#{query}) {\n  #{selector} {\n#{lines.map { |l| "    #{l}\n" }.join}  }\n}\n" }
      "#{selector} {\n#{size_lines.call('desktop').map { |l| "  #{l}\n" }.join}}\n" +
        block.call("width >= #{from}px", grow) +
        block.call("width < #{tablet_below}px", size_lines.call("tablet")) +
        block.call("width < #{phone_below}px", size_lines.call("phone"))
    end

    # One rule per style token, in a fixed order: later families win over
    # earlier ones on the same element (a colour after its background's
    # paired text colour).
    def setting_rules(tokens, schema, prefix:)
      defs = schema.fetch("$defs")
      spaces = defs.fetch("spaceToken").fetch("enum")
      sections = defs.fetch("sectionSpaceToken").fetch("enum")
      slots = defs.fetch("paletteSlot").fetch("enum")
      steps = defs.fetch("typeStep").fetch("enum")
      faces = defs.fetch("typefaceToken").fetch("enum")
      aligns = defs.fetch("alignToken").fetch("enum")
      valigns = defs.fetch("verticalAlignToken").fetch("enum")
      aspects = defs.fetch("aspectToken").fetch("enum")
      check_names!(tokens, spaces: spaces, sections: sections, slots: slots, steps: steps, aspects: aspects)
      ratios = tokens.fetch("aspect").fetch("site")

      rules = []
      # spaceInside of a column: padding on all four sides.
      spaces.each { |s| rules << ".#{prefix}pad-#{s} { padding: var(--space-#{s}); }\n" }
      # spaceBetween: the gap of a column's widgets or a gallery's images,
      # and for a section the gap between its columns.
      spaces.each { |s| rules << ".#{prefix}gap-#{s} { gap: var(--space-#{s}); }\n" }
      spaces.each { |s| rules << ".#{prefix}cols-gap-#{s} { column-gap: var(--space-#{s}); }\n" }
      # spaceAbove and spaceBelow: the space above and below a section's
      # content, a spacing step (--space-l) or a section step (--section-s).
      %w[above top below bottom].each_slice(2) do |side, edge|
        sections.each do |s|
          property = spaces.include?(s) ? "--space-#{s}" : "--#{s}"
          rules << ".#{prefix}space-#{side}-#{s} { padding-#{edge}: var(#{property}); }\n"
        end
      end
      # background, with the colours that read on it. On the three dark
      # slots, text, headings, links and icons take the background colour;
      # on Accent, the text colour (INK_SLOTS); on the other light ones,
      # the theme's own (the Text slot, and Primary through the fallbacks
      # of site.css), so that a light column inside a dark band, or a light
      # tablet or phone override of a dark background, does not keep the
      # dark band's paper-coloured text. none shows the band behind, and
      # takes its colours back (inherit). The site's mark (a logo) draws
      # itself the other way round on the dark slots, as the design's footer
      # has it: a paper disc, its waterline in the band's own colour
      # (--mark-disc, --mark-line); elsewhere the theme's (site.css). Small
      # secondary text (a quote's who, a field's "required") is in the Muted
      # slot on the light bands, and in the band's own text colour on the
      # dark ones and on Accent, where the Muted slot does not read
      # (--caption-color).
      rules << ".#{prefix}bg-none { background-color: transparent; color: inherit; --heading-color: inherit; --link-color: inherit; --icon-color: inherit; --mark-disc: inherit; --mark-line: inherit; --caption-color: inherit; }\n"
      slots.each do |slot|
        paired =
          if DARK_SLOTS.include?(slot)
            "color: var(--sw-background); --heading-color: currentColor; --link-color: currentColor; --icon-color: currentColor; " \
              "--mark-disc: var(--sw-background); --mark-line: var(--sw-#{slot}); --caption-color: currentColor;"
          elsif INK_SLOTS.include?(slot)
            "color: var(--sw-text); --heading-color: currentColor; --link-color: currentColor; --icon-color: currentColor; --mark-disc: initial; --mark-line: initial; --caption-color: currentColor;"
          else
            "color: var(--sw-text); --heading-color: initial; --link-color: initial; --icon-color: initial; --mark-disc: initial; --mark-line: initial; --caption-color: initial;"
          end
        rules << ".#{prefix}bg-#{slot} { background-color: var(--sw-#{slot}); #{paired} }\n"
      end
      # The focus ring (site.css) of what sits on a background, in the
      # colour that reads on it: the Background slot on the three dark
      # slots, the Text slot on the others, which undoes a dark band's for
      # a light column inside it. It is set for the elements inside the
      # one with the background, never for that element itself: a button
      # with a background of its own draws its ring outside itself, on the
      # band around it, so its ring follows the band. none hands on the
      # ring of the band behind, as it does the colours.
      rules << ".#{prefix}bg-none > * { --ring-color: inherit; }\n"
      slots.each do |slot|
        ring = DARK_SLOTS.include?(slot) ? "background" : "text"
        rules << ".#{prefix}bg-#{slot} > * { --ring-color: var(--sw-#{ring}); }\n"
      end
      # color: of the text, or of the lines for a divider and an accordion.
      slots.each { |slot| rules << ".#{prefix}fg-#{slot} { color: var(--sw-#{slot}); }\n" }
      slots.each { |slot| rules << ".#{prefix}line-#{slot} { --line-color: var(--sw-#{slot}); }\n" }
      # textSize: a step of the type scale.
      steps.each { |step| rules << ".#{prefix}size-#{step} { font-size: var(--fs-#{step}); line-height: var(--lh-#{step}); }\n" }
      # typeface: a heading, a text or a quote in the body's face or the
      # headings', over the one its type takes in site.css (FACES).
      faces.each { |f| rules << ".w.#{prefix}face-#{f} { #{FACES.fetch(f)} }\n" }
      # align: the words, and where a box the theme caps (a paragraph, a
      # display heading's lines, a quote) stands in its column: at the
      # start, in the middle, at the end (--cap-margin, site.css).
      aligns.each { |a| rules << ".#{prefix}align-#{a} { text-align: #{a}; --cap-margin: #{CAP_MARGIN.fetch(a)}; }\n" }
      valigns.each { |v| rules << ".#{prefix}valign-#{v} { justify-content: #{VALIGN.fetch(v)}; }\n" }
      # aspect: the crop of an image, on the img inside the block. Cropped,
      # the picture covers its box. original needs no rule on every device:
      # the img keeps the shape its width and height attributes give it,
      # even before it loads. Only as a tablet or phone override does it
      # undo a crop, and then the shape comes from the file once loaded.
      aspects.each do |a|
        next if a == "original" && prefix.empty?

        fit = a == "original" ? "fill" : "cover"
        rules << ".#{prefix}aspect-#{class_value(a)} img { aspect-ratio: #{ratios.fetch(a)}; object-fit: #{fit}; }\n"
      end
      rules
    end

    # A token as a class name: "16:9" is aspect-16-9.
    def class_value(value)
      value.tr(":", "-")
    end

    # visibility: the renderer works out, for each device, whether a block
    # is shown there (a tablet or phone override, or else the base value),
    # and writes hide-<device> where it is not.
    def visibility(tablet_below:, phone_below:)
      <<~CSS

        /* ---------- Visibility, worked out per device by the renderer ---------- */
        @container site (width >= #{tablet_below}px) { .hide-desktop { display: none; } }
        @container site (#{phone_below}px <= width < #{tablet_below}px) { .hide-tablet { display: none; } }
        @container site (width < #{phone_below}px) { .hide-phone { display: none; } }
      CSS
    end

    # The two faces as site.css sets them, the body's on .sw and the
    # headings' on .w-heading (its tracking, --face-tracking, a little
    # tighter at the display step). The body's takes the weight of what is
    # around it, so a heading set in it reads as running text does. The
    # headings' face ships upright only: in it, words in italic stand
    # upright rather than in a slanted copy of the face (font-synthesis).
    FACES = {
      "body" => 'font-family: "Source Serif 4", Georgia, serif; font-weight: inherit; font-stretch: normal; letter-spacing: normal; font-synthesis: initial;',
      "heading" => 'font-family: "Archivo", "Helvetica Neue", sans-serif; font-weight: 700; font-stretch: var(--stretch-display, 100%); letter-spacing: var(--face-tracking); font-synthesis: none;'
    }.freeze

    # The inline margins that put a capped box where its words are aligned.
    CAP_MARGIN = { "left" => "0 auto", "center" => "auto", "right" => "auto 0" }.freeze

    # Slots dark enough that text in the Text slot does not read on them.
    DARK_SLOTS = %w[text primary muted].freeze
    # A light slot on which Primary, the colour of headings, links and
    # icons, does not read as text: a link in Sea on Buoy measured 3.85:1
    # in tools/check-production.ts, under the 4.5:1 of body text. The
    # design pairs Accent with ink only (its buttons), so all four take it.
    INK_SLOTS = %w[accent].freeze
    VALIGN = { "top" => "flex-start", "middle" => "center", "bottom" => "flex-end" }.freeze

    # The schema's enums and tokens.json must name the same things: a class
    # for a step tokens.json lacks would point at a custom property that is
    # never set.
    def check_names!(tokens, spaces:, sections:, slots:, steps:, aspects:)
      space = tokens.fetch("space")
      site_steps = tokens.fetch("type").fetch("site").keys.reject { |k| k.start_with?("$") || %w[ratio base desktop-fluid].include?(k) }
      {
        "spaceToken" => [ spaces, space.fetch("site").keys ],
        "sectionSpaceToken" => [ sections, space.fetch("site").keys + space.fetch("site-section").keys ],
        "paletteSlot" => [ slots, tokens.fetch("site-tones").keys.reject { |k| k.start_with?("$") } ],
        "typeStep" => [ steps, site_steps ],
        "aspectToken" => [ aspects, tokens.fetch("aspect").fetch("site").keys ]
      }.each do |name, (schema_names, token_names)|
        next if schema_names.sort == token_names.sort

        raise ArgumentError, "the schema's #{name} (#{schema_names.join(', ')}) and tokens.json (#{token_names.join(', ')}) differ"
      end
      # Every type-scale choice sizes every step, or a heading would fall
      # back to another choice's size.
      tokens.fetch("site-type-scale").fetch("choices").each do |choice|
        names = type_steps(tokens.fetch("type").fetch(choice.fetch("steps"))).keys
        next if names.sort == steps.sort

        raise ArgumentError, "the type scale #{choice.fetch('name')} (#{names.join(', ')}) and the schema's typeStep (#{steps.join(', ')}) differ"
      end
    end

    def px(value)
      "#{number(value, 3)}px"
    end

    # 18 -> "18", 1.05 -> "1.05", 18.666666 -> "18.667"
    def number(value, places = 3)
      rounded = value.to_f.round(places)
      rounded == rounded.to_i ? rounded.to_i.to_s : format("%.#{places}f", rounded).sub(/0+\z/, "")
    end
  end
end
