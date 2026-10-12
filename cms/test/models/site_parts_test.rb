require "test_helper"

# The site's header and footer, pages of their own kind: made once, with
# their starter as the first draft; drawn as the starter until published,
# then as the published version; held to a page's rules and two of their
# own, no form and no section anchor.
class SitePartsTest < ActiveSupport::TestCase
  def form_block(id)
    { "id" => id, "type" => "form", "props" => { "items" => [ { "name" => "email", "kind" => "email", "label" => "Email", "required" => true } ],
                                                  "submitLabel" => "Send", "confirmation" => "Sent." }, "style" => { "base" => {} }, "children" => [] }
  end

  test "the starters are the example site's header and footer, and pass the rules a part's draft is held to" do
    header = SiteParts.starter("header")
    footer = SiteParts.starter("footer")

    assert_equal [ "Header", "Footer" ], [ header["title"], footer["title"] ]
    assert_predicate SiteParts.check(header), :ok?
    assert_predicate SiteParts.check(footer), :ok?
    assert_empty SiteParts.starter_errors
    logo = header.dig("sections", 0, "children", 0, "children", 0)
    menu = header.dig("sections", 0, "children", 1, "children", 0)
    assert_equal [ "logo", { "name" => "Slack Water" } ], logo.values_at("type", "props")
    assert_equal [ "Swims", "Gallery", "Meet us", "Questions" ], menu.dig("props", "items").map { |link| link["label"] }
    assert_equal({ "label" => "Header", "columnWidths" => "fit:1:fit", "stack" => "never" }, header.dig("sections", 0, "props"))
  end

  test "a part holds no form: its draft is refused at the form, by the part's own rule" do
    document = page_document(title: "Footer", widgets: [ heading_block("h", "Footer"), form_block("newsletter") ])

    result = SiteParts.check(document)

    assert_not result.ok?
    assert_equal [ [ "/sections/0/children/0/children/1", "part" ] ], result.errors.map { |e| [ e.pointer, e.keyword ] }
    assert_equal "/sections/0/children/0/children/1", result.errors.first.block_pointer
    assert_predicate BlockDocument.check(document), :ok?, "the same document is a valid page"
  end

  test "a part's section takes no anchor: its draft is refused at the anchor, after its forms, by the part's own rule" do
    document = page_document(title: "Footer", widgets: [ heading_block("h", "Footer"), form_block("newsletter") ])
    document["sections"][0]["props"]["anchor"] = "join"

    result = SiteParts.check(document)

    assert_equal [ [ "/sections/0/children/0/children/1", "part" ], [ "/sections/0/props/anchor", "part" ] ], result.errors.map { |e| [ e.pointer, e.keyword ] }
    assert_equal "/sections/0", result.errors.last.block_pointer
    assert_equal SiteParts::ANCHOR, result.errors.last.message
    assert_predicate BlockDocument.check(document), :ok?, "the same document is a valid page"
  end

  test "a page's rules come first: a document a page could not have is refused for them, not for its form" do
    document = page_document(title: "Footer", widgets: [ form_block("x"), form_block("x") ])

    assert_equal [ "uniqueId" ], SiteParts.check(document).errors.map(&:keyword)
  end

  test "the CMS makes each part once, with its starter as the draft, no address, nothing live" do
    assert_difference -> { Page.count } => 2, -> { Draft.count } => 2 do
      header, footer = Page.parts!

      assert_equal [ "header", "footer" ], [ header.kind, footer.kind ]
      assert_equal SiteParts.starter("header"), header.draft.document
      assert_nil header.draft.slug
      assert_nil header.slug
      assert_not header.published?
      assert_not header.home?
    end
    assert_no_difference -> { Page.count } do
      assert_equal Page.part!("header"), Page.part!("header")
    end
    assert_raises(ArgumentError) { Page.part!("sidebar") }
  end

  test "a second header is refused by the database itself" do
    Page.part!("header")

    assert_raises(ActiveRecord::RecordNotUnique) { Page.insert!({ kind: "header", created_at: Time.current, updated_at: Time.current }) }
  end

  test "a part has no address, is never home, and is no page a visitor finds at one" do
    header = Page.part!("header")

    header.slug = "header"
    assert_not header.valid?
    assert_includes header.errors[:slug], "is not for a header or footer, which has no address"
    header.restore_attributes
    assert_raises(Page::Part) { header.make_home! }
    header.draft.slug = "header"
    assert_not header.draft.valid?

    header.publish!
    assert_predicate header.reload, :published?
    assert_nil header.live_path
    assert_nil Page.find_by(slug: nil, home: true)
  end

  test "the published pages draw each part's starter until it is published, then the version published, by a key that reads no document" do
    live = SiteParts.live
    assert_equal [ "starter" ], live.fetch("header").key
    assert_equal SiteParts.starter("header"), live.fetch("header").document

    header = Page.part!("header")
    changed = page_document(title: "Header", widgets: [ heading_block("h", "Tide club") ])
    Draft.save_document!(page_id: header.id, revision: header.draft.revision, document: changed, save_id: "s1")
    assert_equal [ "starter" ], SiteParts.live.fetch("header").key, "a draft is not live"

    header.publish!
    live = SiteParts.live.fetch("header")
    assert_equal PageCache.published_key(header.reload), live.key
    assert_equal changed, live.document
    assert_equal [ "starter" ], SiteParts.live.fetch("footer").key
  end

  test "a preview draws the parts' drafts, or the starters of parts the CMS has not made" do
    assert_equal SiteParts.starter("footer"), SiteParts.drafts.fetch("footer").document

    footer = Page.part!("footer")
    changed = page_document(title: "Footer", widgets: [ heading_block("h", "Goodbye") ])
    Draft.save_document!(page_id: footer.id, revision: footer.draft.revision, document: changed, save_id: "s1")

    assert_equal changed, SiteParts.drafts.fetch("footer").document
    assert_equal SiteParts.starter("footer"), SiteParts.live.fetch("footer").document
  end

  test "a part's draft is saved with the part's rule: a form in it is refused" do
    footer = Page.part!("footer")
    document = page_document(title: "Footer", widgets: [ form_block("newsletter") ])

    error = assert_raises(BlockDocument::Invalid) do
      Draft.save_document!(page_id: footer.id, revision: footer.draft.revision, document: document, save_id: "s1")
    end
    assert_equal [ "part" ], error.errors.map(&:keyword)

    page = Page.create_with_draft!(title: "Join", slug: "join")
    Draft.save_document!(page_id: page.id, revision: page.draft.revision, document: document, save_id: "s1")
    assert_equal "form", page.draft.reload.document.dig("sections", 0, "children", 0, "children", 0, "type")
  end
end
