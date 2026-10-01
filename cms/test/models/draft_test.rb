require "test_helper"

class DraftTest < ActiveSupport::TestCase
  setup do
    @page = Page.create_with_draft!(title: "Winter series", slug: "winter")
  end

  test "a save from the current revision stores the document and moves the revision on" do
    document = page_document(title: "Cold swims")

    draft = Draft.save_document!(page_id: @page.id, revision: 0, document: document, save_id: "s1")

    assert_equal 1, draft.revision
    assert_equal "s1", draft.last_save_id
    assert_equal document, @page.draft.reload.document
  end

  test "a save from an older revision is a conflict and changes nothing" do
    Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "First"), save_id: "s1")

    error = assert_raises(Draft::Conflict) do
      Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "Second"), save_id: "s2")
    end

    assert_equal 1, error.current_revision
    assert_equal "s1", error.last_save_id
    assert_equal "First", @page.draft.reload.document["title"]
  end

  test "a retry of a save that went through is answered as saved, once" do
    Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "First"), save_id: "s1")

    draft = Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "First"), save_id: "s1")

    assert_equal 1, draft.revision
    assert_equal "First", draft.document["title"]
  end

  test "a retry is recognised on the normalised document: 2.0 is the 2 that was stored" do
    Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "First"), save_id: "s1")
    sent_again = page_document(title: "First")
    sent_again["sections"][0]["children"][0]["children"][0]["props"]["level"] = 1.0

    draft = Draft.save_document!(page_id: @page.id, revision: 0, document: sent_again, save_id: "s1")

    assert_equal 1, draft.revision
  end

  test "the last save id with another document is a conflict, and the draft keeps what was stored" do
    Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "Text of tab A"), save_id: "tab-1")

    error = assert_raises(Draft::Conflict) do
      Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "Text of tab B"), save_id: "tab-1")
    end

    assert_equal 1, error.current_revision
    assert_equal "tab-1", error.last_save_id
    assert_equal "Text of tab A", @page.draft.reload.document["title"]
    assert_equal 1, @page.draft.revision
  end

  test "the last save id from a revision that save did not start from is a conflict" do
    Draft.save_document!(page_id: @page.id, revision: 0, document: page_document(title: "First"), save_id: "s1")
    Draft.save_document!(page_id: @page.id, revision: 1, document: page_document(title: "Second"), save_id: "s2")

    [ 0, 7 ].each do |revision|
      error = assert_raises(Draft::Conflict, "revision #{revision}") do
        Draft.save_document!(page_id: @page.id, revision: revision, document: page_document(title: "Second"), save_id: "s2")
      end
      assert_equal 2, error.current_revision
    end
    # From 1, where it did start, it is the retry it claims to be.
    assert_equal 2, Draft.save_document!(page_id: @page.id, revision: 1, document: page_document(title: "Second"), save_id: "s2").revision
    assert_equal 2, @page.draft.reload.revision
  end

  test "a save of a missing page is not found" do
    assert_raises(ActiveRecord::RecordNotFound) do
      Draft.save_document!(page_id: 0, revision: 0, document: page_document, save_id: "s1")
    end
  end

  test "an invalid document is refused before anything is written" do
    document = page_document
    document["sections"][0]["children"][0]["children"][0]["props"]["level"] = 9

    assert_raises(BlockDocument::Invalid) do
      Draft.save_document!(page_id: @page.id, revision: 0, document: document, save_id: "s1")
    end
    assert_equal 0, @page.draft.reload.revision
  end

  test "an image that names an item the library does not have is refused at its pointer" do
    document = page_document(widgets: [ image_block("i1", "nothere") ])

    error = assert_raises(BlockDocument::Invalid) do
      Draft.save_document!(page_id: @page.id, revision: 0, document: document, save_id: "s1")
    end

    assert_equal [ [ "#{FIRST_WIDGET}/props/mediaId", "mediaExists" ] ], error.errors.map { |e| [ e.pointer, e.keyword ] }
    assert_equal 0, @page.draft.reload.revision
  end

  test "saving keeps at most one automatic version every ten minutes" do
    start = Time.utc(2026, 10, 1, 9, 0)
    save = ->(revision, title) { Draft.save_document!(page_id: @page.id, revision: revision, document: page_document(title: title), save_id: "s#{revision}") }

    travel_to(start) { save.call(0, "One") }
    travel_to(start + 4.minutes) { save.call(1, "Two") }
    travel_to(start + 9.minutes + 59.seconds) { save.call(2, "Three") }
    travel_to(start + 10.minutes) { save.call(3, "Four") }

    autos = @page.versions.where(reason: "auto").order(:number)
    assert_equal [ "One", "Four" ], autos.map { |v| v.document["title"] }
    assert_equal [ start, start + 10.minutes ], autos.map(&:created_at)
  end

  test "a version of any kind in the last ten minutes holds back the automatic one" do
    travel_to(Time.utc(2026, 10, 1, 9, 0)) { @page.save_version!(name: "Before the changes") }

    travel_to(Time.utc(2026, 10, 1, 9, 5)) do
      Draft.save_document!(page_id: @page.id, revision: 0, document: page_document, save_id: "s1")
    end

    assert_equal [ "manual" ], @page.versions.pluck(:reason)
  end

  test "the next address cannot be one another draft already wants" do
    other = Page.create_with_draft!(title: "Other", slug: "other")

    assert_not other.draft.update(slug: "winter")
    assert_includes other.draft.errors.details[:slug], { error: :taken, value: "winter" }
  end
end
