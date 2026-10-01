# frozen_string_literal: true

module Api
  # Reads a request body as the exact bytes sent, with json 3.
  #
  # Every API action that takes a body reads it here, from request.raw_post,
  # and never through params: Rails would parse the same bytes with its own
  # parser and answer a generic 400 before the action could say what was
  # wrong. Those actions take their ids from request.path_parameters for the
  # same reason, because reading params parses the body.
  #
  # A member name that appears twice in one object is refused: JavaScript's
  # JSON.parse keeps the last value and Ruby's would raise, so the editor
  # and the server would not be looking at the same document.
  module JsonBody
    class Malformed < StandardError; end

    class DuplicateKey < StandardError
      attr_reader :pointer

      def initialize(pointer)
        @pointer = pointer
        super("A member name appears twice in one object, at #{pointer.inspect}.")
      end
    end

    OPTIONS = { allow_nan: false, allow_trailing_comma: false, allow_control_characters: false }.freeze

    module_function

    # optional: an empty body stands for {}, for actions whose body only
    # holds optional members.
    def parse(raw, optional: false)
      return {} if optional && raw.empty?

      text = raw.dup.force_encoding(Encoding::UTF_8)
      raise Malformed, "The body is not UTF-8 text." unless text.valid_encoding?

      begin
        JSON.parse(text, **OPTIONS, allow_duplicate_key: false)
      rescue JSON::ParserError => refused
        # Tell a duplicate name from any other fault without reading the
        # message: if the text parses once duplicates are allowed, a
        # duplicate was the only problem, and json_path says where.
        begin
          JSON.parse(text, **OPTIONS, allow_duplicate_key: true)
        rescue JSON::ParserError
          raise Malformed, "The body is not valid JSON."
        end
        raise DuplicateKey, pointer_from_json_path(refused.json_path)
      end
    end

    # Turns the JSONPath json puts on a ParserError into a JSON pointer:
    # $.document.sections[0].id -> /document/sections/0/id.
    #
    # The path is written by JSON::ParserError#build_json_path (json 3.0.2):
    #   .name    for a name of ASCII letters, digits, $ and _ that does not
    #            start with a digit;
    #   [n]      for an array index;
    #   ["..."]  for any other name, with only " and \ escaped by a
    #            backslash; everything else, a newline included, is as is.
    # So "0" as a name is ["0"] and never [0], and the path reads back
    # exactly.
    def pointer_from_json_path(path)
      raise ArgumentError, "not a JSON path: #{path.inspect}" unless path.is_a?(String) && path.start_with?("$")

      tokens = []
      i = 1
      while i < path.length
        if path[i] == "."
          name = path.match(/\G[A-Za-z$_][A-Za-z0-9$_]*/, i + 1) or raise ArgumentError, "bad name at #{i} in #{path.inspect}"
          tokens << name[0]
          i = name.end(0)
        elsif path[i, 2] == "[\""
          j = i + 2
          name = +""
          loop do
            c = path[j] or raise ArgumentError, "unterminated name in #{path.inspect}"
            if c == "\\"
              name << path[j + 1].to_s
              j += 2
            elsif c == "\""
              break
            else
              name << c
              j += 1
            end
          end
          raise ArgumentError, "bad name at #{j} in #{path.inspect}" unless path[j + 1] == "]"

          tokens << name
          i = j + 2
        else
          index = path.match(/\G\[(\d+)\]/, i) or raise ArgumentError, "bad step at #{i} in #{path.inspect}"
          tokens << index[1]
          i = index.end(0)
        end
      end
      tokens.map { |token| "/#{BlockDocument::Rules.escape_pointer(token)}" }.join
    end
  end
end
