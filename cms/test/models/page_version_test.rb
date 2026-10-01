require "test_helper"

class PageVersionTest < ActiveSupport::TestCase
  setup do
    @page = Page.create_with_draft!(title: "Winter series", slug: "winter")
  end

  test "versions are numbered one after the other, per page" do
    other = Page.create_with_draft!(title: "Other", slug: "other")

    @page.save_version!
    @page.save_version!
    other.save_version!

    assert_equal [ 1, 2 ], @page.versions.order(:number).pluck(:number)
    assert_equal [ 1 ], other.versions.pluck(:number)
  end

  test "a version cannot be changed or deleted once written" do
    version = @page.save_version!(name: "First")

    assert_raises(ActiveRecord::ReadOnlyRecord) { version.update!(name: "Changed") }
    assert_raises(ActiveRecord::ReadOnlyRecord) { version.destroy! }
    assert_equal "First", PageVersion.find(version.id).name
  end

  test "a name must be one line of text" do
    assert_raises(ActiveRecord::RecordInvalid) { @page.save_version!(name: "two\nlines") }
    assert_raises(ActiveRecord::RecordInvalid) { @page.save_version!(name: "x" * 81) }
    assert_equal 0, @page.versions.count
  end

  test "restoring copies the old document into the draft and keeps a restore version" do
    Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "Old"), save_id: "s1")
    old = @page.save_version!(name: "Old")
    Draft.save_document!(page_id: @page.id, revision: 1, document: page_document(title: "New"), save_id: "s2")

    draft, restore, kept = @page.restore!(old.number)

    assert_equal "Old", draft.document["title"]
    assert_equal 3, draft.revision
    assert_nil draft.last_save_id
    assert_equal [ "restore", old.number ], [ restore.reason, restore.restored_from ]
    assert_equal draft.document, restore.document
    assert_equal [ "before-restore", "New", nil ], [ kept.reason, kept.document["title"], kept.restored_from ]
    assert_equal [ kept.number + 1 ], [ restore.number ]
  end

  test "restoring first keeps the draft it replaces, so the edits since the last version are not lost" do
    start = Time.utc(2026, 10, 1, 9, 0)
    Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "Morning"), save_id: "s1", at: start)
    # Saved two minutes later: too soon for an automatic version, so only
    # the draft holds it.
    Draft.save_document!(page_id: @page.id, revision: 1, document: page_document(title: "Two minutes of edits"), save_id: "s2", at: start + 2.minutes)
    assert_equal [ "Morning" ], @page.versions.map { |v| v.document["title"] }

    @page.restore!(1, at: start + 3.minutes)

    assert_equal [ [ 1, "auto", "Morning" ], [ 2, "before-restore", "Two minutes of edits" ], [ 3, "restore", "Morning" ] ],
                 @page.versions.order(:number).map { |v| [ v.number, v.reason, v.document["title"] ] }
    # Restoring the kept version brings the edits back; the draft is then
    # the restore version just made, so nothing more needs keeping.
    _, _, kept = @page.restore!(2, at: start + 4.minutes)
    assert_equal "Two minutes of edits", @page.draft.reload.document["title"]
    assert_nil kept
  end

  test "a restore keeps nothing more when the draft is already the newest version" do
    Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "Kept"), save_id: "s1")
    old = @page.save_version!(name: "Kept")

    _, _, kept = @page.restore!(old.number)
    _, _, kept_again = @page.restore!(old.number)

    assert_nil kept
    assert_nil kept_again
    assert_equal %w[auto manual restore restore], @page.versions.order(:number).pluck(:reason)
  end

  test "after a restore, a retry of a save made before it is a conflict" do
    Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "Old"), save_id: "s1")
    old = @page.save_version!
    @page.restore!(old.number)

    assert_raises(Draft::Conflict) do
      Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "Old"), save_id: "s1")
    end
  end

  test "a version stored under an older schema is upgraded when it is restored" do
    # Stand for a server whose schema has moved past a version kept from
    # long ago: version 0 of the shape called the title "name".
    stored = page_document(title: "ignored").except("title").merge("schemaVersion" => 0, "name" => "From the archive")
    old = PageVersion.create!(page: @page, number: 1, document: stored, reason: "manual", created_at: Time.current)
    steps = { 0 => ->(doc) { doc.except("name").merge("schemaVersion" => 1, "title" => doc["name"]) } }

    draft = with_upgrade_steps(steps) { @page.restore!(old.number).first }

    assert_equal 1, draft.document["schemaVersion"]
    assert_equal "From the archive", draft.document["title"]
  end

  test "a version that cannot be upgraded is refused and the draft stays as it was" do
    stored = page_document.merge("schemaVersion" => 0)
    old = PageVersion.create!(page: @page, number: 1, document: stored, reason: "manual", created_at: Time.current)

    error = assert_raises(BlockDocument::Invalid) { @page.restore!(old.number) }

    assert_equal [ [ "/schemaVersion", "upgrade" ] ], error.errors.map { |e| [ e.pointer, e.keyword ] }
    assert_equal 0, @page.draft.reload.revision
    # The draft kept before the restore went back with it.
    assert_equal [ 1 ], @page.versions.pluck(:number)
  end

  private

  def with_upgrade_steps(steps)
    BlockDocument::Upgrade.steps = steps
    yield
  ensure
    BlockDocument::Upgrade.steps = BlockDocument::Upgrade::STEPS
  end
end
