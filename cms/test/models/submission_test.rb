require "test_helper"

# What a kept answer holds, and that it is not lost with its page.
class SubmissionTest < ActiveSupport::TestCase
  include ApiRequests

  ITEMS = [
    { "name" => "name", "kind" => "text", "label" => "Name", "required" => true, "maxLength" => 100.0 },
    { "name" => "email", "kind" => "email", "label" => "Email", "required" => false },
    { "name" => "box", "kind" => "checkbox", "label" => "Box", "required" => false }
  ].freeze

  def published_form
    page = create_page(title: "Join", slug: "join")
    form = { "id" => "join-form", "type" => "form", "props" => { "items" => ITEMS, "submitLabel" => "Send", "confirmation" => "Thanks." }, "style" => { "base" => {} }, "children" => [] }
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: "Join", widgets: [ form ]), save_id: "first")
    page.publish!
    page.reload
  end

  test "an answer keeps its page, the published version, and the form's fields in the schema's own shape, at the time given" do
    page = published_form
    form = FormBlock.find(page.published_version.document, "join-form")
    answers = FormAnswers.new(form.fields, { "name" => "Ann", "box" => "yes" })
    at = Time.utc(2026, 10, 5, 9, 30)

    kept = Submission.record!(page: page, version: page.published_version, form: form, answers: answers, at: at).reload

    assert_equal [ page, page.published_version, "join-form", at ], [ kept.page, kept.page_version, kept.form_id, kept.created_at ]
    assert_equal [ ITEMS[0].merge("maxLength" => 100), ITEMS[1], ITEMS[2] ], kept.fields
    assert_equal({ "name" => "Ann", "email" => "", "box" => true }, kept.answers)
  end

  test "a page with answers is not destroyed with them" do
    page = published_form
    form = FormBlock.find(page.published_version.document, "join-form")
    Submission.record!(page: page, version: page.published_version, form: form, answers: FormAnswers.new(form.fields, { "name" => "Ann" }))

    assert_raises(ActiveRecord::DeleteRestrictionError) { page.destroy }
    assert_equal 1, Submission.where(page: page).count
  end

  def excerpt_of(answers, fields: ITEMS + [ { "name" => "notes", "kind" => "textarea", "label" => "Notes", "required" => false, "maxLength" => 5000 } ])
    Submission.new(fields: fields, answers: answers).excerpt
  end

  test "the excerpt is the first text answer with more than white space, on one line, with its field's label" do
    assert_equal({ "label" => "Name", "text" => "Ann", "truncated" => false }, excerpt_of({ "name" => "Ann", "email" => "a@example.org", "box" => true }))
    assert_equal({ "label" => "Email", "text" => "a@example.org", "truncated" => false }, excerpt_of({ "name" => " \t ", "email" => "a@example.org", "box" => true }))
    assert_equal({ "label" => "Notes", "text" => "Cold water is fine", "truncated" => false },
                 excerpt_of({ "name" => "", "email" => "", "box" => true, "notes" => "\n Cold\n\n\twater  is fine\n" }))
  end

  test "an answer with only a ticked box, or none at all, has no excerpt" do
    assert_nil excerpt_of({ "name" => "", "email" => "", "box" => true, "notes" => "" })
    assert_nil excerpt_of({ "box" => true }, fields: [ ITEMS[2] ])
  end

  test "a long answer is cut at 120 characters as a reader counts them, never inside one, and says it was cut" do
    accent = "é" # one letter, two code points
    family = "\u{1F468}‍\u{1F469}‍\u{1F467}" # one emoji, five code points
    exact = "a" * 119 + accent

    assert_equal({ "label" => "Notes", "text" => exact, "truncated" => false }, excerpt_of({ "notes" => exact }))
    assert_equal({ "label" => "Notes", "text" => exact, "truncated" => true }, excerpt_of({ "notes" => exact + "b" }))
    assert_equal("a" * 119 + family, excerpt_of({ "notes" => "a" * 119 + family + family })["text"])
  end
end
