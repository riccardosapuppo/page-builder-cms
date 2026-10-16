require "test_helper"

# A day and a number in the site's words, as a page writes them: the twin
# of builder/src/render/entry-words.ts, whose unit test asks the same, and
# which the render contract holds to this.
class EntryWordsTest < ActiveSupport::TestCase
  test "a day is written as the site writes one: the day, the month's name, the year" do
    assert_equal [ "15 October 2026", "1 January 2026", "29 February 2024", "1 November 2026", "31 December 99" ],
                 %w[2026-10-15 2026-01-01 2024-02-29 2026-11-01 0099-12-31].map { |day| EntryWords.day_words(day) }
  end

  test "a number is written with its thousands grouped and no zero ending its decimals; one no number field keeps is not written" do
    assert_equal [ "1,250.5", "1,000,000,000", "-1,000,000,000", "-2.25", "0.05", "3", "0", "12.1", "999.99" ],
                 [ 1250.5, 1_000_000_000, -1_000_000_000, -2.25, 0.05, 3, -0, 12.1, 999.99 ].map { |value| EntryWords.number_words(value) }
    assert_equal [ nil, nil, nil, nil ], [ 0.125, 1_000_000_000.01, "12", true ].map { |value| EntryWords.number_words(value) }
  end
end
