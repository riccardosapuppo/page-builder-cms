require "test_helper"
require Rails.root.join("db", "seeds", "example_site").to_s

# db/seeds.rb, run the way `ruby bin/rails db:seed` runs it, on the test's
# empty database and again on its own result; and the example site it reads
# from ../example-site/, the files the editor's browser demo reads too.
class SeedTest < ActionDispatch::IntegrationTest
  include CollectionCases
  include StoredFiles
  include VisibleText

  def seed = capture_io { Rails.application.load_seed }.first

  def site = JSON.parse(ExampleSite::ROOT.join("site.json").read)

  # A collection made before the seed, so that News is not made with the
  # id site.json gives it, and a list shows which id it names.
  def seed_beside_another
    create_news(prefix: "events")
    seed
    assert_not_equal site["collections"].first["id"], Collection.find_by!(prefix: "news").id
  end

  # Each page by its address, a part by its kind, a template by its
  # collection's prefix.
  def stored_pages
    Page.includes(:draft, :published_version, :collection).order(:id).to_h do |page|
      [ page.draft.slug || (page.collection ? "template of #{page.collection.prefix}" : page.kind), [ page.draft.revision, page.draft.document, page.published_version.document, page.home? ] ]
    end
  end

  def stored_shop = ShopSetting.current.then { |shop| [ shop.settings, shop.changed_at ] }

  def stored_collections
    Collection.includes(:entries).order(:id).to_h do |collection|
      [ collection.prefix, [ collection.definition, collection.published_revision, collection.entries.order(:id).map { |entry| [ entry.draft, entry.published_slug, entry.published_field_values ] } ] ]
    end
  end

  test "db:seed publishes the example site on an empty database, and run again on its own result changes nothing" do
    assert_equal [ 0, 0, 0 ], [ Page.count, MediaItem.count, ActiveStorage::Blob.count ]
    counts = -> { [ Page.count, PageVersion.count, MediaItem.count, ActiveStorage::Blob.count, Collection.count, Entry.count ] }

    said = seed
    first = [ counts.call, stored_pages, stored_collections, stored_shop ]
    said_again = seed

    # News and Club kit made first, each with its template, then five
    # pages and the header and footer, each published once, besides the
    # automatic version of each save of a page or a template; and the
    # collections' nine entries, five stories and four products.
    assert_equal [ 9, 16, 15, 15, 2, 9 ], first[0]
    assert_equal first, [ counts.call, stored_pages, stored_collections, stored_shop ]
    assert_equal [ "template of news", "template of shop", "home", "winter-series", "news", "shop", "notices", "header", "footer" ], first[1].keys
    assert_equal SiteParts.starter("header"), first[1]["header"][2], "the header published is its starter, the example site's own"
    assert_no_match(/left as it is|left as they are/, said)
    assert_equal 9, said_again.scan(/already there, left as it is/).size, said_again
    assert_match %r{News +/news/<slug> +5 of 5 entries published, its template version 2\n}, said
    assert_match %r{News +/news/<slug> +5 of 5 entries published, its template version 2, already there, left as it is\n}, said_again
    assert_match %r{Club kit +/shop/<slug> +4 of 4 entries published, its template version 2\n}, said
    assert_match %r{The shop +/cart +on, in GBP, selling Club kit by its price\n}, said
    assert_match %r{The shop +/cart +on, in GBP, selling Club kit by its price, already set, left as they are\n}, said_again

    { "/" => "Swim at slack water", "/winter-series" => "Winter series", "/news" => "News", "/shop" => "Shop", "/notices" => "Notices",
      "/news/winter-series-starts" => "The winter series starts on 1 November", "/shop/swim-cap" => "Swim cap" }.each do |path, heading|
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
  # image id of site.json become the public id the library gave its upload,
  # and each collection id the id the collection was made with.
  test "each page is published as its file in example-site, each image named by its upload's public id, with site.json's alt, each collection by its own id" do
    seed_beside_another
    uploads = MediaItem.includes(file_attachment: :blob).to_h { |item| [ item.file.filename.to_s, item ] }
    ids = site["images"].to_h { |image| [ image["id"], uploads.fetch(File.basename(image["file"])).public_id ] }
    collections = site["collections"].to_h { |entry| [ entry["id"], Collection.find_by!(prefix: JSON.parse(ExampleSite::ROOT.join(entry["file"]).read).dig("collection", "prefix")).id ] }

    site["pages"].each do |entry|
      expected = ExampleSite.with_collection_ids(ExampleSite.with_library_ids(JSON.parse(ExampleSite::ROOT.join(entry["file"]).read), ids, entry["file"]), collections, entry["file"])
      page = Draft.find_by!(slug: entry["slug"]).page
      assert_equal expected, page.published_version.document, entry["file"]
      assert_equal expected, page.draft.document, entry["file"]
      assert_equal entry["home"], page.home?, entry["slug"]
    end
    news = Draft.find_by!(slug: "news").page.published_version.document
    assert_equal [ Collection.find_by!(prefix: "news").id ], news["sections"].flat_map { |s| s["children"] }.flat_map { |c| c["children"] }.select { |b| b["type"] == "collectionList" }.map { |b| b.dig("props", "collection") }
    assert_equal site["images"].to_h { |image| [ File.basename(image["file"]), image["alt"] ] }, uploads.transform_values(&:alt)
    # The shop's settings as site.json has them, selling the collection
    # its id names, by the id that collection was made with.
    assert_equal site["shop"].merge("productsCollectionId" => collections.fetch(site["shop"]["productsCollectionId"])), ShopSetting.current.settings
    assert_equal "shop", Collection.find(ShopSetting.current.products_collection_id).prefix
  end

  test "the shop is on in pounds, selling Club kit by its price: a product's page draws its price as money and Add to cart, the mug out of stock, the shop's page lists the four, and the footer leads there" do
    seed
    kit = Collection.find_by!(prefix: "shop")
    assert_equal({ "enabled" => true, "currency" => "GBP", "productsCollectionId" => kit.id, "priceField" => "price" }, ShopSetting.current.settings)

    get "/shop/swim-cap"
    assert_select "main [data-field=title] h1", text: "Swim cap"
    assert_select "main [data-field=price] p", text: "£12.00"
    assert_select "main [data-block-id=product-cart] form.sw-cart-add[method=post][action='/cart/items'] input[name=entry][value='#{kit.entries.find_by!(slug: 'swim-cap').id}']"
    assert_select "main [data-block-id=product-image] img[alt='Three swim caps, orange, pink and white, at the waterline']"
    assert_equal [ "Enamel mug", "Tow float" ], css_select("main [data-block-id=more-list] .sw-entry-title a").map(&:text), "the others, by name, two of them"
    get "/shop/enamel-mug"
    assert_select "main [data-field=price] p", text: "£9.50"
    assert_select "main [data-block-id=product-cart] p.sw-btn-off", text: "Out of stock"
    assert_select "main [data-block-id=product-cart] form", 0
    get "/shop"
    assert_equal [ [ "Enamel mug", "£9.50" ], [ "Swim cap", "£12.00" ], [ "Tow float", "£24.00" ], [ "Winter series pass", "£25.00" ] ],
                 css_select("main [data-block-id=kit-list] .sw-entry").map { |card| [ card.at_css(".sw-entry-title a").text, card.at_css(".sw-entry-price").text ] }
    assert_select "main a.sw-btn[href='/cart']", text: "See your cart"
    assert_select "footer.sw-footer .w-menu-links a[href='/shop']", text: "Shop"
    assert_select "header.sw-header a[href='/shop']", 0, "not in the header, whose fold is measured"

    # Turned off by its owner: the seed run again leaves it off.
    ShopSetting.change!(ShopSetting.current.settings.merge("enabled" => false))
    assert_match %r{The shop +/cart +off, already set, left as they are\n}, seed
    assert_equal false, ShopSetting.current.enabled
  end

  test "a collection at the shop's prefix that its owner made with no price is left as it is and sold by no one: the seed says why" do
    Collection.create_with_template!({ "name" => "Merch", "prefix" => "shop", "fields" => [ { "key" => "summary", "label" => "Summary", "type" => "paragraph", "required" => false } ], "sort" => { "by" => "title", "direction" => "asc" } })

    said = seed

    assert_match %r{Merch +/shop/<slug> +0 of 0 entries published, its template not published, already there, left as it is\n}, said
    assert_match %r{The shop +/cart +off, not set: The collection Merch has no number field to be the price\.}, said
    assert_nil ShopSetting.current.changed_at, "the settings were never changed"
    get "/cart"
    assert_response :not_found
  end

  # A site upgraded from before the shop, its page at /cart written as that
  # build kept it, past today's validations (cart_address_test.rb).
  test "a site that has a page at /cart from before the shop keeps it: the seed leaves the shop off and says why" do
    page = Page.create_with_draft!(title: "Old basket", slug: "old-basket")
    page.publish!
    Page.where(id: page.id).update_all(slug: "cart")
    Draft.where(page_id: page.id).update_all(slug: "cart")

    said = seed

    assert_match %r{The shop +/cart +off, not set: The page "Old basket" is at /cart, the address of the shop's cart: give the page another address and publish it before turning the shop on\.\n}, said
    assert_nil ShopSetting.current.changed_at, "the settings were never changed"
    get "/cart"
    assert_response :ok
    assert_select "title", "Old basket"
  end

  test "each collection is made as its file has it: its definition, each entry published with its values and its images by their uploads' ids, in the file's order, and its template published, its list naming the collection" do
    seed_beside_another
    uploads = MediaItem.includes(file_attachment: :blob).to_h { |item| [ item.file.filename.to_s, item ] }
    ids = site["images"].to_h { |image| [ image["id"], uploads.fetch(File.basename(image["file"])).public_id ] }

    site["collections"].each do |listed|
      file = JSON.parse(ExampleSite::ROOT.join(listed["file"]).read)
      collection = Collection.find_by!(prefix: file.dig("collection", "prefix"))
      assert_equal file["collection"], collection.definition, listed["file"]
      expected = file["entries"].map { |entry| ExampleSite.with_library_ids(entry, ids, listed["file"]) }
      entries = collection.entries.order(:id)
      assert_equal expected, entries.map(&:draft), listed["file"]
      assert_equal expected.map { |entry| [ entry["title"], entry["slug"], entry["values"] ] }, entries.map { |entry| [ entry.published_title, entry.published_slug, entry.published_field_values ] }
      template = ExampleSite.with_collection_ids(ExampleSite.with_library_ids(file["template"], ids, listed["file"]), { listed["id"] => collection.id }, listed["file"])
      assert_equal template, collection.template.published_version.document, listed["file"]
      assert_equal template, collection.template.draft.document, listed["file"]
    end

    # Its pages: each entry at its address, drawn with the template; the
    # page at the prefix lists them, newest first, each card leading there.
    get "/news/winter-series-starts"
    assert_select "main [data-field=title] h1", text: "The winter series starts on 1 November"
    assert_select "main [data-field=date] time[datetime='2026-10-14']", text: "14 October 2026"
    assert_equal [ "A rockpool morning for children", "Tea in the hut on Sundays" ], css_select("[data-block-id=more-list] .sw-entry-title a").map(&:text)
    assert_equal [ "2" ], css_select("[data-block-id=more-list]").map { |list| list["data-columns"] }
    get "/news"
    assert_equal %w[/news/winter-series-starts /news/rockpool-morning /news/tea-in-the-hut /news/bright-caps /news/autumn-tide-times], css_select("main .sw-entry-title a").map { |a| a["href"] }
    assert_select "footer.sw-footer .w-menu-links a[href='/news']", text: "News"
  end

  test "a collection its owner changed since is left as it is when the seed runs again, and the page that lists it still names it" do
    seed
    news = Collection.find_by!(prefix: "news")
    news.update_definition!({ "name" => "Club news" })
    entry = news.entries.find_by!(slug: "bright-caps")
    entry.unpublish!
    before = [ stored_pages, stored_collections ]

    seed

    assert_equal before, [ stored_pages, stored_collections ]
    assert_equal [ "Club news", 2, 4 ], [ news.reload.name, Collection.count, news.entries.where.not(published_at: nil).count ]
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
      "a file outside the folder" => [ "site.json", ->(text) { text.sub('"pages/notices.json"', '"../README.md"') }, "example-site/site.json has a page it cannot read" ],
      "a page naming a collection site.json does not list" => [ "pages/news.json", ->(text) { text.sub('"collection": 1', '"collection": 3') },
                                                                 "example-site/pages/news.json names the collection 3, which site.json does not list" ],
      "shop settings naming a collection site.json does not list" => [ "site.json", ->(text) { text.sub('"productsCollectionId": 2', '"productsCollectionId": 3') },
                                                                        "example-site/site.json has shop settings it cannot read" ],
      "shop settings with a member the shop does not take" => [ "site.json", ->(text) { text.sub('"priceField": "price"', '"priceField": "price", "tax": 20') },
                                                                 "example-site/site.json has shop settings it cannot read" ],
      "an entry naming an image site.json does not list" => [ "collections/news.json", ->(text) { text.sub('"mediaId": "m-tea"', '"mediaId": "no-such-image"') },
                                                              'example-site/collections/news.json names the image "no-such-image", which site.json does not list' ],
      "a template naming a collection site.json does not list" => [ "collections/news.json", ->(text) { text.sub('"collection": 1', '"collection": 7') },
                                                                     "example-site/collections/news.json names the collection 7, which site.json does not list" ],
      "a collection file outside the folder" => [ "site.json", ->(text) { text.sub('"collections/news.json"', '"../README.md"') }, "example-site/site.json has a collection it cannot read" ],
      "a collection file of another shape" => [ "collections/news.json", ->(text) { text.sub('"entries":', '"items":') },
                                                "example-site/collections/news.json has the keys [\"collection\", \"items\", \"template\"], not collection, entries and template" ]
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
      assert_equal [ 0, 0, 0, 0 ], [ Page.count, MediaItem.count, ActiveStorage::Blob.count, Collection.count ], what
    end
  end

  # The classes only: what they draw (column widths, a palette colour, a
  # type size, reflow, focus rings) is measured in a browser by
  # tools/check-production.ts, since a theme rule that outweighs a token
  # class would leave these classes in place and the layout wrong.
  test "the home page carries the classes of its layout: the bands in order, their colours and space, the widths and the crops" do
    capture_io { ExampleSite.run }

    get "/"

    classes = ->(selector) { css_select(selector).first["class"].split }
    bands = %w[hero course marks swims winter gallery meet questions close]
    assert_equal bands, css_select("main > section[data-block-id]").map { |band| band["data-block-id"] }
    assert_equal({
      "hero" => %w[bg-text space-above-l phone-space-above-m space-below-section-s phone-space-below-xxl],
      "course" => %w[space-above-section-s space-below-m],
      "marks" => %w[space-above-none space-below-section-s],
      "swims" => %w[bg-soft space-above-section-s space-below-section-s],
      "winter" => %w[space-above-section-s space-below-section-s],
      "gallery" => %w[bg-soft space-above-section-s space-below-section-s],
      "meet" => %w[bg-text space-above-section-s space-below-section-s],
      "questions" => %w[space-above-section-s space-below-section-s],
      "close" => %w[bg-text space-above-section-l space-below-section-l]
    }, bands.to_h { |id| [ id, classes.call("[data-block-id=#{id}]").grep(/\A(?:phone-)?(?:bg|space-above|space-below)-/) ] })
    assert_includes classes.call("[data-block-id=hero] > .cols"), "widths-2-1"
    assert_includes classes.call("[data-block-id=swims] > .cols"), "widths-2-3"
    assert_includes classes.call("[data-block-id=winter] > .cols"), "widths-3-2"
    assert_includes classes.call("[data-block-id=marks] > .cols"), "cols-4"
    assert_equal %w[aspect-original], classes.call("[data-block-id=hero-image]").grep(/aspect/)
    # The course on one waterline: the panorama on desktops and tablets,
    # each mark's own picture on phones, its number in the headings' face.
    assert_equal %w[aspect-original hide-phone], classes.call("[data-block-id=course-image]").grep(/\A(?:aspect|hide)-/)
    %w[shallows red-can green-cone buoy-line].each do |mark|
      assert_equal %w[aspect-3-2 hide-desktop hide-tablet], classes.call("[data-block-id=mark-#{mark}-image]").grep(/\A(?:aspect|hide)-/), mark
      assert_equal %w[size-display face-heading fg-primary], classes.call("[data-block-id=mark-#{mark}-number]").grep(/\A(?:size|face|fg)-/), mark
    end
  end

  # The trial swim's form works in the first band: the title, its words and
  # the waterline on the left, and on the right a paper card holding the
  # form's heading, its words, the four fields, the box that must be ticked
  # and "Send request". It was a mailto button here until forms arrived,
  # and a band at the foot of the page until the buoy line's world.
  test "the home page's first band holds the trial swim's form beside the title, in a paper card, and no mailto link" do
    capture_io { ExampleSite.run }
    SubmissionsController::LIMIT_STORE.clear

    get "/"
    band = Nokogiri::HTML5(response.body).at_css("[data-block-id=hero]")
    columns = band.css(".cols > .col")

    assert_equal 2, columns.size
    assert_equal [ "Swim at slack water" ], columns[0].css("h1").map(&:text)
    assert_empty columns[0].css("form")
    assert_includes columns[1]["class"].split, "bg-background"
    assert_equal [ "Join a trial swim" ], columns[1].css("h2").map(&:text)
    assert_match(/\ATell us a little about your swimming\./, columns[1].at_css("p").text)
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

    paths = %w[/ /winter-series /news /shop /notices] + Entry.includes(:collection).order(:id).map { |entry| "/#{entry.collection.prefix}/#{entry.published_slug}" } + %w[/no-such-page]
    found = paths.to_h do |path|
      get path
      [ path, brands_in(response.body) ]
    end

    assert_equal 404, response.status
    assert_equal 15, found.size
    assert_equal paths.to_h { |path| [ path, [] ] }, found
    get "/"
    assert_includes visible_text(response.body), "Loads a video from the provider when you click."
  end

  # `npm start -- --empty`: the seed with EMPTY_SITE=1, on the test's empty
  # database and again on its own result.
  test "with EMPTY_SITE=1, db:seed makes a site with nothing in it: no page or image, the header and footer published with no section, drawn on no page" do
    ENV["EMPTY_SITE"] = "1"
    said = seed
    first = [ Page.count, PageVersion.count, MediaItem.count, ActiveStorage::Blob.count ]
    said_again = seed

    assert_equal [ 2, 4, 0, 0 ], first, "the header and footer, each with the automatic version of its emptied draft and its publish, and nothing else"
    assert_equal first, [ Page.count, PageVersion.count, MediaItem.count, ActiveStorage::Blob.count ]
    Page.parts!.each do |part|
      assert_predicate part, :published?, part.kind
      assert_equal [], part.published_version.document["sections"], part.kind
      assert_equal [], part.draft.document["sections"], part.kind
    end
    assert_match "Seeding an empty site, with no page:", said
    assert_equal 2, said.scan(/published with no section/).size, said
    assert_equal 2, said_again.scan(/already published, left as it is/).size, said_again

    get "/"
    assert_response :not_found
    assert_select "header.sw-header", 0
    assert_select "footer.sw-footer", 0
  ensure
    ENV.delete("EMPTY_SITE")
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
