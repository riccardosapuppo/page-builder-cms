# frozen_string_literal: true

# The checks a page document must pass before it is stored, in the order the
# server runs them:
#
#   1. the application rules of lib/block_document/rules.rb, the twin of the
#      editor's rules.ts: well-formed strings, finite numbers, exact
#      integers, unique block ids, nesting depth;
#   2. the schema, schema/block-document.schema.json, the file the editor
#      validates with too (BlockDocument::Schema);
#   3. normalisation: 2.0 becomes 2.
#
# It lives in app/models, not in a controller, because none of it is about
# HTTP: the API, a job or a console hands it a document that has already
# been parsed (the request body is parsed by Api::JsonBody, which refuses
# duplicate member names before anything here runs) and gets back either
# the normalised document or errors with JSON pointers.
#
# Documents are also upgraded to the current schemaVersion when they are
# read and restored (BlockDocument::Upgrade).
module BlockDocument
  # One problem in a document. pointer is a JSON pointer to the value;
  # block_pointer is that pointer cut back to the block that holds the value
  # (a section, a column or a widget), so the editor can mark the block, or
  # nil when the value is outside any block, like the page title.
  Error = Data.define(:pointer, :keyword, :block_pointer, :message) do
    def self.at(pointer, keyword, message)
      new(pointer: pointer, keyword: keyword, block_pointer: BlockDocument.block_pointer(pointer), message: message)
    end

    # The same error seen from a body that holds the document under prefix,
    # such as "/document" in a draft save.
    def under(prefix)
      with(pointer: "#{prefix}#{pointer}", block_pointer: block_pointer && "#{prefix}#{block_pointer}")
    end

    def as_json(*)
      { "pointer" => pointer, "keyword" => keyword, "blockPointer" => block_pointer, "message" => message }
    end
  end

  Result = Data.define(:document, :errors) do
    def ok? = errors.empty?
  end

  # Raised where a document must be refused in the middle of a write; the
  # transaction rolls back and the API answers 422 with the errors.
  class Invalid < StandardError
    attr_reader :errors

    def initialize(errors)
      @errors = errors
      super("The document is not valid: #{errors.map { |e| "#{e.keyword} at #{e.pointer.inspect}" }.join(', ')}")
    end
  end

  # A block sits at /sections/n, a column at /sections/n/children/n and a
  # widget one level further down. Anything deeper is inside a block.
  BLOCK_POINTER = %r{\A/sections/\d+(?:/children/\d+)*(?=/|\z)}

  module_function

  def check(document)
    rule_errors = Rules.check_tree(document)
    unless rule_errors.empty?
      return Result.new(document: nil, errors: rule_errors.map { |e| Error.at(e.pointer, e.keyword, e.message) })
    end

    schema_errors = Schema.errors(document)
    return Result.new(document: nil, errors: schema_errors) unless schema_errors.empty?

    Result.new(document: Rules.normalize(document), errors: [])
  end

  def block_pointer(pointer)
    pointer[BLOCK_POINTER]
  end

  # Every place the document names a media library item, as [pointer, id]
  # pairs. Only images name one ({"mediaId": ...} in an image block and in
  # each gallery item), but the walk does not depend on that: any member
  # called mediaId counts, so a widget added later is indexed without a
  # change here.
  def media_refs(document)
    refs = []
    stack = [ [ document, "" ] ]
    until stack.empty?
      value, pointer = stack.pop
      case value
      when Hash
        value.each do |key, child|
          child_pointer = "#{pointer}/#{Rules.escape_pointer(key)}"
          if key == "mediaId" && child.is_a?(String)
            refs << [ child_pointer, child ]
          else
            stack << [ child, child_pointer ]
          end
        end
      when Array
        value.each_with_index { |child, k| stack << [ child, "#{pointer}/#{k}" ] }
      end
    end
    refs.sort_by(&:first)
  end
end
