require "test_helper"

class PageTest < ActiveSupport::TestCase
  test "a new page has a draft with its title and nothing live" do
    page = Page.create_with_draft!(title: "Winter series", slug: "winter")

    assert_equal "Winter series", page.draft.document["title"]
    assert_equal [], page.draft.document["sections"]
    assert_equal "winter", page.draft.slug
    assert_equal 0, page.draft.revision
    assert_nil page.slug
    assert_not page.published?
    assert_equal 0, page.versions.count
  end

  test "a title the schema refuses is reported at /title and nothing is created" do
    error = assert_raises(BlockDocument::Invalid) { Page.create_with_draft!(title: "two\nlines", slug: "winter") }

    assert_includes error.errors.map(&:pointer), "/title"
    assert_equal 0, Page.count
  end

  test "the addresses the application answers itself are refused" do
    %w[api up assets rails preview].each do |slug|
      draft = Draft.new(slug: slug)
      draft.validate
      assert_includes draft.errors.details[:slug], { error: :reserved }, slug
    end
  end

  test "404 is refused because public/404.html answers that address first" do
    assert Rails.public_path.join("404.html").file?

    page = Page.new(slug: "404")

    assert_not page.valid?
    assert_includes page.errors.details[:slug], { error: :reserved }
  end

  test "any name a file in public/ answers is refused, not only a fixed list" do
    name = "kept-#{SecureRandom.hex(4)}"
    folder = Rails.public_path.join(name)
    assert Draft.new(slug: name).tap(&:validate).errors.details[:slug].none? { |d| d[:error] == :reserved }

    FileUtils.mkdir_p(folder)
    File.write(folder.join("index.html"), "<p>static</p>")
    draft = Draft.new(slug: name)
    draft.validate
    assert_includes draft.errors.details[:slug], { error: :reserved }
  ensure
    FileUtils.rm_rf(folder) if folder
  end

  test "a slug with capitals, dots or doubled hyphens is refused" do
    [ "Winter", "winter.html", "winter--series", "-winter", "winter-", "", "a" * 65 ].each do |slug|
      draft = Draft.new(slug: slug)
      draft.validate
      assert draft.errors[:slug].any?, slug.inspect
    end
  end

  test "a page cannot take an address another page is still live at" do
    live = Page.create_with_draft!(title: "Home", slug: "home")
    live.publish!
    live.draft.update!(slug: "start")

    error = assert_raises(ActiveRecord::RecordInvalid) { Page.create_with_draft!(title: "Other", slug: "home") }

    assert_equal [ { error: :taken } ], error.record.errors.details[:slug]
    assert_equal 1, Page.count
  end

  test "publishing puts the draft live as a version, at the draft's address" do
    page = Page.create_with_draft!(title: "Winter series", slug: "winter")
    at = Time.utc(2026, 10, 1, 9, 0)

    version = page.publish!(at: at)

    page.reload
    assert_equal "winter", page.slug
    assert_equal version, page.published_version
    assert_equal "publish", version.reason
    assert_equal 1, version.number
    assert_equal page.draft.document, version.document
    assert_equal at, page.published_at
    assert_equal 0, SlugRedirect.count
  end

  test "a new address takes effect on publish and the old one becomes a redirect" do
    page = Page.create_with_draft!(title: "Winter series", slug: "winter")
    page.publish!
    page.draft.update!(slug: "winter-swims")
    assert_equal "winter", page.reload.slug, "the address must not change before the publish"

    page.publish!

    assert_equal "winter-swims", page.reload.slug
    assert_equal [ [ "winter", page.id ] ], SlugRedirect.pluck(:from_slug, :page_id)
  end

  test "a page that takes back its old address loses the redirect" do
    page = Page.create_with_draft!(title: "Winter series", slug: "winter")
    page.publish!
    page.draft.update!(slug: "winter-swims")
    page.publish!
    page.draft.update!(slug: "winter")

    page.publish!

    assert_equal "winter", page.reload.slug
    assert_equal [ [ "winter-swims", page.id ] ], SlugRedirect.pluck(:from_slug, :page_id)
  end

  test "published_at never moves back, even when the clock does" do
    page = Page.create_with_draft!(title: "Winter series", slug: "winter")
    page.publish!(at: Time.utc(2026, 10, 1, 9, 0))

    page.publish!(at: Time.utc(2026, 9, 30, 9, 0))

    assert_equal Time.utc(2026, 10, 1, 9, 0), page.reload.published_at
    assert_equal 2, page.published_version.number
  end

  test "the model itself refuses a published_at earlier than the last one" do
    page = Page.create_with_draft!(title: "Winter series", slug: "winter")
    page.publish!(at: Time.utc(2026, 10, 1, 9, 0))

    page.published_at = Time.utc(2026, 10, 1, 8, 59)

    assert_not page.valid?
    assert_includes page.errors.details[:published_at], { error: :moved_back }
  end

  test "publishing with a revision someone has saved past is a conflict, and nothing goes live" do
    page = Page.create_with_draft!(title: "Winter series", slug: "winter")
    Draft.save_document!(page_id: page.id, revision: 0, document: page_document, save_id: "a1")

    assert_raises(Draft::Conflict) { page.publish!(expected_revision: 0) }

    assert_not page.reload.published?
    assert_equal 0, page.versions.where(reason: "publish").count
  end
end
