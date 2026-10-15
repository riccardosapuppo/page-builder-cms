# frozen_string_literal: true

module CollectionDocument
  # schema/collection.schema.json, read by json_schemer with the options
  # BlockDocument::Schema reads the page schema with. It is read from its
  # file, so its references to the page schema's definitions (a line of
  # text, a rich text, an image, a link) resolve to the file beside it.
  module Schema
    PATH = Rails.application.config.x.schema_dir.join("collection.schema.json")
    SCHEMER = JSONSchemer.schema(PATH, regexp_resolver: "ecma", format: false)

    # The collection itself, and each definition the rules check a value
    # against, built once.
    DEFINITIONS = ([ "collection" ] + JSON.parse(PATH.read)["$defs"].keys).to_h do |name|
      [ name, name == "collection" ? SCHEMER : SCHEMER.ref("#/$defs/#{name}") ]
    end.freeze

    module_function

    # A value's faults against one definition, as the rules take them:
    # [pointer, keyword, message], the pointer from the value.
    def errors(definition, value)
      schemer = DEFINITIONS.fetch(definition)
      return [] if schemer.valid?(value)

      schemer.validate(value).map { |e| [ e["data_pointer"], BlockDocument::Schema.keyword_of(e), e["error"] ] }
    end
  end
end
