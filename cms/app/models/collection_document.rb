# frozen_string_literal: true

# The checks a collection's definition and an entry of it must pass before
# they are stored, as BlockDocument's are a page's, in the order both sides
# run them:
#
#   1. the rules any JSON value is held to, and 2.0 made 2
#      (BlockDocument::Rules.check_json, the twin of rules.ts's checkJson);
#   2. the collection's rules and its schema, schema/collection.schema.json,
#      every fault of both together (lib/collection_document/rules.rb, the
#      twin of the editor's collection-rules.ts, with
#      CollectionDocument::Schema): a definition alone, or an entry against
#      its collection's definition.
#
# A fault is a BlockDocument::Error with no block: its pointer goes into
# the definition or the entry ("/fields/0/key", "/values/day"), which the
# API's bodies name the same way. Whether an image an entry names is in the
# media library is MediaUsage's to say, as for a page.
module CollectionDocument
  # Raised where a definition or an entry must be refused in the middle of
  # a write; the transaction rolls back and the API answers 422 with the
  # errors, at their pointers.
  class Invalid < StandardError
    attr_reader :errors

    def initialize(errors)
      @errors = errors
      super("The collection or entry is not valid: #{errors.map { |e| "#{e.keyword} at #{e.pointer.inspect}" }.join(', ')}")
    end
  end

  module_function

  # The definition checked and normalised, as a BlockDocument::Result.
  def check_collection(definition)
    checked(definition) { |value| Rules.check_collection(value, Schema.method(:errors)) }
  end

  # The entry ({title, slug, values}) checked against a definition that
  # passed check_collection, normalised.
  def check_entry(definition, entry)
    checked(entry) { |value| Rules.check_entry(definition, value, Schema.method(:errors)) }
  end

  def check_collection!(definition)
    result = check_collection(definition)
    raise Invalid, result.errors unless result.ok?

    result.document
  end

  def check_entry!(definition, entry)
    result = check_entry(definition, entry)
    raise Invalid, result.errors unless result.ok?

    result.document
  end

  # The JSON rules, then the block's: each fault once, by pointer and
  # keyword, the first said.
  def checked(value)
    json = BlockDocument::Rules.check_json(value)
    errors = json.ok? ? yield(json.document) : json.errors
    return BlockDocument::Result.new(document: json.document, errors: []) if errors.empty?

    found = errors.map { |e| BlockDocument::Error.new(pointer: e.pointer, keyword: e.keyword, block_pointer: nil, message: e.message) }
    BlockDocument::Result.new(document: nil, errors: found.uniq { |e| [ e.pointer, e.keyword ] })
  end
end
