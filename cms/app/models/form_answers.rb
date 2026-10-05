# frozen_string_literal: true

# A visitor's answers to a form, read from the request's answers[<field
# name>] and checked against the form's fields (FormBlock), with the limits
# the browser already held them to: the server checks again, since a
# request need not come from a browser, and the form may have changed
# since the page was loaded.
#
# Per field, the first rule an answer breaks gives its message:
# - a field that must be filled in has more than spaces, a box that must
#   be ticked is ticked;
# - a line of text and an email address hold no line break, and no answer
#   holds another control character (a tab is kept);
# - at most the field's limit, in characters as the schema counts them,
#   code points, after the line breaks of a longer text are made single
#   (a browser sends CR LF and counts one);
# - an email address has the shape a browser's own check accepts.
#
# Answers to names the form does not have are left out: a page loaded
# before the form lost a field sends one. What no browser sends from this
# form's markup (answers that are not a list of names, a text that is not
# a string, a ticked box that is not "yes") is Unreadable.
class FormAnswers
  class Unreadable < StandardError; end

  FILL = "Fill in this field."
  EMAIL = "Enter an email address, like name@example.org."
  TICK = "Tick this box to send the form."
  ONE_LINE = "Write this answer on one line."
  CONTROL = "Remove the control characters from this answer."
  TOO_LONG = "Use at most %<most>d characters; this answer has %<has>d."

  # A valid email address as HTML defines it for <input type=email>.
  EMAIL_SHAPE = /\A[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\z/

  # What the form is drawn again with (the text, or true for a ticked box),
  # what is kept (every field: its text, "" when left empty, or whether the
  # box was ticked), and a message per field refused, by field name.
  attr_reader :values, :stored, :errors

  # raw: the answers by field name, a Hash, or nil when none came.
  def initialize(fields, raw)
    raw = {} if raw.nil?
    raise Unreadable, "answers are not a list of names" unless raw.is_a?(Hash)

    @values = {}
    @stored = {}
    @errors = {}
    fields.each { |field| field.kind == "checkbox" ? read_box(field, raw[field.name]) : read_text(field, raw[field.name]) }
  end

  def valid?
    errors.empty?
  end

  private

  def read_box(field, answer)
    raise Unreadable, "#{field.name}: a ticked box is sent as \"yes\"" unless answer.nil? || answer == "yes"

    ticked = answer == "yes"
    values[field.name] = true if ticked
    stored[field.name] = ticked
    errors[field.name] = TICK if field.required && !ticked
  end

  def read_text(field, answer)
    raise Unreadable, "#{field.name}: an answer is a string" unless answer.nil? || answer.is_a?(String)

    text = answer.to_s
    text = text.gsub(/\r\n?/, "\n") if field.kind == "textarea"
    # As a browser cleans an email field's value before it checks it.
    text = text.gsub(/\A[\t\n\f\r ]+|[\t\n\f\r ]+\z/, "") if field.kind == "email"
    values[field.name] = text
    stored[field.name] = text
    error = refusal(field, text)
    errors[field.name] = error if error
  end

  def refusal(field, text)
    if text.match?(/\A[[:space:]]*\z/)
      return nil unless field.required

      return field.kind == "email" ? EMAIL : FILL
    end
    return ONE_LINE if field.kind != "textarea" && text.match?(/[\r\n]/)
    return CONTROL if text.match?(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/)
    return format(TOO_LONG, most: field.max_length, has: text.length) if text.length > field.max_length
    return EMAIL if field.kind == "email" && !text.match?(EMAIL_SHAPE)

    nil
  end
end
