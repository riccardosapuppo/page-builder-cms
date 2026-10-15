require "test_helper"

class EntryTest < ActiveSupport::TestCase
  include CollectionCases
  include StoredFiles

  setup do
    @news = create_news
  end

  def save(entry, revision:, save_id:, **changes)
    Entry.save_checked!(@news, entry.id, revision: revision, save_id: save_id, entry: news_entry(**changes))
  end

  test "a new entry keeps its title, slug and values, normalised, at revision 0 with nothing live" do
    entry = Entry.create_checked!(@news, news_entry(values: { "places" => 24.0, "members-only" => true }))

    assert_equal [ "Dawn swims start again", "dawn-swims", 0, nil, nil ], [ entry.title, entry.slug, entry.revision, entry.last_save_id, entry.published_at ]
    assert_equal({ "summary" => "Twice a week at first light.", "day" => "2026-05-02", "level" => "Beginner", "places" => 24, "members-only" => true }, entry.reload.field_values)
    assert_kind_of Integer, entry.field_values["places"]
  end

  test "a save at the entry's revision is kept and the revision goes up by one; the same save sent again is answered as saved, once" do
    entry = Entry.create_checked!(@news, news_entry)

    saved = save(entry, revision: 0, save_id: "s1", title: "Dawn swims, from May")
    assert_equal [ 1, "s1", "Dawn swims, from May" ], [ saved.revision, saved.last_save_id, saved.title ]
    again = save(entry, revision: 0, save_id: "s1", title: "Dawn swims, from May")
    assert_equal 1, again.revision

    other = assert_raises(Entry::Conflict) { save(entry, revision: 0, save_id: "s1", title: "Something else") }
    assert_equal [ 1, "s1" ], [ other.current_revision, other.last_save_id ]
    stale = assert_raises(Entry::Conflict) { save(entry, revision: 0, save_id: "s2", title: "From another tab") }
    assert_equal [ 1, "s1" ], [ stale.current_revision, stale.last_save_id ]
    assert_equal "Dawn swims, from May", entry.reload.title
  end

  test "values the collection's fields refuse are refused at the value, and nothing is saved" do
    entry = Entry.create_checked!(@news, news_entry)

    error = assert_raises(CollectionDocument::Invalid) { save(entry, revision: 0, save_id: "s1", values: { "level" => "Expert", "places" => 12.345 }) }

    assert_equal [ [ "/values/places", "decimals" ], [ "/values/level", "enum" ] ], error.errors.map { |e| [ e.pointer, e.keyword ] }
    assert_equal 0, entry.reload.revision
  end

  test "an entry's slug is unique in its collection, as its next address and as its live one, and another collection's entries may use it" do
    first = Entry.create_checked!(@news, news_entry(slug: "dawn-swims"))
    first.publish!
    save(first, revision: 0, save_id: "s1", slug: "dawn-swims-again")
    second = Entry.create_checked!(@news, news_entry(slug: "winter"))

    { "dawn-swims" => "is already the address of another entry", "dawn-swims-again" => "is already the next address of another entry" }.each do |taken, words|
      error = assert_raises(ActiveRecord::RecordInvalid, taken) { save(second, revision: 0, save_id: "s-#{taken}", slug: taken) }
      assert_equal [ words ], error.record.errors[:slug], taken
      assert_raises(ActiveRecord::RecordInvalid, taken) { Entry.create_checked!(@news, news_entry(slug: taken)) }
    end
    events = create_news(prefix: "events")
    assert Entry.create_checked!(events, news_entry(slug: "dawn-swims")).persisted?
  end

  test "a publish puts the draft live, checked again against the fields as they are now, and later saves are not live until the next" do
    entry = Entry.create_checked!(@news, news_entry)
    saved = save(entry, revision: 0, save_id: "s1", title: "Live words")

    live = travel_to(Time.utc(2026, 10, 15, 9)) { saved.publish!(expected_revision: 1) }
    assert_equal [ "Live words", "dawn-swims", 1, Time.utc(2026, 10, 15, 9) ], [ live.published_title, live.published_slug, live.published_revision, live.published_at ]
    save(entry, revision: 1, save_id: "s2", title: "Not live yet")
    assert_equal [ "Not live yet", "Live words" ], entry.reload.then { |e| [ e.title, e.published_title ] }

    conflict = assert_raises(Entry::Conflict) { entry.publish!(expected_revision: 1) }
    assert_equal 2, conflict.current_revision
    # A field made required since the last save: the publish is refused at it.
    fields = news_definition["fields"]
    fields[2]["required"] = true
    @news.update_definition!({ "fields" => fields })
    refused = assert_raises(CollectionDocument::Invalid) { entry.publish! }
    assert_equal [ [ "/values/picture", "required" ] ], refused.errors.map { |e| [ e.pointer, e.keyword ] }
    # A publish since keeps when the entry went live.
    @news.update_definition!({ "fields" => news_definition["fields"] })
    again = travel_to(Time.utc(2026, 10, 16, 9)) { entry.publish! }
    assert_equal [ "Not live yet", Time.utc(2026, 10, 15, 9) ], [ again.published_title, again.published_at ]
  end

  test "a live entry published under a new slug leaves a redirect from the old one; an entry published at an old address takes it over" do
    entry = Entry.create_checked!(@news, news_entry(slug: "dawn-swims"))
    entry.publish!
    save(entry, revision: 0, save_id: "s1", slug: "dawn-swims-2027")
    entry.reload.publish!
    assert_equal [ [ "dawn-swims", entry.id ] ], EntryRedirect.pluck(:from_slug, :entry_id)

    other = Entry.create_checked!(@news, news_entry(slug: "dawn-swims"))
    other.publish!
    assert_equal [], EntryRedirect.pluck(:from_slug)
  end

  test "a publish, an unpublish and the delete of a live entry each move the collection's published revision; a save and the delete of a draft do not" do
    entry = Entry.create_checked!(@news, news_entry)
    count = -> { @news.reload.published_revision }

    save(entry, revision: 0, save_id: "s1", title: "Saved")
    assert_equal 0, count.call
    entry.publish!
    assert_equal 1, count.call
    entry.unpublish!
    assert_equal [ 2, nil, nil ], [ count.call, entry.published_slug, entry.published_at ]
    entry.unpublish!
    assert_equal 2, count.call
    entry.publish!
    entry.delete_entry!
    assert_equal 4, count.call
    Entry.create_checked!(@news, news_entry(slug: "a-draft")).delete_entry!
    assert_equal 4, count.call
  end

  test "an image an entry shows, in its draft or in what is live, is in use: not deleted, and the refusal names the entry" do
    item = MediaItem.create!(file: uploaded_blob(png_bytes), width: 2, height: 1)
    picture = { "picture" => { "mediaId" => item.public_id, "alt" => "The jetty" } }
    entry = Entry.create_checked!(@news, news_entry(values: picture))
    entry.publish!
    # The draft no longer shows it: what is live still does.
    save(entry, revision: 0, save_id: "s1")

    error = assert_raises(MediaItem::InUse) { item.destroy_unless_used! }
    assert_equal [ [ @news.id, entry.id ] ], error.entries.map { |e| [ e.collection_id, e.id ] }
    entry.reload.unpublish!
    item.destroy_unless_used!
    assert_not MediaItem.exists?(item.id)
  end

  test "an image the library does not have is refused at the value" do
    error = assert_raises(CollectionDocument::Invalid) do
      Entry.create_checked!(@news, news_entry(values: { "picture" => { "mediaId" => "NoSuchImage0000", "alt" => "Nothing" } }))
    end

    assert_equal [ [ "/values/picture/mediaId", "mediaExists", nil ] ], error.errors.map { |e| [ e.pointer, e.keyword, e.block_pointer ] }
    assert_equal 0, Entry.count
  end
end
