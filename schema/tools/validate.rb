# frozen_string_literal: true

# The server's side: json_schemer 2.5.0 configured as the Rails app uses it,
# after the application rules of cms/lib/block_document/rules.rb. It runs
# through the app's own bundle (BUNDLE_GEMFILE pointing at cms/Gemfile), so
# the json parser is the one the app locks. Prints a header line, then one
# JSON line per corpus file.
#
#   ruby validate.rb [--schema PATH] [--corpus DIR] [--rules on|off]
#                    [--regexp ecma|ruby] [--skip-file NAME]
#                    [--normalize on|off]
#
# --rules off, --regexp ruby, --skip-file and --normalize off exist to show
# that the comparator fails when the rules are missing, when the regexp
# resolver is the wrong one, when a result goes missing, and when 2.0 stays
# a Float.

# Always the app's bundle, whatever the shell has set: the point is to run
# the gems and the json parser that cms/Gemfile.lock pins.
CMS_GEMFILE = File.expand_path("../../cms/Gemfile", __dir__)
ENV["BUNDLE_GEMFILE"] = CMS_GEMFILE
require "bundler/setup"
require "json"
require "json_schemer"
require_relative "../../cms/lib/block_document/rules"

def arg(name, fallback)
  i = ARGV.index(name)
  i && ARGV[i + 1] ? ARGV[i + 1] : fallback
end

schema_path = arg("--schema", File.expand_path("../block-document.schema.json", __dir__))
corpus = arg("--corpus", File.expand_path("../corpus", __dir__))
use_rules = arg("--rules", "on") == "on"
regexp = arg("--regexp", "ecma")
skip_file = arg("--skip-file", nil)
normalize = arg("--normalize", "on") == "on"

schemer = JSONSchemer.schema(
  JSON.parse(File.read(schema_path, encoding: "UTF-8")),
  regexp_resolver: regexp,
  format: false
)

# json_schemer's classic output names an error by its keyword, except the
# type keyword, which gives the expected type instead.
JSON_TYPES = %w[null boolean object array number string integer].freeze
def keyword_of(error)
  type = error["type"]
  return "type" if JSON_TYPES.include?(type)
  return error["schema_pointer"].split("/").last if type == "schema"

  type
end

$stdout.binmode
$stdout.sync = true
puts JSON.generate({
  "engine" => "json_schemer #{JSONSchemer::VERSION}",
  "parser" => "json #{JSON::VERSION}",
  "runtime" => "ruby #{RUBY_VERSION}",
  "bundle" => Bundler.default_gemfile.to_s == CMS_GEMFILE ? "cms/Gemfile" : Bundler.default_gemfile.to_s,
  "regexp" => regexp,
  "rules" => use_rules,
  "normalize" => normalize
})

files = %w[valid invalid upgrade].flat_map do |folder|
  dir = File.join(corpus, folder)
  next [] unless Dir.exist?(dir)

  Dir.children(dir).select { |name| name.end_with?(".json") }.sort.map { |name| "#{folder}/#{name}" }
end

files.each do |file|
  next if file == skip_file

  line =
    begin
      bytes = File.binread(File.join(corpus, file))
      document = nil
      refused = nil
      if use_rules
        result = BlockDocument::Rules.parse(bytes)
        if result.ok?
          # With --normalize off, the same text read again by the json gem
          # alone: what the schema would get without step 5.
          document = normalize ? result.document : JSON.parse(bytes.force_encoding(Encoding::UTF_8))
        else
          refused = result.errors.map { |e| { "pointer" => e.pointer, "keyword" => e.keyword } }
        end
      else
        begin
          document = JSON.parse(bytes.force_encoding(Encoding::UTF_8))
        rescue JSON::ParserError
          refused = [ { "pointer" => "", "keyword" => "parse" } ]
        end
      end

      if refused
        { "file" => file, "valid" => false, "layer" => "rules", "errors" => refused, "normalized" => nil }
      else
        errors = schemer.validate(document).map { |e| { "pointer" => e["data_pointer"], "keyword" => keyword_of(e) } }
        valid = schemer.valid?(document)
        raise "valid? says #{valid} but validate returned #{errors.size} error(s)" if valid != errors.empty?

        { "file" => file, "valid" => valid, "layer" => "schema", "errors" => errors, "normalized" => JSON.generate(document) }
      end
    rescue StandardError, SystemStackError => e
      { "file" => file, "exception" => "#{e.class}: #{e.message[0, 300]}" }
    end
  puts JSON.generate(line)
end
