# frozen_string_literal: true

module BlockDocument
  # schema/block-document.schema.json, read by json_schemer with the options
  # the comparator in schema/tools holds both validators to: ECMA-262
  # regular expressions (with Ruby's own, ^ and $ would match at a line
  # break inside a value) and no format checks (the patterns are the
  # contract).
  module Schema
    PATH = Rails.application.config.x.schema_dir.join("block-document.schema.json")

    # Built once, when this file loads: a Pathname makes json_schemer read
    # the file and resolve it from its own location.
    SCHEMER = JSONSchemer.schema(PATH, regexp_resolver: "ecma", format: false)

    # json_schemer's classic output names an error by its keyword, except
    # for type, where it gives the type it expected instead. Same reading
    # as schema/tools/validate.rb, so the keywords here are the ones the
    # comparator checks against ajv's.
    JSON_TYPES = %w[null boolean object array number string integer].freeze

    # The schema's single line of plain text, for the few texts the server
    # stores outside a document (a version's name, a media item's alt text):
    # the same rule as a title, so nothing reaches a page that a document
    # could not hold.
    LINE = SCHEMER.ref("#/$defs/line")


    module_function

    def line?(text, max:)
      text.is_a?(String) && text.length <= max && LINE.valid?(text)
    end

    # valid? first: it stops at the first failure, while collecting every
    # error walks the whole document, which is only worth it when there is
    # something to report.
    def errors(document)
      errors_of(SCHEMER, document)
    end

    def errors_of(schemer, value)
      return [] if schemer.valid?(value)

      schemer.validate(value).map { |e| Error.at(e["data_pointer"], keyword_of(e), e["error"]) }
             .uniq { |e| [ e.pointer, e.keyword ] }
    end

    def keyword_of(error)
      type = error["type"]
      return "type" if JSON_TYPES.include?(type)
      return error["schema_pointer"].split("/").last if type == "schema"

      type
    end
  end
end
