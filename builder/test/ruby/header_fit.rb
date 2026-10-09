# frozen_string_literal: true

# The server's side of builder/src/render/header-fit.rails.test.ts: for
# every header the test generated, what the CMS's own HeaderFit makes of it,
# the width its bar needs and the data-fold it names, so the editor's twin
# can be compared with it value for value. The width also comes as the
# bits of the double, so the comparison does not rest on how either side
# writes a float.
#
#   ruby header_fit.rb <input.json> <output.json>
#
# HeaderFit reads its metrics from where the application keeps the schema,
# so the application is loaded, in its test environment, as the CMS loads
# it: no database is opened, and nothing is written.
ENV["RAILS_ENV"] ||= "test"
require File.expand_path("../../../cms/config/environment", __dir__)

Header = Struct.new(:name, :menu, :action)

input = JSON.parse(File.read(ARGV.fetch(0), encoding: "UTF-8"))
output = input.fetch("headers").map do |header|
  site = Header.new(header.fetch("name"), header.fetch("menu"), header.fetch("action"))
  needed = HeaderFit.width_needed(site).to_f
  { "needed" => needed, "bits" => [ needed ].pack("G").unpack1("H*"), "fold" => HeaderFit.fold(site) }
end
File.binwrite(ARGV.fetch(1), JSON.generate(output))
