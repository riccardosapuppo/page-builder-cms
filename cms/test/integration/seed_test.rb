require "test_helper"
require Rails.root.join("db", "seeds", "example_site").to_s

# db/seeds.rb, run the way `ruby bin/rails db:seed` runs it, twice.
class SeedTest < ActionDispatch::IntegrationTest
  include StoredFiles

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

  test "every seed image went through the library's checks as an upload, as a PNG of the size it declares" do
    capture_io { ExampleSite.run }

    MediaItem.includes(file_attachment: :blob).find_each do |item|
      assert_equal "image/png", item.file.blob.content_type
      assert_equal [ item.width, item.height ], item.file.download.byteslice(16, 8).unpack("NN"), item.file.filename.to_s
      assert item.alt.present?, item.file.filename.to_s
    end
  end
end
