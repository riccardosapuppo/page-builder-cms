# The example site of the approved design: three published pages and the
# images they show, uploaded into the media library (db/seeds/example_site.rb).
#
#   ruby bin/rails db:seed
#
# It can run again at any time: what is already there is left as it is.
require_relative "seeds/example_site"

puts "Seeding the example site, Slack Water:"
ExampleSite.run
