require "test_helper"

# A visitor's answers checked against a form's fields: the rules each kind
# of field holds an answer to, in the order they are told, and what no
# browser sends from the form's markup.
class FormAnswersTest < ActiveSupport::TestCase
  Field = FormBlock::Field

  TEXT = Field.new(name: "name", kind: "text", label: "Name", required: true, max_length: 20)
  EMAIL = Field.new(name: "email", kind: "email", label: "Email", required: false, max_length: 254)
  NOTES = Field.new(name: "notes", kind: "textarea", label: "Notes", required: false, max_length: 10)
  BOX = Field.new(name: "box", kind: "checkbox", label: "Box", required: false, max_length: nil)

  def errors(field, answer)
    FormAnswers.new([ field ], { field.name => answer }).errors[field.name]
  end

  test "a field that must be filled in is refused with only spaces, of any kind, and one that need not be takes nothing" do
    [ nil, "", "   ", "\t", "  " ].each { |blank| assert_equal FormAnswers::FILL, errors(TEXT, blank), blank.inspect }
    assert_equal FormAnswers::EMAIL, errors(EMAIL.with(required: true), "")
    assert_equal FormAnswers::TICK, errors(BOX.with(required: true), nil)
    assert_nil errors(EMAIL, "")
    assert_nil errors(NOTES, nil)
    assert_nil errors(BOX, nil)
  end

  test "a line holds no line break, and no answer holds another control character; a longer text keeps its line breaks and tabs" do
    assert_equal FormAnswers::ONE_LINE, errors(TEXT, "Ann\nDiver")
    assert_equal FormAnswers::ONE_LINE, errors(TEXT, "Ann\rDiver")
    assert_equal FormAnswers::CONTROL, errors(TEXT, "Ann\u0000")
    assert_equal FormAnswers::CONTROL, errors(NOTES, "a\u001bb")
    assert_equal FormAnswers::CONTROL, errors(NOTES, "a\u0085b")
    assert_nil errors(TEXT, "Ann\tDiver")
    assert_nil errors(NOTES, "a\r\nb\tc")
  end

  test "length is counted in code points, after CR LF and a lone CR are made one line break" do
    assert_nil errors(TEXT, "\u{1F30A}" * 20)
    assert_equal "Use at most 20 characters; this answer has 21.", errors(TEXT, "\u{1F30A}" * 21)
    assert_nil errors(NOTES, "a\r\nb\rc\nd\r\nef")
    answers = FormAnswers.new([ NOTES ], { "notes" => "a\r\nb\rc" })
    assert_equal "a\nb\nc", answers.stored["notes"]
    assert_equal "Use at most 10 characters; this answer has 11.", errors(NOTES, "abcde\r\nfghij")
  end

  test "an email address has the shape a browser's own check accepts, around the spaces a browser trims" do
    [ "ann@example.org", "a.b+c@sub.example.co", "x@localhost", "  ann@example.org\n" ].each { |good| assert_nil errors(EMAIL, good), good }
    [ "ann", "ann@", "@example.org", "ann@exa mple.org", "ann@@example.org", "ann@-example.org", "ann@example..org", "ann@#{'a' * 64}.org" ].each do |bad|
      assert_equal FormAnswers::EMAIL, errors(EMAIL, bad), bad
    end
    assert_equal "ann@example.org", FormAnswers.new([ EMAIL ], { "email" => " ann@example.org " }).stored["email"]
    assert_equal format(FormAnswers::TOO_LONG, most: 254, has: 255), errors(EMAIL, "#{'a' * 64}@#{'b' * 63}.#{'b' * 63}.#{'b' * 62}")
  end

  test "every field is kept, the empty ones too, and the values drawn again are what was written" do
    answers = FormAnswers.new([ TEXT, EMAIL, NOTES, BOX ], { "name" => "Ann", "box" => "yes", "extra" => "not a field" })

    assert answers.valid?
    assert_equal({ "name" => "Ann", "email" => "", "notes" => "", "box" => true }, answers.stored)
    assert_equal({ "name" => "Ann", "email" => "", "notes" => "", "box" => true }, answers.values)
    assert_equal({ "box" => false }, FormAnswers.new([ BOX ], {}).stored)
    assert_equal({}, FormAnswers.new([ BOX ], nil).values)
  end

  test "what no browser sends from the form is unreadable" do
    [ "Ann", [ "Ann" ], 1 ].each do |raw|
      assert_raises(FormAnswers::Unreadable, raw.inspect) { FormAnswers.new([ TEXT ], raw) }
    end
    [ [ TEXT, [ "Ann" ] ], [ TEXT, { "first" => "Ann" } ], [ BOX, "on" ], [ BOX, "" ], [ BOX, [ "yes" ] ] ].each do |field, answer|
      assert_raises(FormAnswers::Unreadable, answer.inspect) { FormAnswers.new([ field ], { field.name => answer }) }
    end
  end
end
