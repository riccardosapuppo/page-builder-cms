# frozen_string_literal: true

# The order of a collection's entries, by one value of each: the list the
# API answers (Api::EntriesController) and a Collection list on a page
# (CollectionList) put entries in the same order. The twin of
# builder/src/shared/entry-order.ts.
module EntryOrder
  module_function

  # items by the value the block gives each, the ones without one (nil)
  # last; each run of one value by id; reversed, those without a value
  # apart, for a descending order. Strings compare byte by byte, which for
  # UTF-8 is code point by code point; the values of one key are all text
  # or all numbers. id gives an item's id.
  def ordered(items, descending:, id: :id.to_proc, &value)
    valued, valueless = items.partition { |item| !value.call(item).nil? }
    sorted = valued.sort_by { |item| [ value.call(item), id.call(item) ] }
    rest = valueless.sort_by { |item| id.call(item) }
    descending ? sorted.reverse + rest.reverse : sorted + rest
  end
end
