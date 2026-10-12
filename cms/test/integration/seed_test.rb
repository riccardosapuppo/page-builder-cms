require "test_helper"
require Rails.root.join("db", "seeds", "example_site").to_s

# db/seeds.rb, run the way `ruby bin/rails db:seed` runs it, on the test's
# empty database and again on its own result; and the example site it reads
# from ../example-site/, the files the editor's browser demo reads too.
class SeedTest < ActionDispatch::IntegrationTest
  include StoredFiles
  include VisibleText

  def seed = capture_io { Rails.application.load_seed }.first

  def site = JSON.parse(ExampleSite::ROOT.join("site.json").read)

  def stored_pages
    Page.includes(:draft, :published_version).order(:id).to_h { |page| [ page.draft.slug || page.kind, [ page.draft.revision, page.draft.document, page.published_version.document, page.home? ] ] }
  end

  test "db:seed publishes the example site on an empty database, and run again on its own result changes nothing" do
    assert_equal [ 0, 0, 0 ], [ Page.count, MediaItem.count, ActiveStorage::Blob.count ]
    counts = -> { [ Page.count, PageVersion.count, MediaItem.count, ActiveStorage::Blob.count ] }

    said = seed
    first = [ counts.call, stored_pages ]
    said_again = seed

    # Three pages and the header and footer, each published once, besides
    # the automatic version of each page's save.
    assert_equal [ 5, 8, 9, 9 ], first[0]
    assert_equal first, [ counts.call, stored_pages ]
    assert_equal %w[home winter-series notices header footer], first[1].keys
    assert_equal SiteParts.starter("header"), first[1]["header"][2], "the header published is its starter, the example site's own"
    assert_no_match(/left as it is/, said)
    assert_equal 5, said_again.scan(/already there, left as it is/).size, said_again

    { "/" => "Swim at slack water", "/winter-series" => "Winter series", "/notices" => "Notices" }.each do |path, heading|
      get path
      assert_response :ok
      assert_select "main h1", text: heading
    end
    get "/"
    assert_equal 6, css_select("main [data-block-type=gallery] img").size
    assert_select "header.sw-header .w-logo-link span", text: "Slack Water"
    assert_select "footer.sw-footer strong", text: "Slack Water swimming club."
  end

  # One place for both engines: what the CMS stores is the file, with each
  # image id of site.json become the public id the library gave its upload.
  test "each page is published as its file in example-site, each image named by its upload's public id, with site.json's alt" do
    seed
    uploads = MediaItem.includes(file_attachment: :blob).to_h { |item| [ item.file.filename.to_s, item ] }
    ids = site["images"].to_h { |image| [ image["id"], uploads.fetch(File.basename(image["file"])).public_id ] }

    site["pages"].each do |entry|
      expected = ExampleSite.with_library_ids(JSON.parse(ExampleSite::ROOT.join(entry["file"]).read), ids, entry["file"])
      page = Draft.find_by!(slug: entry["slug"]).page
      assert_equal expected, page.published_version.document, entry["file"]
      assert_equal expected, page.draft.document, entry["file"]
      assert_equal entry["home"], page.home?, entry["slug"]
    end
    assert_equal site["images"].to_h { |image| [ File.basename(image["file"]), image["alt"] ] }, uploads.transform_values(&:alt)
  end

  test "/notices serves what breaks the usual assumptions: four columns, a word longer than a line, emoji, nested lists, a long alt, right-to-left text" do
    seed

    get "/notices"
    assert_response :ok
    html = Nokogiri::HTML5(response.body)
    text = visible_text(response.body)
    assert_equal "4", html.at_css("[data-block-id=four]")["data-columns"]
    assert_includes text, "Seawaterthermometercalibrationlogbookentriesforthewholewinterseason"
    assert_includes text, "🏊‍♀️"
    assert_equal %w[Arms Shoulders], html.css("[data-block-id=lists-text] ul > li > ol > li > ul > li").map { |li| li.text.strip }, "a bulleted list in a numbered list in a bulleted list"
    assert_operator html.at_css("[data-block-id=four-image] img")["alt"].length, :>, 250
    paragraphs = html.css("[data-block-id=welcome-hebrew] p").map(&:text)
    assert_equal 2, paragraphs.size
    assert_match(/\Aברוכים הבאים לשחיית הבוקר\./, paragraphs[0])
    assert_match(/\Aأهلاً بكم في سباحة الفجر\./, paragraphs[1])
    assert_includes html.at_css("[data-block-id=welcome-questions]").text, "هل أحتاج إلى بدلة غوص؟"
    assert_equal "המזח הצפוני", html.at_css("[data-block-id=welcome-text] strong").text
  end

  test "a page its owner changed since, and the home page moved to another, are left as they are when the seed runs again" do
    seed
    notices = Draft.find_by!(slug: "notices").page
    Draft.save_document!(page_id: notices.id, revision: notices.draft.revision, document: notices.draft.document.merge("title" => "Notices, edited"), save_id: "owner-1")
    notices.publish!
    notices.make_home!
    before = stored_pages

    seed

    assert_equal before, stored_pages
    assert_equal "Notices, edited", Draft.find_by!(slug: "notices").page.published_version.document["title"]
    get "/"
    assert_select "main h1", text: "Notices"
    assert_select "title", text: "Notices, edited"
  end

  # Checked whole before anything is uploaded or saved, so a mistake in
  # these files leaves the database as it was.
  test "an example site the seed cannot read is refused with the file and the reason, and nothing is uploaded or saved" do
    {
      "a page naming an image site.json does not list" => [ "pages/notices.json", ->(text) { text.sub('"mediaId": "m-tea"', '"mediaId": "no-such-image"') },
                                                            'example-site/pages/notices.json names the image "no-such-image", which site.json does not list' ],
      "two home pages" => [ "site.json", ->(text) { text.sub('"home": false', '"home": true') }, "example-site/site.json marks 2 pages as home, not one" ],
      "a file outside the folder" => [ "site.json", ->(text) { text.sub('"pages/notices.json"', '"../README.md"') }, "example-site/site.json has a page it cannot read" ]
    }.each do |what, (file, plant, message)|
      Dir.mktmpdir do |dir|
        root = Pathname(dir).join("example-site")
        FileUtils.cp_r(ExampleSite::ROOT, root)
        planted = plant.call(root.join(file).read)
        refute_equal root.join(file).read, planted, "#{what}: the plant changed nothing"
        root.join(file).write(planted)

        error = assert_raises(ExampleSite::Unreadable, what) { capture_io { ExampleSite.run(root: root) } }
        assert_includes error.message, message, what
      end
      assert_equal [ 0, 0, 0 ], [ Page.count, MediaItem.count, ActiveStorage::Blob.count ], what
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

  # design/index.html#page: the join band is two columns, the heading and
  # its text on the left and the form on the right, with the design's four
  # fields, the box that must be ticked, and "Send request". It was a
  # mailto button here until forms arrived.
  test "the home page's join band is the design's: the heading and text beside a form, and no mailto link" do
    capture_io { ExampleSite.run }
    SubmissionsController::LIMIT_STORE.clear

    get "/"
    band = Nokogiri::HTML5(response.body).at_css("[data-block-id=join]")
    columns = band.css(".cols > .col")

    assert_equal 2, columns.size
    assert_equal [ "Join a trial swim" ], columns[0].css("h2").map(&:text)
    assert_match(/\ATell us a little about your swimming\./, columns[0].at_css("p").text)
    assert_empty columns[0].css("form")
    form = columns[1].at_css("form.sw-form")
    fields = form.css("input:not([type=hidden]):not([name=website]), textarea").map { |control| [ control["name"], control["type"] || control.name, band.at_css("label[for='#{control['id']}']").text, control.key?("required") ] }
    assert_equal [
      [ "answers[name]", "text", "Name", false ],
      [ "answers[email]", "email", "Email", false ],
      [ "answers[notes]", "textarea", "Anything we should know?", false ],
      [ "answers[distance]", "checkbox", "I can swim 200 meters without stopping (required)", true ]
    ], fields
    assert_equal "Send request", form.at_css("button[type=submit]").text
    assert_empty band.css("a[href^=mailto], [data-block-type=button]")

    # The form takes what a visitor sends it: kept, then its confirmation.
    assert_difference -> { Submission.count } => 1 do
      post "/", params: { "form" => "join-form", "answers" => { "name" => "Ann Diver", "distance" => "yes" }, "website" => "" }, headers: { "Origin" => "http://www.example.com" }
    end
    assert_redirected_to "http://www.example.com/sent/join-form"
    get response.location
    assert_select "main", /We reply within two days/
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
