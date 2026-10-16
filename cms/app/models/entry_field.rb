# frozen_string_literal: true

# What a Field block draws, read from its props and the entry its template
# is drawn with: which value (the entry's title, or a field's by its key)
# and how its type draws it. The twin of builder/src/widgets/field/
# drawing.ts, held to it by the render contract; blocks/_field.html.erb
# draws it.
#
# A field draws as a widget does, and takes that widget's settings: a
# heading's (a text, or the title, given a level), a text's (a text
# without a level, a paragraph's lines, a rich text, a day, a toggle that
# is on, a choice's option, a number), an image's, a button's (a link).
# Nothing at all for a value the entry has not, or not of its field's
# type, and on a page with no entry: what is not a template's. A number
# that is the price of the collection the shop sells from, the shop on, is
# written as money in the shop's currency (ShopWords).
#
# An entry is a Hash as SiteContent gives it (and the contract's
# fixtures): its collection's "fields", its "title", "slug" and "values".
module EntryField
  # The key of the entry's own title, which no field of a collection takes.
  TITLE = "title"

  # What is drawn, by the widget it draws as (shape): a heading of its
  # level and its text; a text, as plain paragraphs (each a run of lines),
  # a day and its words, or a rich text's document; an image, the image
  # block's props it takes; a button, its words and its address.
  Drawing = Data.define(:shape, :level, :text, :paragraphs, :day, :words, :doc, :item, :label, :href) do
    def initialize(shape:, level: nil, text: nil, paragraphs: nil, day: nil, words: nil, doc: nil, item: nil, label: nil, href: nil)
      super
    end
  end

  module_function

  # A Field block's level, when it names one the schema lists.
  def level(props)
    props["level"].is_a?(Integer) && props["level"].between?(1, 4) ? props["level"] : nil
  end

  # What the block draws with the entry, and the shop for a price, or nil
  # for nothing.
  def drawing(props, entry, shop = nil)
    return nil unless entry.is_a?(Hash) && props["field"].is_a?(String)
    return text_drawing(entry["title"], level(props)) if props["field"] == TITLE

    field = EntryWords.field_of(entry["fields"], props["field"]) or return nil
    value = EntryWords.value_of(entry["values"], field.key)
    case field.type
    when "text" then text_drawing(value, level(props))
    when "paragraph" then value.is_a?(String) ? lines(value) : nil
    when "choice" then value.is_a?(String) && !value.empty? ? Drawing.new(shape: "text", paragraphs: [ value ]) : nil
    when "richText" then value.is_a?(Hash) && value["type"] == "doc" ? Drawing.new(shape: "text", doc: value) : nil
    when "date"
      day = EntryWords.day_of(value)
      day && Drawing.new(shape: "text", day: day, words: EntryWords.day_words(day))
    when "number"
      words = ShopWords.number_or_price(value, field.key, entry["collectionId"], shop)
      words && Drawing.new(shape: "text", paragraphs: [ words ])
    when "toggle" then value == true && !field.label.empty? ? Drawing.new(shape: "text", paragraphs: [ field.label ]) : nil
    when "image"
      return nil unless value.is_a?(Hash) && value["mediaId"].is_a?(String)

      item = value["decorative"] == true ? { "mediaId" => value["mediaId"], "decorative" => true } : { "mediaId" => value["mediaId"], "alt" => value["alt"].is_a?(String) ? value["alt"] : "" }
      Drawing.new(shape: "image", item: item)
    when "link"
      value.is_a?(Hash) ? Drawing.new(shape: "button", label: value["label"].is_a?(String) ? value["label"] : "", href: value["href"]) : nil
    end
  end

  # A text, as a heading of the level the block names, or as a paragraph.
  def text_drawing(value, level)
    return nil unless value.is_a?(String) && !value.empty?

    level ? Drawing.new(shape: "heading", level: level, text: value) : Drawing.new(shape: "text", paragraphs: [ value ])
  end

  # Plain text as paragraphs: one at each empty line, its other line
  # breaks kept within it; nothing for a text of line breaks alone.
  def lines(text)
    paragraphs = text.split(/\n{2,}/).reject(&:empty?)
    paragraphs.empty? ? nil : Drawing.new(shape: "text", paragraphs: paragraphs)
  end
end
