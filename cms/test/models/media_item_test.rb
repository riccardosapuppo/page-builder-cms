require "test_helper"

class MediaItemTest < ActiveSupport::TestCase
  include StoredFiles

  test "an uploaded PNG becomes an item with an id documents can use" do
    item = MediaItem.create!(file: uploaded_blob(png_bytes), width: 2, height: 1, alt: "Swimmers at the jetty")

    assert_match(/\A[A-Za-z0-9_-]{1,64}\z/, item.public_id)
    assert_equal png_bytes, item.file.download
  end

  test "an SVG is refused, whether it says so or claims to be a PNG" do
    as_svg = MediaItem.new(file: uploaded_blob(svg_bytes, filename: "x.svg", content_type: "image/svg+xml"), width: 1, height: 1)
    as_png = MediaItem.new(file: uploaded_blob(svg_bytes, filename: "x.png", content_type: "image/png"), width: 1, height: 1)

    assert_not as_svg.valid?
    assert_includes as_svg.errors.details[:file], { error: :content_type }
    # This blob was stored already marked as identified, so Active Storage
    # does not read its bytes again when it is attached and keeps the
    # declared image/png: the server's own check of the signature is what
    # catches the lie.
    assert_not as_png.valid?
    assert_includes as_png.errors.details[:file], { error: :content_mismatch }
  end

  test "bytes that are no image at all are refused, even under an image type" do
    item = MediaItem.new(file: uploaded_blob("just some text, no picture".b, filename: "x.png", content_type: "image/png"), width: 1, height: 1)

    assert_not item.valid?
    assert_includes item.errors.details[:file], { error: :content_mismatch }
  end

  test "a file larger than the limit is refused" do
    blob = uploaded_blob(png_bytes)
    blob.update_column(:byte_size, MediaItem::MAX_BYTES + 1)

    item = MediaItem.new(file: blob, width: 2, height: 1)

    assert_not item.valid?
    assert_includes item.errors.details[:file], { error: :too_large }
  end

  test "an item is made from the signed id of a finished upload" do
    blob = uploaded_blob(png_bytes)

    item = MediaItem.create_from_upload!(signed_blob_id: blob.signed_id, width: 2, height: 1, alt: "Swimmers")

    assert_equal blob, item.file.blob
    assert_equal "Swimmers", item.alt
  end

  test "an upload whose bytes never arrived, a forged id or a used blob is refused" do
    late = ActiveStorage::Blob.create_before_direct_upload!(filename: "late.png", byte_size: 10, checksum: Digest::MD5.base64digest("x" * 10), content_type: "image/png")
    used = MediaItem.create_from_upload!(signed_blob_id: uploaded_blob(png_bytes).signed_id, width: 2, height: 1).file.blob

    [ [ late.signed_id, :not_uploaded ], [ "forged--id", :invalid ], [ used.signed_id, :taken ] ].each do |signed_id, expected|
      error = assert_raises(ActiveRecord::RecordInvalid) do
        MediaItem.create_from_upload!(signed_blob_id: signed_id, width: 2, height: 1)
      end
      assert_equal [ { error: expected } ], error.record.errors.details[:file]
    end
    assert_equal 1, MediaItem.count
  end

  test "the four kinds of image are told apart by their first bytes" do
    assert_equal "image/png", MediaItem.sniff(png_bytes)
    assert_equal "image/jpeg", MediaItem.sniff("\xFF\xD8\xFF\xE0\x00\x10JFIF".b)
    assert_equal "image/gif", MediaItem.sniff("GIF89a\x01\x00\x01\x00".b)
    assert_equal "image/webp", MediaItem.sniff("RIFF\x24\x00\x00\x00WEBPVP8 ".b)
    assert_nil MediaItem.sniff(svg_bytes)
    assert_nil MediaItem.sniff("RIFF\x24\x00\x00\x00WAVEfmt ".b)
  end

  test "the alt text is empty or one line" do
    item = MediaItem.create!(file: uploaded_blob(png_bytes), width: 2, height: 1)

    assert_equal "", item.alt
    assert_not item.update(alt: "two\nlines")
    assert_not item.update(alt: "x" * 301)
    assert item.update(alt: "Swimmers at the jetty")
  end

  test "sizes must be whole numbers of pixels" do
    item = MediaItem.new(file: uploaded_blob(png_bytes), width: 0, height: 2.5)

    assert_not item.valid?
    assert item.errors[:width].any?
    assert item.errors[:height].any?
  end

  test "an item a draft or a version uses cannot be deleted" do
    item = MediaItem.create!(file: uploaded_blob(png_bytes), width: 2, height: 1)
    page = Page.create_with_draft!(title: "Winter series", slug: "winter")
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document(widgets: [ image_block("i1", item.public_id) ]), save_id: "s1")
    page.save_version!(name: "With the photo")

    error = assert_raises(MediaItem::InUse) { item.destroy_unless_used! }

    assert_equal [ page.id ], error.drafts.map(&:page_id)
    assert_equal [ [ page.id, 1 ], [ page.id, 2 ] ], error.versions.map { |v| [ v.page_id, v.number ] }
    assert MediaItem.exists?(item.id)
  end

  test "an item nobody uses is deleted with its file" do
    item = MediaItem.create!(file: uploaded_blob(png_bytes), width: 2, height: 1)
    key = item.file.blob.key

    item.destroy_unless_used!

    assert_not MediaItem.exists?(item.id)
    assert_not ActiveStorage::Blob.service.exist?(key)
  end
end
