# The example site of the approved design: five published pages, the
# collections News, with its five entries, and Club kit, with its four
# products, each with its template, published, the shop on and selling
# Club kit in pounds, and the images they show, uploaded into the media
# library, read from ../example-site/ (db/seeds/example_site.rb says how).
# With EMPTY_SITE=1, which `npm start -- --empty` sets, a site with
# nothing in it instead (db/seeds/empty_site.rb).
#
#   ruby bin/rails db:seed
#
# It can run again at any time: what is already there is left as it is.
if ENV["EMPTY_SITE"] == "1"
  require_relative "seeds/empty_site"

  puts "Seeding an empty site, with no page:"
  EmptySite.run
else
  require_relative "seeds/example_site"

  puts "Seeding the example site, Slack Water:"
  ExampleSite.run
end
