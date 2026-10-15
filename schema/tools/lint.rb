# frozen_string_literal: true

# The Ruby half of lint.ts: json_schemer, from the app's bundle, compiles
# every pattern of the schemas the way the app will (regexp_resolver
# "ecma") and answers the probe strings lint.ts sends; and each schema is
# checked against the 2020-12 meta-schema, and built from its file with
# every one of its definitions, so a reference to another file (the
# collection schema's to the page schema) is resolved as the app resolves
# it.
#
# Reads one JSON object on stdin:
#   {"schemas": [PATH, ...], "patterns": [{"at": POINTER, "source": PATTERN, "probes": [STRING, ...]}]}
# Writes one JSON object on stdout:
#   {"engine": ..., "schemaErrors": [...], "patterns": [{"at", "ok", "error", "ruby", "matches"}]}
# where matches is a string of 0 and 1, one per probe.

CMS_GEMFILE = File.expand_path("../../cms/Gemfile", __dir__)
ENV["BUNDLE_GEMFILE"] = CMS_GEMFILE
require "bundler/setup"
require "json"
require "json_schemer"
require "pathname"

input = JSON.parse($stdin.binmode.read.force_encoding(Encoding::UTF_8))

schema_errors = input.fetch("schemas").each_with_index.flat_map do |path, k|
  # The first schema's errors as they were always named; any other's with
  # its file's name.
  name = k.zero? ? "" : "#{File.basename(path)}: "
  schema = JSON.parse(File.read(path, encoding: "UTF-8"))
  errors = JSONSchemer.validate_schema(schema).map { |e| "#{name}#{e['data_pointer']} #{e['type']}" }
  # Building the schemer with the app's options also compiles every
  # keyword; asking each definition for a verdict resolves its references.
  begin
    schemer = JSONSchemer.schema(Pathname.new(path), regexp_resolver: "ecma", format: false)
    (schema["$defs"] || {}).each_key { |definition| schemer.ref("#/$defs/#{definition}").valid?(nil) }
  rescue StandardError => e
    errors << "#{name}JSONSchemer.schema raised #{e.class}: #{e.message[0, 300]}"
  end
  errors
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
