require "test_helper"
require "fugit"

# The retention rule of the versions (PIANO, section 5): every version
# that is not automatic stays; of a page's automatic versions the newest
# 50 stay, and beyond them those of the last 30 days. Histories are built
# with the time of each version given, and the job runs at a set time.
class PruneVersionsJobTest < ActiveSupport::TestCase
  include StoredFiles

  NOW = Time.utc(2026, 11, 15, 12, 0)

  setup do
    @page = Page.create_with_draft!(title: "Harbour log", slug: "harbour")
  end

  def version!(reason, at, page: @page, document: page_document(title: "#{reason} at #{at.iso8601}"))
    PageVersion.record!(page_id: page.id, document: document, reason: reason, at: at)
  end

  # count automatic versions, one a day from `from`, oldest first.
  def automatic!(count, from:, page: @page)
    Array.new(count) { |i| version!("auto", from + i.days, page: page) }
  end

  def prune
    travel_to(NOW) { PruneVersionsJob.perform_now }
  end

  def numbers(reason = "auto")
    @page.versions.where(reason: reason).order(:number).pluck(:number)
  end

  test "the newest 50 automatic versions stay however old they are, and older ones older than 30 days go" do
    old = automatic!(55, from: NOW - 200.days)

    assert_equal({ @page.id => 5 }, prune)

    assert_equal old.last(50).map(&:number), numbers
  end

  test "beyond the newest 50, automatic versions of the last 30 days stay, one made exactly 30 days before included" do
    gone = version!("auto", NOW - 30.days - 1.second)
    edge = version!("auto", NOW - 30.days)
    recent = automatic!(5, from: NOW - 29.days)
    newest = automatic!(50, from: NOW - 20.days)

    prune

    assert_equal [ edge, *recent, *newest ].map(&:number), numbers
    assert_not PageVersion.exists?(gone.id)
  end

  test "a page with 50 automatic versions or fewer loses none" do
    automatic!(50, from: NOW - 400.days)

    assert_equal({}, prune)
    assert_equal 50, numbers.size
  end

  test "published, scheduled, manual, restore and before-restore versions stay, however old and however many" do
    kept = %w[publish scheduled manual restore before-restore].flat_map do |reason|
      Array.new(3) { |i| version!(reason, NOW - (300 + i).days) }
    end
    automatic!(51, from: NOW - 200.days)
    Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "Live"), save_id: "s1", at: NOW - 100.days)
    live = @page.publish!(at: NOW - 100.days)

    prune

    assert_equal kept.map(&:id) + [ live.id ], @page.versions.where.not(reason: "auto").order(:number).pluck(:id), "every other kind stays"
    assert_equal 50, numbers.size
    assert_equal live.id, @page.reload.published_version_id
  end

  test "each page is counted on its own" do
    other = Page.create_with_draft!(title: "Other", slug: "other")
    automatic!(30, from: NOW - 300.days, page: other)
    automatic!(52, from: NOW - 300.days)

    assert_equal({ @page.id => 2 }, prune)
    assert_equal 30, other.versions.count
  end

  test "a pruned version's media usage goes with it; a kept one's stays" do
    item = MediaItem.create!(file: uploaded_blob(png_bytes), width: 2, height: 1)
    with_image = page_document(title: "With the jetty", widgets: [ image_block("i1", item.public_id) ])
    pruned = version!("auto", NOW - 400.days, document: with_image)
    kept = version!("manual", NOW - 400.days, document: with_image)
    automatic!(50, from: NOW - 300.days)

    prune

    assert_not PageVersion.exists?(pruned.id)
    assert_equal [ kept.id ], MediaUsage.where(media_item: item).pluck(:page_version_id)
  end

  test "the job runs every night, by the site's clock, beside the purge of unused media" do
    config = ActiveSupport::ConfigurationFile.parse(Rails.root.join("config", "recurring.yml"))
    %w[development e2e production].each do |env|
      tasks = config.fetch(env)
      assert_equal [ "PruneVersionsJob", "every day at 3:30am" ], tasks.fetch("prune_versions").values_at("class", "schedule"), env
      assert_equal [ "PurgeMediaJob", "every day at 4am" ], tasks.fetch("purge_media").values_at("class", "schedule"), env
    end
    cron = Fugit.parse("#{Fugit.parse('every day at 3:30am').to_cron_s} #{Rails.application.config.time_zone}")
    assert_equal Time.utc(2026, 7, 2, 2, 30), cron.next_time(Time.utc(2026, 7, 1, 12, 0)).to_t.utc, "3:30 in London is 2:30 UTC in summer"
    assert_equal Time.utc(2026, 12, 2, 3, 30), cron.next_time(Time.utc(2026, 12, 1, 12, 0)).to_t.utc, "and 3:30 UTC in winter"
  end
end
