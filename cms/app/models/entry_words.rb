# frozen_string_literal: true

# An entry's values as a page reads and writes them, for the two blocks
# that draw entries (CollectionList, EntryField): a collection's field by
# its key, a value by its key, a day and a number in the site's words. The
# twin of builder/src/render/entry-words.ts, held to it by the render
# contract.
#
# Everything is read defensively, as a block is: what the database holds
# was checked against its collection's fields when it was saved, but a
# field may have changed its type since, and a fixture of the contract
# holds what no check would let through.
module EntryWords
  # A field as the renderers need it: its key, its label and its type.
  Field = Data.define(:key, :label, :type)

  MONTHS = %w[January February March April May June July August September October November December].freeze

  module_function

  # The field of fields whose key is key, the first one with it; nil when
  # there is none, or when that one's type is none of the list.
  def field_of(fields, key)
    return nil unless fields.is_a?(Array) && key.is_a?(String)

    field = fields.find { |one| one.is_a?(Hash) && one["key"] == key }
    return nil unless field.is_a?(Hash) && CollectionDocument::Rules::FIELD_TYPES.include?(field["type"])

    Field.new(key: key, label: field["label"].is_a?(String) ? field["label"] : "", type: field["type"])
  end

  # An entry's value under a key; nil for none.
  def value_of(values, key)
    values.is_a?(Hash) ? values[key] : nil
  end

  # A day as an entry keeps it, YYYY-MM-DD, when that day exists; nil for
  # any other value.
  def day_of(value)
    value.is_a?(String) && CollectionDocument::Rules.day_exists?(value) ? value : nil
  end

  # A day as the site writes it, in the editor's words for one: the day,
  # the month's name and the year, "15 October 2026", with no comma, the
  # day itself whatever the reader's zone.
  def day_words(day)
    year, month, date = day.split("-").map { |part| Integer(part, 10) }
    "#{date} #{MONTHS[month - 1]} #{year}"
  end

  # A number as the site writes it, as the editor's list of entries does:
  # "1,250.5", "-3", "0.05"; nil for what no number field keeps (beyond a
  # billion either way, more than two decimals), which is not drawn.
  def number_words(value)
    return nil unless CollectionDocument::Rules.number?(value) && BlockDocument::Rules.two_decimals?(value)

    text = BlockDocument::Rules.hundredths_text((value * 100).round)
    text.sub(/\A(-?)([0-9]+)/) { "#{::Regexp.last_match(1)}#{::Regexp.last_match(2).reverse.scan(/[0-9]{1,3}/).join(',').reverse}" }
  end
end
