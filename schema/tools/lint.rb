# frozen_string_literal: true

# The Ruby half of lint.ts: json_schemer, from the app's bundle, compiles
# every pattern of the schema the way the app will (regexp_resolver "ecma")
# and answers the probe strings lint.ts sends; and the schema is checked
# against the 2020-12 meta-schema.
#
# Reads one JSON object on stdin:
#   {"schema": PATH, "patterns": [{"at": POINTER, "source": PATTERN, "probes": [STRING, ...]}]}
# Writes one JSON object on stdout:
#   {"engine": ..., "schemaErrors": [...], "patterns": [{"at", "ok", "error", "ruby", "matches"}]}
# where matches is a string of 0 and 1, one per probe.

CMS_GEMFILE = File.expand_path("../../cms/Gemfile", __dir__)
ENV["BUNDLE_GEMFILE"] = CMS_GEMFILE
require "bundler/setup"
require "json"
require "json_schemer"

input = JSON.parse($stdin.binmode.read.force_encoding(Encoding::UTF_8))
schema = JSON.parse(File.read(input.fetch("schema"), encoding: "UTF-8"))

schema_errors = JSONSchemer.validate_schema(schema).map { |e| "#{e['data_pointer']} #{e['type']}" }
# Building the schemer with the app's options also compiles every keyword.
begin
  JSONSchemer.schema(schema, regexp_resolver: "ecma", format: false)
rescue StandardError => e
  schema_errors << "JSONSchemer.schema raised #{e.class}: #{e.message[0, 300]}"
end

patterns = input.fetch("patterns").map do |item|
  source = item.fetch("source")
  begin
    regexp = JSONSchemer::Schema::ECMA_REGEXP_RESOLVER.call(source)
    matches = item.fetch("probes").map { |probe| regexp.match?(probe) ? "1" : "0" }.join
    { "at" => item.fetch("at"), "ok" => true, "ruby" => regexp.source, "matches" => matches }
  rescue StandardError => e
    { "at" => item.fetch("at"), "ok" => false, "error" => "#{e.class}: #{e.message[0, 300]}" }
  end
end

$stdout.binmode
$stdout.write(JSON.generate({
  "engine" => "json_schemer #{JSONSchemer::VERSION}, ruby #{RUBY_VERSION}",
  "schemaErrors" => schema_errors,
  "patterns" => patterns
}))
