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

  # Keeps the checked answers (FormAnswers) to form, as version of page has
  # it, at the time given.
  def self.record!(page:, version:, form:, answers:, at: Time.current)
    create!(page: page, page_version: version, form_id: form.id, fields: form.fields.map(&:as_stored), answers: answers.stored, created_at: at)
  end
end
