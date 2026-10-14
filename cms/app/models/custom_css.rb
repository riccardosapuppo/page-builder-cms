# frozen_string_literal: true

# A site's own stylesheet (Custom CSS in Site style), checked before it is
# kept and drawn exactly as the editor checks it (builder/src/shared/
# custom-css.ts), on the shared cases of contract/custom-css/cases.json.
#
# The rules are drawn inside the site, in an @scope rule whose root is the
# page root (.site): they style the page and nothing around it, the same on
# the editor's canvas and on the published page. So the stylesheet must
# keep to its scope: every "{" closed by its "}", read as a browser reads
# CSS (inside a comment or a string a brace is none, an escaped one is
# none, a string ends at its line's end), never a "}" that closes nothing;
# no @import, which a scoped stylesheet cannot hold and the pages' policy
# would not load; no more than 50 000 characters. A problem says its line,
# from 1.
module CustomCss
  MAX = 50_000

  Problem = Data.define(:message, :line)

  module_function

  # The text as CSS reads it: a carriage return, the pair CR LF and a form
  # feed end a line as a line feed does (CSS Syntax 3, preprocessing), and
  # a string ends at any of them. Read so here, no string the browser ends
  # there is read on past it, braces and all.
  def lines(css)
    css.gsub(/\r\n|\r|\f/, "\n")
  end

  # Characters by code point, as the editor counts them; a word is ASCII
  # letters, digits, "_" and "-" on both sides.
  def check(written)
    return Problem.new(message: "Keep it under #{MAX.to_s.reverse.scan(/\d{1,3}/).join(',').reverse} characters.", line: 1) if written.length > MAX

    css = lines(written)
    line = 1
    open = []
    i = 0
    while i < css.length
      c = css[i]
      if c == "\n"
        line += 1
        i += 1
      elsif c == "/" && css[i + 1] == "*"
        finish = css.index("*/", i + 2)
        return Problem.new(message: "A comment is not closed: end it with */.", line: line) unless finish

        line += css[i...finish].count("\n")
        i = finish + 2
      elsif [ '"', "'" ].include?(c)
        start = line
        i += 1
        loop do
          return Problem.new(message: "A string is not closed.", line: start) if i >= css.length

          s = css[i]
          if s == "\\"
            line += 1 if css[i + 1] == "\n"
            i += 2
          elsif s == "\n"
            return Problem.new(message: "A string runs past the end of its line: close its quote.", line: start)
          else
            i += 1
            break if s == c
          end
        end
      elsif c == "@" && name_at?(css, i + 1) && read_name(css, i + 1).first.downcase(:ascii) == "import"
        return Problem.new(message: "@import is not allowed: the page loads only its own stylesheets.", line: line)
      elsif name_at?(css, i)
        # A name, read whole with its escapes undone. After url( however it
        # is written (u\72l is url to the browser), an address not in quotes
        # runs to the first ) no escape holds: a brace inside it would be
        # read as one here and as part of the address by the browser.
        text, finish = read_name(css, i)
        address = text.downcase(:ascii) == "url" && css[finish] == "(" ? unquoted_address(css, finish + 1) : nil
        if address.nil?
          line += css[i...finish].count("\n")
          i = finish
        else
          start, close = address
          return Problem.new(message: "A url( is not closed: end it with ).", line: line) unless close
          return Problem.new(message: "A url( holds a brace: put the address in quotes.", line: line) if css[start...close].match?(/[{}]/)

          line += css[i...close].count("\n")
          i = close + 1
        end
      elsif c == "\\"
        # Before a line's end a backslash escapes nothing.
        line += 1 if css[i + 1] == "\n"
        i += 2
      elsif c == "{"
        open << line
        i += 1
      elsif c == "}"
        return Problem.new(message: "This } closes nothing.", line: line) if open.empty?

        open.pop
        i += 1
      else
        i += 1
      end
    end
    return Problem.new(message: "This { is not closed: end the rule with }.", line: open.last) unless open.empty?

    nil
  end

  # Whether a name starts at `at`, as CSS reads one: a letter, "_", "-" or
  # a character past ASCII, or a backslash that escapes something (not a
  # line's end).
  def name_at?(css, at)
    c = css[at]
    return false if c.nil?
    return at + 1 < css.length && css[at + 1] != "\n" if c == "\\"

    c.match?(/[A-Za-z_-]/) || c.ord >= 0x80
  end

  # The name that starts at `at`, its escapes undone as CSS undoes them
  # (\72 is r, and so is \72 with one blank after it; \{ is {), and where
  # it ends.
  def read_name(css, at)
    text = +""
    i = at
    while i < css.length
      c = css[i]
      if c == "\\" && i + 1 < css.length && css[i + 1] != "\n"
        hex = css[i + 1, 6][/\A[0-9A-Fa-f]{1,6}/]
        if hex
          code = hex.to_i(16)
          text << (code.zero? || code.between?(0xD800, 0xDFFF) || code > 0x10FFFF ? "�" : code.chr(Encoding::UTF_8))
          i += 1 + hex.length
          i += 1 if [ " ", "\t", "\n" ].include?(css[i])
        else
          text << css[i + 1]
          i += 2
        end
      elsif c.match?(/[A-Za-z0-9_-]/) || c.ord >= 0x80
        text << c
        i += 1
      else
        break
      end
    end
    [ text, i ]
  end

  # The address after "url(" at `from`, when it is not in quotes: where it
  # starts, past any blanks, and the ) that ends it, the first no escape
  # holds (nil when there is none). nil when it is in quotes: a string,
  # read as one.
  def unquoted_address(css, from)
    start = from
    start += 1 while start < css.length && [ " ", "\t", "\n" ].include?(css[start])
    return nil if [ '"', "'" ].include?(css[start])

    finish = start
    finish += css[finish] == "\\" ? 2 : 1 while finish < css.length && css[finish] != ")"
    [ start, finish < css.length ? finish : nil ]
  end

  # The first 16 hex digits of the SHA-256 of a stylesheet as the page
  # draws it: the version its address names.
  def digest(scoped_css)
    Digest::SHA256.hexdigest(scoped_css)[0, 16]
  end

  # The stylesheet as the page draws it, inside the site; empty for none.
  def scoped(css)
    trimmed = css.to_s.gsub(/\A[ \t\n\r\f]+|[ \t\n\r\f]+\z/, "")
    trimmed.empty? ? "" : "@scope (.site) {\n#{trimmed}\n}\n"
  end
end
