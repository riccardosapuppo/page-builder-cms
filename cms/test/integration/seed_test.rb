require "test_helper"
require Rails.root.join("db", "seeds", "example_site").to_s

# db/seeds.rb, run the way `ruby bin/rails db:seed` runs it, twice.
class SeedTest < ActionDispatch::IntegrationTest
  include StoredFiles
  include VisibleText

  test "the seed publishes the example site, and running it again changes nothing" do
    capture_io { ExampleSite.run }
    counts = -> { [ Page.count, PageVersion.count, MediaItem.count, ActiveStorage::Blob.count ] }
    first = counts.call

    capture_io { ExampleSite.run }

    assert_equal [ 3, 6, 9, 9 ], first
    assert_equal first, counts.call

    get "/"
    assert_response :ok
    assert_select "main h1", text: "Swim at slack water"
    assert_equal 6, css_select("main [data-block-type=gallery] img").size
    { "/winter-series" => "Winter series", "/notices" => "Notices" }.each do |path, heading|
      get path
      assert_response :ok
      assert_select "main h1", text: heading
    end
  end

  # The classes only: what they draw (column widths, a palette colour, a
  # type size, reflow, focus rings) is measured in a browser by
  # tools/check-production.ts, since a theme rule that outweighs a token
  # class would leave these classes in place and the layout wrong.
  test "the home page carries the classes of design/shots/page.png's layout: widths, crops and the space of each band" do
    capture_io { ExampleSite.run }

    get "/"

    classes = ->(selector) { css_select(selector).first["class"].split }
    assert_includes classes.call("[data-block-id=hero] > .cols"), "widths-3-2"
    assert_equal %w[aspect-1-1 tablet-aspect-16-9 phone-aspect-5-4], classes.call("[data-block-id=hero-image]").grep(/aspect/)
    assert_equal %w[aspect-4-3], classes.call("[data-block-id=quote-image]").grep(/aspect/)
    spaces = %w[hero swims gallery meet quote questions join].to_h { |id| [ id, classes.call("[data-block-id=#{id}]").grep(/space-/) ] }
    assert_equal({
      "hero" => %w[space-above-section-s phone-space-above-l space-below-section-s phone-space-below-xxl],
      "swims" => %w[space-above-section-s space-below-section-s],
      "gallery" => %w[space-below-section-s],
      "meet" => %w[space-above-section-s],
      "quote" => [], "questions" => [],
      "join" => %w[space-below-section-l]
    }, spaces)
  end

  test "no page of the example site, nor its 404 page, shows a visitor the name of a provider or another brand" do
    capture_io { ExampleSite.run }

    found = %w[/ /winter-series /notices /no-such-page].to_h do |path|
      get path
      [ path, brands_in(response.body) ]
    end

    assert_equal 404, response.status
    assert_equal({ "/" => [], "/winter-series" => [], "/notices" => [], "/no-such-page" => [] }, found)
    get "/"
    assert_includes visible_text(response.body), "Loads a video from the provider when you click."
  end

  test "every seed image went through the library's checks as an upload, as a PNG of the size it declares" do
    capture_io { ExampleSite.run }

    MediaItem.includes(file_attachment: :blob).find_each do |item|
      assert_equal "image/png", item.file.blob.content_type
      assert_equal [ item.width, item.height ], item.file.download.byteslice(16, 8).unpack("NN"), item.file.filename.to_s
      assert item.alt.present?, item.file.filename.to_s
    end
  end
end
