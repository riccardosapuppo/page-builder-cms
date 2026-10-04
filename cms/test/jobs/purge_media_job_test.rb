require "test_helper"

# The media nothing needs any more: an image no draft and no kept version
# shows, and none has shown for 30 days, goes with its file; an image a
# kept version still shows, or one never placed on a page, stays; an
# upload that never became an image goes after two days.
class PurgeMediaJobTest < ActiveSupport::TestCase
  include StoredFiles

  NOW = Time.utc(2026, 11, 15, 12, 0)

  def image!(last_used: nil, created: NOW - 400.days)
    item = travel_to(created) { MediaItem.create!(file: uploaded_blob(png_bytes), width: 2, height: 1) }
    item.update_columns(last_used_at: last_used)
    item
  end

  def purge
    travel_to(NOW) { PurgeMediaJob.perform_now }
  end

  def stored?(item)
    blob = item.file.blob
    ActiveStorage::Blob.exists?(blob.id) && blob.service.exist?(blob.key)
  end

  test "an image nothing uses goes with its file once 30 days have passed since a page last showed it" do
    gone = image!(last_used: NOW - 30.days - 1.second)
    edge = image!(last_used: NOW - 30.days)
    recent = image!(last_used: NOW - 29.days)
    gone_file = gone.file.blob

    assert_equal [ gone.public_id ], purge[:images]

    assert_not MediaItem.exists?(gone.id)
    assert_not gone_file.service.exist?(gone_file.key), "the file is deleted too"
    assert [ edge, recent ].all? { |item| MediaItem.exists?(item.id) && stored?(item) }
  end

  test "an image a kept version or a draft still shows stays, however long ago it was last named" do
    page = Page.create_with_draft!(title: "Jetty", slug: "jetty")
    in_version = image!
    in_draft = image!
    travel_to(NOW - 400.days) do
      Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: "Old", widgets: [ image_block("i1", in_version.public_id) ]), save_id: "s1")
      page.save_version!(name: "With the old image")
      Draft.save_document!(page_id: page.id, revision: 1, document: page_document(title: "New", widgets: [ image_block("i2", in_draft.public_id) ]), save_id: "s2")
    end

    assert_equal [], purge[:images]
    assert stored?(in_version) && stored?(in_draft)
  end

  test "an image never placed on a page stays in the library, however old" do
    never = image!(last_used: nil, created: NOW - 3.years)

    purge

    assert stored?(never)
  end

  test "once the last old version showing an image is pruned, the image goes 30 days after it was last shown" do
    page = Page.create_with_draft!(title: "Jetty", slug: "jetty")
    item = image!
    travel_to(NOW - 200.days) do
      Draft.save_document!(page_id: page.id, revision: 0, document: page_document(title: "With it", widgets: [ image_block("i1", item.public_id) ]), save_id: "s1")
    end
    revision = 1
    # 50 automatic versions without it, ten minutes apart, take the newest
    # places; the one with it is then an old automatic version.
    50.times do |i|
      travel_to(NOW - 100.days + (i * 11).minutes) do
        Draft.save_document!(page_id: page.id, revision: revision, document: page_document(title: "Without it #{i}"), save_id: "w#{i}")
      end
      revision += 1
    end
    assert_equal 51, page.versions.where(reason: "auto").count
    assert_equal [ page.versions.where(reason: "auto").order(:number).first.id ], MediaUsage.where(media_item: item).pluck(:page_version_id)

    assert_equal [], purge[:images], "still shown by a kept version"
    travel_to(NOW) { PruneVersionsJob.perform_now }
    assert_equal [ item.public_id ], purge[:images]
    assert_not MediaItem.exists?(item.id)
  end

  test "an upload that never became an image goes after two days, not before" do
    abandoned = travel_to(NOW - 2.days - 1.second) { uploaded_blob(png_bytes) }
    under_way = travel_to(NOW - 1.hour) { uploaded_blob(png_bytes) }

    assert_equal 1, purge[:uploads]

    assert_not ActiveStorage::Blob.exists?(abandoned.id)
    assert_not abandoned.service.exist?(abandoned.key)
    assert ActiveStorage::Blob.exists?(under_way.id)
  end
end
