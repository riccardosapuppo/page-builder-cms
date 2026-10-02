# frozen_string_literal: true

require "json"

# Application rules for page documents: the checks JSON Schema cannot make,
# run before the schema. schema/tools/rules.ts is the same code in
# TypeScript, rule for rule and pointer for pointer; the comparator in
# schema/tools runs both over the corpus and fails if they ever answer
# differently.
#
# Plain Ruby with no Rails dependency, so a script can require it alone.
# Under Rails, BlockDocument must stay a module (Zeitwerk maps this file to
# BlockDocument::Rules).
#
# The pipeline, the same on both sides:
#   1. the bytes must be UTF-8                         -> "encoding"
#   2. the text must be strict JSON, checked by a scanner of our own:
#      grammar ("parse"), duplicate keys ("duplicateKey"), nesting deeper
#      than MAX_NESTING ("maxNesting"), lone surrogates ("wellFormed")
#   3. the json gem reads the text; after a clean scan it cannot fail, so if
#      it does, that is a bug and it raises
#   4. the tree: well-formed strings ("wellFormed"), finite numbers
#      ("finite"), exact integers ("safeInteger"), unique block ids
#      ("uniqueId"), unique section anchors ("uniqueAnchor")
#   5. normalisation: an integral Float becomes an Integer (2.0 -> 2)
# Then the schema runs on the normalised document.
module BlockDocument
  module Rules
    MAX_NESTING = 64
    # 2^53 - 1, the largest integer both languages read exactly.
    MAX_SAFE_INTEGER = 9_007_199_254_740_991

    Error = Data.define(:pointer, :keyword, :message)

    # document is present when the text was read, even if the tree broke a
    # rule; it is normalised only when errors is empty.
    Result = Data.define(:document, :errors) do
      def ok? = errors.empty?
    end

    # The json gem's own limits, stated rather than left to its defaults. The
    # scanner has already enforced stricter ones.
    JSON_OPTIONS = {
      max_nesting: 100,
      allow_nan: false,
      allow_duplicate_key: false,
      allow_trailing_comma: false,
      allow_control_characters: false
    }.freeze

    module_function

    # Reads a document from the bytes received (a request body, a file) and
    # applies every rule. The document is ready for the schema only when
    # errors is empty.
    def parse(source)
      text = source.b.force_encoding(Encoding::UTF_8)
      unless text.valid_encoding?
        return Result.new(document: nil, errors: [ Error.new(pointer: "", keyword: "encoding", message: "The text is not valid UTF-8.") ])
      end

      scan_error = scan_json(text)
      return Result.new(document: nil, errors: [ scan_error ]) if scan_error

      document = JSON.parse(text, **JSON_OPTIONS)
      check_document(document)
    end

    # Applies the rules to a document already in memory, as JSON.parse
    # returns it. Same as parse without the text steps.
    def check_document(document)
      errors = check_tree(document)
      return Result.new(document: document, errors: errors) unless errors.empty?

      Result.new(document: normalize(document), errors: [])
    end

    def escape_pointer(key)
      key.gsub("~", "~0").gsub("/", "~1")
    end

    # Step 2: the scanner. Iterative, so a deep text cannot exhaust the
    # stack. It stops at the first problem; the pointer says where it is,
    # except for grammar errors, which carry "" and the position in the
    # message.
    def scan_json(text)
      Scanner.new(text).run
    end

    # Step 4: rules on the tree.
    def check_tree(document)
      errors = []

      # Every value, iteratively. depth is the number of containers above.
      stack = [ [ document, "", 0 ] ]
      until stack.empty?
        value, pointer, depth = stack.pop
        case value
        when String
          errors << Error.new(pointer: pointer, keyword: "wellFormed", message: "A string holds half of a surrogate pair.") unless well_formed?(value)
        when Float
          if !value.finite?
            errors << Error.new(pointer: pointer, keyword: "finite", message: "A number is too large to be stored.")
          elsif value == value.floor && value.abs > MAX_SAFE_INTEGER
            errors << unsafe_integer(pointer)
          end
        when Integer
          errors << unsafe_integer(pointer) if value.abs > MAX_SAFE_INTEGER
        when Array, Hash
          if depth + 1 > MAX_NESTING
            errors << Error.new(pointer: pointer, keyword: "maxNesting", message: "Objects and arrays are nested deeper than #{MAX_NESTING} levels.")
            next
          end
          if value.is_a?(Array)
            value.each_with_index { |child, k| stack << [ child, "#{pointer}/#{k}", depth + 1 ] }
          else
            value.each do |key, child|
              unless key.is_a?(String) && well_formed?(key)
                errors << Error.new(pointer: pointer, keyword: "wellFormed", message: "A member name holds half of a surrogate pair.")
                next
              end
              stack << [ child, "#{pointer}/#{escape_pointer(key)}", depth + 1 ]
            end
          end
        end
      end

      errors.concat(duplicate_ids(document))
      errors.concat(duplicate_anchors(document))
    end

    # Block ids, in document order: the second block with an id is the one
    # reported.
    def duplicate_ids(document)
      return [] unless document.is_a?(Hash) && document["sections"].is_a?(Array)

      errors = []
      seen = {}
      blocks = []
      push_children = lambda do |list, pointer|
        (list.size - 1).downto(0) { |k| blocks << [ list[k], "#{pointer}/#{k}" ] }
      end
      push_children.call(document["sections"], "/sections")
      until blocks.empty?
        block, pointer = blocks.pop
        next unless block.is_a?(Hash)

        id = block["id"]
        if id.is_a?(String)
          if seen.key?(id)
            errors << Error.new(pointer: "#{pointer}/id", keyword: "uniqueId", message: "The id \"#{id}\" is already used by another block.")
          else
            seen[id] = true
          end
        end
        push_children.call(block["children"], "#{pointer}/children") if block["children"].is_a?(Array)
      end
      errors
    end

    # Section anchors, in page order: the second section with an anchor is
    # the one reported. An anchor is the id of the section's element on the
    # published page, and a link to #anchor goes to the first element with
    # that id, so a second section with it could never be reached. Only
    # sections carry an anchor, and sections are the page's own children.
    def duplicate_anchors(document)
      return [] unless document.is_a?(Hash) && document["sections"].is_a?(Array)

      errors = []
      seen = {}
      document["sections"].each_with_index do |section, k|
        anchor = section["props"]["anchor"] if section.is_a?(Hash) && section["props"].is_a?(Hash)
        next unless anchor.is_a?(String)

        if seen.key?(anchor)
          errors << Error.new(pointer: "/sections/#{k}/props/anchor", keyword: "uniqueAnchor", message: "The anchor \"#{anchor}\" is already used by another section.")
        else
          seen[anchor] = true
        end
      end
      errors
    end

    # Step 5: normalisation. Ruby keeps 2.0 a Float, which would render as
    # "<h2.0>" and miss a Hash lookup by 2. Call it only on a document that
    # passed check_tree.
    def normalize(value)
      case value
      when Hash then value.to_h { |key, child| [ key, normalize(child) ] }
      when Array then value.map { |child| normalize(child) }
      when Float then value == value.floor ? value.to_i : value
      else value
      end
    end

    def well_formed?(string)
      string.valid_encoding? && (string.encoding == Encoding::UTF_8 || string.ascii_only?)
    end

    def unsafe_integer(pointer)
      Error.new(pointer: pointer, keyword: "safeInteger", message: "An integer is beyond #{MAX_SAFE_INTEGER}, where it stops being exact.")
    end

    # The scanner of step 2. It walks the bytes: every structural character
    # of JSON is ASCII, and the text is already known to be valid UTF-8.
    class Scanner
      ObjectFrame = Struct.new(:keys, :key)
      ArrayFrame = Struct.new(:index)

      STRING_STOP = /["\\\x00-\x1f]/
      HEX4 = /\A[0-9A-Fa-f]{4}\z/
      SIMPLE_ESCAPES = [ 0x22, 0x5C, 0x2F, 0x62, 0x66, 0x6E, 0x72, 0x74 ].freeze
      WHITESPACE = [ 0x20, 0x09, 0x0A, 0x0D ].freeze

      def initialize(text)
        @text = text
        @size = text.bytesize
        @i = 0
        @frames = []
      end

      def run
        expect_value = true
        loop do
          if expect_value
            skip_whitespace
            return parse_error("Unexpected end of text") if @i >= @size

            c = @text.getbyte(@i)
            if c == 0x7B || c == 0x5B
              if @frames.size + 1 > MAX_NESTING
                return Error.new(pointer: pointer_of(@frames.size), keyword: "maxNesting", message: "Objects and arrays are nested deeper than #{MAX_NESTING} levels.")
              end

              @i += 1
              skip_whitespace
              if c == 0x7B
                frame = ObjectFrame.new({}, "")
                @frames << frame
                if @text.getbyte(@i) == 0x7D
                  @i += 1
                  @frames.pop
                  expect_value = false
                else
                  error = read_key(frame)
                  return error if error
                end
              else
                @frames << ArrayFrame.new(0)
                if @text.getbyte(@i) == 0x5D
                  @i += 1
                  @frames.pop
                  expect_value = false
                end
              end
              next
            end

            error =
              if c == 0x22
                read_string { pointer_of(@frames.size) }
              elsif c == 0x2D || digit?(c)
                read_number
              elsif literal?("true") || literal?("null")
                @i += 4
                nil
              elsif literal?("false")
                @i += 5
                nil
              else
                parse_error("Unexpected character")
              end
            return error if error

            expect_value = false
            next
          end

          # After a value: close containers or move to the next member.
          skip_whitespace
          top = @frames.last
          if top.nil?
            return @i == @size ? nil : parse_error("Unexpected text after the document")
          end

          c = @text.getbyte(@i)
          if c == 0x2C
            @i += 1
            if top.is_a?(ObjectFrame)
              error = read_key(top)
              return error if error
            else
              top.index += 1
            end
            expect_value = true
          elsif (top.is_a?(ObjectFrame) && c == 0x7D) || (top.is_a?(ArrayFrame) && c == 0x5D)
            @i += 1
            @frames.pop
          else
            return parse_error(top.is_a?(ObjectFrame) ? "Expected ',' or '}'" : "Expected ',' or ']'")
          end
        end
      end

      private

      def pointer_of(count)
        @frames.first(count).map { |frame| "/#{frame.is_a?(ArrayFrame) ? frame.index : Rules.escape_pointer(frame.key)}" }.join
      end

      def parse_error(what)
        Error.new(pointer: "", keyword: "parse", message: "#{what} at byte #{@i}.")
      end

      def skip_whitespace
        @i += 1 while @i < @size && WHITESPACE.include?(@text.getbyte(@i))
      end

      def digit?(c)
        !c.nil? && c >= 0x30 && c <= 0x39
      end

      def literal?(word)
        @text.byteslice(@i, word.bytesize) == word
      end

      def hex4(at)
        chunk = @text.byteslice(at, 4)
        chunk&.match?(HEX4) ? chunk.to_i(16) : -1
      end

      # @i is on the opening quote. The block gives the pointer where a lone
      # surrogate is reported: the value itself, or for a key the object
      # that holds it.
      def read_string(&surrogate_pointer)
        lone = -> { Error.new(pointer: surrogate_pointer.call, keyword: "wellFormed", message: "A string holds half of a surrogate pair.") }
        @i += 1
        loop do
          stop = @text.byteindex(STRING_STOP, @i)
          return parse_error("Unterminated string") unless stop

          @i = stop
          c = @text.getbyte(@i)
          if c == 0x22
            @i += 1
            return nil
          end
          return parse_error("Control character inside a string") if c < 0x20

          e = @text.getbyte(@i + 1)
          if SIMPLE_ESCAPES.include?(e)
            @i += 2
          elsif e == 0x75
            code = hex4(@i + 2)
            return parse_error("Invalid \\u escape") if code.negative?

            @i += 6
            if code.between?(0xD800, 0xDBFF)
              low = @text.getbyte(@i) == 0x5C && @text.getbyte(@i + 1) == 0x75 ? hex4(@i + 2) : -1
              return lone.call unless low.between?(0xDC00, 0xDFFF)

              @i += 6
            elsif code.between?(0xDC00, 0xDFFF)
              return lone.call
            end
          else
            return parse_error("Invalid escape")
          end
        end
      end

      # @i is just after "{" or ","; reads the member name and the colon.
      def read_key(frame)
        skip_whitespace
        return parse_error("Expected a member name") unless @text.getbyte(@i) == 0x22

        start = @i
        error = read_string { pointer_of(@frames.size - 1) }
        return error if error

        raw = @text.byteslice(start, @i - start)
        key = raw.include?("\\") ? JSON.parse(raw) : raw[1..-2]
        frame.key = key
        if frame.keys.key?(key)
          return Error.new(pointer: pointer_of(@frames.size), keyword: "duplicateKey", message: "The name \"#{key}\" appears twice in one object.")
        end

        frame.keys[key] = true
        skip_whitespace
        return parse_error("Expected ':'") unless @text.getbyte(@i) == 0x3A

        @i += 1
        nil
      end

      def read_number
        @i += 1 if @text.getbyte(@i) == 0x2D
        first = @text.getbyte(@i)
        if first == 0x30
          @i += 1
        elsif digit?(first)
          @i += 1 while digit?(@text.getbyte(@i))
        else
          return parse_error("Invalid number")
        end
        if @text.getbyte(@i) == 0x2E
          @i += 1
          return parse_error("Invalid number") unless digit?(@text.getbyte(@i))

          @i += 1 while digit?(@text.getbyte(@i))
        end
        if [ 0x65, 0x45 ].include?(@text.getbyte(@i))
          @i += 1
          @i += 1 if [ 0x2B, 0x2D ].include?(@text.getbyte(@i))
          return parse_error("Invalid number") unless digit?(@text.getbyte(@i))

          @i += 1 while digit?(@text.getbyte(@i))
        end
        nil
      end
    end
  end
end
