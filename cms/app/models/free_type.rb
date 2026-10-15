# frozen_string_literal: true

# Free type: a heading's, a text's or a quote's own size, weight, letter
# spacing, line height and letter width (the schema's fontSize,
# fontWeight, letterSpacing, lineHeight and letterWidth), each over what its
# type step and its typeface give, on its own. A page carries each value as
# a data attribute (BlockStyle.free_type_data), never as an inline style,
# which the pages' Content-Security-Policy would block; the rules that draw
# them are a stylesheet made for the values the page uses, kept once under
# its digest (ColorSheet, beside the free colours' sheets) and linked as
# /type/<digest>.css (FreeTypeController), written here exactly as the
# editor writes them for its canvas (builder/src/render/free-type-css.ts):
# the same input, the same bytes.
#
# A value is read by the application rules' own tables and tests
# (BlockDocument::Rules: sizeRange, decimals), and every rule is written
# from the number read and a unit of a closed list, never from the text a
# document holds: a value the schema or the rules refuse writes nothing. A
# size in vw is written in cqw, a hundredth of the page root's width, which
# on the published page is the page's; the editor's canvas draws the page
# narrower than its window, and there vw would measure the window. The
# module needs nothing of Rails but where it keeps a sheet (path), so the
# editor's twins can run it.
module FreeType
  KEYS = %w[fontSize fontWeight letterSpacing lineHeight letterWidth].freeze
  # The block types that take free type: those that take a type step and a
  # typeface (the schema's textStyle).
  BLOCKS = %w[heading text quote].freeze
  DEVICES = %w[base tablet phone].freeze
  WEIGHTS = [ 100, 200, 300, 400, 500, 600, 700, 800, 900 ].freeze
  # How far letter spacing, a line height and a letter width go: the
  # rules' table, the schema's minimum and maximum.
  NUMBERS = BlockDocument::Rules::FREE_NUMBER_RANGES

  # The data attribute each key is carried by, named after the property it
  # sets: a letter width is the face's stretch.
  FAMILY = {
    "fontSize" => "font-size",
    "fontWeight" => "font-weight",
    "letterSpacing" => "letter-spacing",
    "lineHeight" => "line-height",
    "letterWidth" => "font-stretch"
  }.freeze

  # The container queries of a tablet and a phone, as tokens.css writes them
  # from tokens.json's container breakpoints, which free_type_test.rb holds
  # these to.
  QUERIES = { "tablet" => "560px <= width < 800px", "phone" => "width < 560px" }.freeze

  # The first line of every sheet, which names what it holds.
  HEAD = "/* Free type of this page: the sizes, weights, letter spacing, line heights and letter widths its headings, texts and quotes set. */"

  module_function

  # A value as the page writes it, in its data attributes and in
  # data-style: a size as the schema writes it ("6vw", "48.5px"), a weight
  # ("800"), a number with no zero ending its decimals ("-0.02", "62.5"); nil
  # for any value the schema or the rules refuse.
  def text(key, value)
    case key
    when "fontSize"
      found = size(value)
      found && "#{BlockDocument::Rules.hundredths_text(found[0])}#{found[1]}"
    when "fontWeight"
      number?(value) && WEIGHTS.include?(value) ? value.to_i.to_s : nil
    when *NUMBERS.keys
      found = number(key, value)
      found && BlockDocument::Rules.hundredths_text((found * 100).round)
    end
  end

  # A size the schema and the rules take, as its number in hundredths and
  # its unit ([600, "vw"]), or nil.
  def size(value)
    parts = BlockDocument::Rules.font_size_parts(value)
    parts if parts && BlockDocument::Rules.font_size_in_range?(*parts)
  end

  # A number of letter spacing, line height or letter width the schema and
  # the rules take, or nil.
  def number(key, value)
    low, high = NUMBERS.fetch(key)
    value if number?(value) && value.between?(low, high) && BlockDocument::Rules.two_decimals?(value)
  end

  def number?(value)
    value.is_a?(Integer) || (value.is_a?(Float) && value.finite?)
  end

  # The property's value for a value as the page writes it: a size in its
  # unit, a vw as a cqw; letter spacing in em; a letter width a percentage.
  def css_value(key, text)
    case key
    when "fontSize"
      hundredths, unit = BlockDocument::Rules.font_size_parts(text)
      "#{BlockDocument::Rules.hundredths_text(hundredths)}#{unit == 'vw' ? 'cqw' : unit}"
    when "letterSpacing" then "#{text}em"
    when "letterWidth" then "#{text}%"
    else text
    end
  end

  # Which rule wins: a block's own type over its step's and its face's, on
  # every device, and a tablet's or a phone's own value over the desktop's,
  # a desktop's rule weighing two (.w[data-font-weight="800"]) and a
  # device's three. The editor's twin says it at length (free-type-css.ts).
  def rule(device, key, text)
    name = device == "base" ? "data-#{FAMILY.fetch(key)}" : "data-#{device}-#{FAMILY.fetch(key)}"
    selector = device == "base" ? %(.w[#{name}="#{text}"]) : %(.w[#{name}="#{text}"][#{name}])
    "#{selector} { #{FAMILY.fetch(key)}: #{css_value(key, text)}; }"
  end

  # One device's rules: each key in its order, each value once, sorted as
  # the page writes them.
  def device_rules(device, values)
    values = {} unless values.is_a?(Hash)
    KEYS.flat_map do |key|
      list = values[key].is_a?(Array) ? values[key] : []
      list.filter_map { |value| text(key, value) }.uniq.sort.map { |found| rule(device, key, found) }
    end
  end

  # The stylesheet for the free type of a page, from the values each key
  # takes on each device ({ "base" => { "fontSize" => ["6vw"] } }): the
  # desktop's rules, then a tablet's and a phone's inside their container
  # queries. Empty when there is none.
  def css(input)
    input = {} unless input.is_a?(Hash)
    out = DEVICES.flat_map do |device|
      rules = device_rules(device, input[device])
      next [] if rules.empty?
      next rules if device == "base"

      [ "@container site (#{QUERIES.fetch(device)}) {", *rules.map { |line| "  #{line}" }, "}" ]
    end
    out.empty? ? "" : "#{[ HEAD, *out ].join("\n")}\n"
  end

  # The values of free type a document's headings, texts and quotes hold, on
  # each device, as stored: what the stylesheet reads them from.
  def of_document(document)
    found = DEVICES.to_h { |device| [ device, KEYS.to_h { |key| [ key, [] ] } ] }
    walk = lambda do |blocks|
      Array(blocks).each do |block|
        next unless block.is_a?(Hash)

        if BLOCKS.include?(block["type"]) && block["style"].is_a?(Hash)
          DEVICES.each do |device|
            part = block["style"][device]
            next unless part.is_a?(Hash)

            KEYS.each { |key| found[device][key] << part[key] if part.key?(key) }
          end
        end
        walk.call(block["children"])
      end
    end
    walk.call(document.is_a?(Hash) ? document["sections"] : nil)
    found
  end

  # The values of the documents a page draws (its own, the header's and the
  # footer's), together.
  def for_documents(documents)
    all = documents.map { |document| of_document(document) }
    DEVICES.to_h { |device| [ device, KEYS.to_h { |key| [ key, all.flat_map { |input| input[device][key] } ] } ] }
  end

  # The address of a page's stylesheet, or nil when it needs none: its
  # rules, kept (ColorSheet) and named by their digest, so the address holds
  # them for good.
  def path(documents)
    sheet = css(for_documents(documents))
    sheet.empty? ? nil : "/type/#{ColorSheet.keep(sheet)}.css"
  end
end
