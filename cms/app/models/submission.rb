# frozen_string_literal: true

# The answers a visitor sent with a form of a published page, kept with
# the published version the form was read from and a copy of the form's
# fields as that version had them (FormBlock::Field#as_stored), so an
# answer reads the same after the form changes in a later version. answers
# holds every field by name: its text ("" when left empty), or whether the
# box was ticked.
class Submission < ApplicationRecord
  belongs_to :page
  belongs_to :page_version

  # The most characters an excerpt keeps, counted as a reader sees them
  # (grapheme clusters), so no letter is cut from its accent and no emoji
  # in two.
  EXCERPT_LENGTH = 120
  TEXT_KINDS = %w[text email textarea].freeze

  # Keeps the checked answers (FormAnswers) to form, as version of page has
  # it, at the time given.
  def self.record!(page:, version:, form:, answers:, at: Time.current)
    create!(page: page, page_version: version, form_id: form.id, fields: form.fields.map(&:as_stored), answers: answers.stored, created_at: at)
  end

  # What a list of answers shows of this one, so the owner can tell them
  # apart without opening each: the first text answer that is not empty,
  # with its field's label, on one line (any run of spaces, tabs and line
  # breaks becomes one space) and cut at EXCERPT_LENGTH. truncated says
  # whether it was cut. nil when every text answer is empty or the form has
  # only checkboxes.
  def excerpt
    fields.each do |field|
      next unless TEXT_KINDS.include?(field["kind"])

      line = answers[field["name"]].to_s.squish
      next if line.empty?

      letters = line.grapheme_clusters
      return { "label" => field["label"], "text" => letters.first(EXCERPT_LENGTH).join, "truncated" => letters.length > EXCERPT_LENGTH }
    end
    nil
  end
end
