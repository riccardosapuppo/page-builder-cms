require "test_helper"

class Api::JsonBodyTest < ActiveSupport::TestCase
  def duplicate_at(text)
    Api::JsonBody.parse(text.b)
    flunk "#{text} was accepted"
  rescue Api::JsonBody::DuplicateKey => e
    e.pointer
  end

  test "a body without repeated names is read as it is" do
    assert_equal({ "a" => [ 1, { "b" => "c" } ] }, Api::JsonBody.parse(%({"a": [1, {"b": "c"}]}).b))
  end

  test "a repeated name is found wherever it is, and pointed at" do
    assert_equal "/a", duplicate_at(%({"a": 1, "a": 2}))
    assert_equal "/document/sections/0/id", duplicate_at(%({"document": {"sections": [{"id": "a", "id": "b"}]}}))
    assert_equal "/x/1/k", duplicate_at(%({"x": [1, {"k": 1, "k": 2}]}))
  end

  test "a name written with an escape is the same name" do
    assert_equal "/a", duplicate_at(%({"a": 1, "\\u0061": 2}))
  end

  test "names that need escaping in a pointer, or that a path writes in brackets, come back exact" do
    assert_equal "/x/a~1b~0", duplicate_at(%({"x": {"a/b~": 1, "a/b~": 2}}))
    assert_equal "/x/a\"b", duplicate_at(%({"x": {"a\\"b": 1, "a\\"b": 2}}))
    assert_equal "/x/a\\b", duplicate_at(%({"x": {"a\\\\b": 1, "a\\\\b": 2}}))
    assert_equal "/x/", duplicate_at(%({"x": {"": 1, "": 2}}))
    assert_equal "/x/0", duplicate_at(%({"x": {"0": 1, "0": 2}}))
    assert_equal "/x/café", duplicate_at(%({"x": {"café": 1, "café": 2}}))
    assert_equal "/x/a.b/c", duplicate_at(%({"x": {"a.b": {"c": 1, "c": 2}}}))
    assert_equal "/x/a]\"[", duplicate_at(%({"x": {"a]\\"[": 1, "a]\\"[": 2}}))
  end

  test "a JSON path names an index and a numeric name differently" do
    assert_equal "/x/0", Api::JsonBody.pointer_from_json_path("$.x[0]")
    assert_equal "/x/0", Api::JsonBody.pointer_from_json_path(%($.x["0"]))
    assert_equal "", Api::JsonBody.pointer_from_json_path("$")
    assert_raises(ArgumentError) { Api::JsonBody.pointer_from_json_path("x.a") }
    assert_raises(ArgumentError) { Api::JsonBody.pointer_from_json_path(%($.x["open)) }
  end

  test "anything else that is not JSON is malformed, not a duplicate" do
    [ %({"a": 1,), %({"a": 1} x), "", %({"a": "\\ud83d"}), %({"a": 1 /* c */}), %({"a": 1,}) ].each do |text|
      assert_raises(Api::JsonBody::Malformed, text) { Api::JsonBody.parse(text.b) }
    end
  end

  test "bytes that are not UTF-8 are malformed" do
    assert_raises(Api::JsonBody::Malformed) { Api::JsonBody.parse(%({"a": "\xFF"}).b) }
  end

  test "an optional body may be empty" do
    assert_equal({}, Api::JsonBody.parse("".b, optional: true))
  end
end
