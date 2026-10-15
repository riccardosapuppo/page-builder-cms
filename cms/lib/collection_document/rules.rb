# frozen_string_literal: true

# The rules of a collection and of its entries that the collection's
# schema (schema/collection.schema.json) cannot say, and the order the
# rules and the schema run in. schema/tools/collection-rules.ts is the same
# code in TypeScript, rule for rule and pointer for pointer; the comparator
# in schema/tools runs both over the collection corpus
# (schema/collection-corpus) and fails if they ever answer differently.
#
# Plain Ruby with no Rails dependency, so a script can require it alone,
# after lib/block_document/rules.rb, whose pointers and decimals it reads.
# The schema's engine is the caller's (json_schemer, CollectionDocument::
# Schema in the app), handed in as a callable: given the name of a
# definition ("collection" for the collection itself, else a name of the
# schema's $defs) and a value, it answers the value's faults as
# [pointer, keyword, message] from the value.
#
# The pipeline, the same on both sides, after BlockDocument::Rules
# .parse_json or .check_json (the rules any JSON value is held to, then
# 2.0 made 2):
#   a collection: its own rules (field keys unique, "uniqueKey"; a
#     choice's options unique, "uniqueOption"; a number field's lowest and
#     highest values with two decimals at most, "decimals", and the lowest
#     not above the highest, "range"; a sort by a date or number field of
#     the collection, "sortField"), then the schema;
#   an entry, against a collection that passed: its own rules (a value
#     under a key no field has, "unknownField"; none for a required field,
#     "required"; and each value by its field: a number with two decimals
#     at most, "decimals", not below the field's lowest, "minimum", nor
#     above its highest, "maximum"; a day that exists, "dateExists"; a
#     choice among the field's options, "enum"), then the schema on the
#     entry and on each value, by its field's type.
# Every error of both is answered together: what the rules guard is what
# a value means, not the engines, and a person filling in an entry should
# see every fault at once. Each reads only a value of the shape it
# expects and leaves the rest to the schema.
module CollectionDocument
  module Rules
    FIELD_TYPES = %w[text paragraph richText number date image link toggle choice].freeze
    # What a collection's entries may be ordered by besides a field.
    SORT_BUILT_INS = %w[title updatedAt publishedAt].freeze
    # The types of field an order may follow.
    SORTABLE_TYPES = %w[date number].freeze

    # The definition of collection.schema.json a value of each type of
    # field is checked against.
    VALUE_DEFS = {
      "text" => "textValue", "paragraph" => "paragraphValue", "richText" => "richTextValue",
      "number" => "numberValue", "date" => "dateValue", "image" => "imageValue",
      "link" => "linkValue", "toggle" => "toggleValue", "choice" => "choiceValue"
    }.freeze

    # The schema's own limits, which the rules read so that each looks only
    # at a value the schema takes.
    NUMBER_LIMIT = 1_000_000_000
    DAY = /\A([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])\z/
    SORT_KEY = /\A(?:title|updatedAt|publishedAt|[a-z][a-z0-9-]{0,63})\z/

    # One fault, at a JSON pointer into the collection or the entry checked;
    # layer says whether a rule found it or the schema.
    Error = Data.define(:pointer, :keyword, :message, :layer)

    module_function

    def number?(value)
      (value.is_a?(Integer) || (value.is_a?(Float) && value.finite?)) && value.between?(-NUMBER_LIMIT, NUMBER_LIMIT)
    end

    # Whether a day of the proleptic Gregorian calendar exists, as the
    # pattern's year, month and day. Worked out here rather than asked of
    # Date, whose calendar starts in 1582 and has no 10 October that year.
    def day_exists?(text)
      found = DAY.match(text) or return false
      year, month, day = found.captures.map { |part| Integer(part, 10) }
      leap = ((year % 4).zero? && !(year % 100).zero?) || (year % 400).zero?
      days =
        case month
        when 2 then leap ? 29 : 28
        when 4, 6, 9, 11 then 30
        else 31
        end
      day <= days
    end

    def rule(pointer, keyword, message)
      Error.new(pointer: pointer, keyword: keyword, message: message, layer: "rules")
    end

    def found(errors, prefix)
      errors.map { |pointer, keyword, message| Error.new(pointer: "#{prefix}#{pointer}", keyword: keyword, message: message, layer: "schema") }
    end

    # A collection's faults, its rules' and then its schema's, at pointers
    # into the collection.
    def check_collection(collection, schema)
      errors = []
      fields = collection.is_a?(Hash) && collection["fields"].is_a?(Array) ? collection["fields"] : []
      keys = {}
      fields.each_with_index do |field, k|
        next unless field.is_a?(Hash)

        at = "/fields/#{k}"
        key = field["key"]
        if key.is_a?(String)
          if keys.key?(key)
            errors << rule("#{at}/key", "uniqueKey", "The key \"#{key}\" is already another field's.")
          else
            keys[key] = true
          end
        end
        if field["type"] == "choice" && field["options"].is_a?(Array)
          options = {}
          field["options"].each_with_index do |option, j|
            next unless option.is_a?(String)

            if options.key?(option)
              errors << rule("#{at}/options/#{j}", "uniqueOption", "The option \"#{option}\" is already one of this field's.")
            else
              options[option] = true
            end
          end
        end
        next unless field["type"] == "number"

        %w[min max].each do |end_name|
          value = field[end_name]
          errors << rule("#{at}/#{end_name}", "decimals", "Two decimals at most.") if number?(value) && !BlockDocument::Rules.two_decimals?(value)
        end
        if number?(field["min"]) && number?(field["max"]) && field["min"] > field["max"]
          errors << rule("#{at}/max", "range", "The highest value is below the lowest.")
        end
      end
      sort = collection["sort"] if collection.is_a?(Hash)
      by = sort["by"] if sort.is_a?(Hash)
      if by.is_a?(String) && SORT_KEY.match?(by) && !SORT_BUILT_INS.include?(by)
        sortable = fields.any? { |field| field.is_a?(Hash) && field["key"] == by && SORTABLE_TYPES.include?(field["type"]) }
        errors << rule("/sort/by", "sortField", "The collection has no date or number field \"#{by}\".") unless sortable
      end
      errors + found(schema.call("collection", collection), "")
    end

    # An entry's faults against its collection, which passed
    # check_collection: the rules', then the schema's on the entry and on
    # each value by its field's type, at pointers into the entry.
    def check_entry(collection, entry, schema)
      fields = collection.is_a?(Hash) && collection["fields"].is_a?(Array) ? collection["fields"] : []
      values = entry["values"] if entry.is_a?(Hash) && entry["values"].is_a?(Hash)
      errors = []
      if values
        known = fields.to_h { |field| [ field["key"], true ] }
        values.each_key do |key|
          errors << rule("/values/#{BlockDocument::Rules.escape_pointer(key)}", "unknownField", "The collection has no field \"#{key}\".") unless known.key?(key)
        end
        fields.each do |field|
          at = "/values/#{BlockDocument::Rules.escape_pointer(field['key'])}"
          unless values.key?(field["key"])
            errors << rule(at, "required", "is required") if field["required"]
            next
          end
          value = values[field["key"]]
          if field["type"] == "number" && number?(value)
            errors << rule(at, "decimals", "Two decimals at most.") unless BlockDocument::Rules.two_decimals?(value)
            errors << rule(at, "minimum", "must be at least #{field['min']}") if field.key?("min") && value < field["min"]
            errors << rule(at, "maximum", "must be at most #{field['max']}") if field.key?("max") && value > field["max"]
          elsif field["type"] == "date" && value.is_a?(String) && DAY.match?(value) && !day_exists?(value)
            errors << rule(at, "dateExists", "is not a day that exists")
          elsif field["type"] == "choice" && value.is_a?(String) && !Array(field["options"]).include?(value)
            errors << rule(at, "enum", "must be one of the field's options")
          end
        end
      end
      errors.concat(found(schema.call("entry", entry), ""))
      fields.each do |field|
        next unless values&.key?(field["key"])

        errors.concat(found(schema.call(VALUE_DEFS.fetch(field["type"]), values[field["key"]]), "/values/#{BlockDocument::Rules.escape_pointer(field['key'])}"))
      end
      errors
    end
  end
end
