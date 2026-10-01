# frozen_string_literal: true

module Api
  # Checks the members of a request body around the document: their names,
  # types and ranges, as cms/openapi.yaml describes them. Every problem is
  # collected with its pointer and the keyword JSON Schema would use, then
  # finish! raises them all at once, so a client sees every fault in one
  # answer.
  class BodyCheck
    class Failed < StandardError
      attr_reader :errors

      def initialize(errors)
        @errors = errors
        super("The request has #{errors.size} problem(s).")
      end
    end

    attr_reader :body

    # prefix: where this object sits in the body, "" for the body itself.
    def initialize(body, allowed:, prefix: "")
      @body = body
      @prefix = prefix
      @errors = []
      unless body.is_a?(Hash)
        fail_at("", "type", "must be a JSON object")
        raise Failed, @errors
      end

      (body.keys - allowed).each { |name| fail_at("/#{BlockDocument::Rules.escape_pointer(name)}", "additionalProperties", "is not a member this request takes") }
    end

    def required(name)
      fail_at("/#{name}", "required", "is required") unless body.key?(name)
      body.key?(name)
    end

    def integer(name, required: false, minimum: nil, maximum: nil)
      return unless present?(name, required)

      value = body[name]
      if !value.is_a?(Integer)
        fail_at("/#{name}", "type", "must be an integer")
      elsif minimum && value < minimum
        fail_at("/#{name}", "minimum", "must be at least #{minimum}")
      elsif maximum && value > maximum
        fail_at("/#{name}", "maximum", "must be at most #{maximum}")
      end
    end

    def string(name, required: false, pattern: nil, max_length: nil)
      return unless present?(name, required)

      value = body[name]
      if !value.is_a?(String)
        fail_at("/#{name}", "type", "must be a string")
      elsif max_length && value.length > max_length
        fail_at("/#{name}", "maxLength", "must be at most #{max_length} characters")
      elsif pattern && !value.match?(pattern)
        fail_at("/#{name}", "pattern", "is not in the expected form")
      end
    end

    def boolean(name, required: false)
      return unless present?(name, required)

      fail_at("/#{name}", "type", "must be true or false") unless [ true, false ].include?(body[name])
    end

    # At least one of names must be present, as JSON Schema's minProperties
    # says for a body whose members are all optional.
    def any_of(*names)
      return if names.any? { |name| body.key?(name) }

      fail_at("", "minProperties", "must name at least one of #{names.join(', ')}")
    end

    def object(name, required: false)
      return unless present?(name, required)

      fail_at("/#{name}", "type", "must be a JSON object") unless body[name].is_a?(Hash)
    end

    def ok?
      @errors.empty?
    end

    def finish!
      raise Failed, @errors unless ok?

      body
    end

    private

    def present?(name, required)
      return body.key?(name) unless required

      required(name)
    end

    def fail_at(pointer, keyword, message)
      @errors << BlockDocument::Error.new(pointer: "#{@prefix}#{pointer}", keyword: keyword, block_pointer: nil, message: message)
    end
  end
end
