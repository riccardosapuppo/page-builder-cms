# The example site of the approved design: three published pages and the
# images they show, uploaded into the media library, read from
# ../example-site/ (db/seeds/example_site.rb says how).
#
#   ruby bin/rails db:seed
#
# It can run again at any time: what is already there is left as it is.
require_relative "seeds/example_site"

puts "Seeding the example site, Slack Water:"
ExampleSite.run
