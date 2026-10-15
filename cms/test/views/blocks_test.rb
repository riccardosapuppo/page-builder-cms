require "test_helper"

# The block partials, read the way a browser reads their output.
class BlocksTest < ActionView::TestCase
  helper BlocksHelper
  helper RichTextHelper

  MEDIA = ->(id) { id == "gone" ? nil : MediaResolver::Image.new(src: "/media/#{id}.png", width: 800, height: 600) }

  def block(id, type, props = {}, style: { "base" => {} }, children: [])
    { "id" => id, "type" => type, "props" => props, "style" => style, "children" => children }
  end

  def page(*widgets, section_style: { "base" => {} }, column_style: { "base" => {} })
    { "schemaVersion" => 1, "title" => "Test", "sections" => [ block("s1", "section", {}, style: section_style, children: [ block("c1", "column", {}, style: column_style, children: widgets) ]) ] }
  end

  def html_of(document)
    Nokogiri::HTML5.fragment(render_document(document, media: MEDIA))
  end

  def attributes(node, *names)
    names.map { |name| node[name] }
  end

  def every_widget
    [
      block("w-heading", "heading", { "level" => 2, "text" => "From the water" }),
      block("w-text", "text", { "doc" => { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [ { "type" => "text", "text" => "Hello" } ] } ] } }),
      block("w-image", "image", { "mediaId" => "hero", "alt" => "The bay" }),
      block("w-button", "button", { "label" => "Join", "href" => "#join" }),
      block("w-divider", "divider"),
      block("w-spacer", "spacer", { "size" => "l" }),
      block("w-gallery", "gallery", { "items" => [ { "mediaId" => "g1", "alt" => "One" }, { "url" => "https://images.example.org/two.jpg", "alt" => "Two" } ] }),
      block("w-video", "video", { "provider" => "youtube", "videoId" => "M7lc1UVf-VE", "title" => "Watch a dawn swim" }),
      block("w-map", "map", { "latitude" => 54.5, "longitude" => -3.25, "zoom" => 15, "label" => "Meeting point" }),
      block("w-iconbox", "iconbox", { "icon" => "sunrise", "title" => "Dawn swims", "text" => "Twice a week." }),
      block("w-quote", "quote", { "text" => "Cold water, hot tea.", "attribution" => "A member" }),
      block("w-accordion", "accordion", { "items" => [ { "question" => "How cold?", "answer" => "Cold." }, { "question" => "Wetsuit?", "answer" => "No." } ] }),
      block("w-stats", "stats", { "items" => [ { "value" => "12", "label" => "Years on the water" }, { "value" => "300+", "label" => "Swimmers each season" } ] }),
      block("w-steps", "steps", { "items" => [ { "title" => "Get in touch", "text" => "Tell us when." }, { "title" => "Try it", "text" => "Come along once." } ] }),
      block("w-form", "form", { "items" => FORM_FIELDS, "submitLabel" => "Send request", "confirmation" => "Thank you." }),
      block("w-logo", "logo", { "name" => "Slack Water" }),
      block("w-menu", "menu", { "label" => "Main", "items" => [ { "label" => "Swims", "href" => "/#swims" }, { "label" => "Gallery", "href" => "/#gallery" } ] })
    ]
  end

  FORM_FIELDS = [
    { "name" => "name", "kind" => "text", "label" => "Name", "required" => true, "maxLength" => 100 },
    { "name" => "email", "kind" => "email", "label" => "Email", "required" => false },
    { "name" => "notes", "kind" => "textarea", "label" => "Anything we should know?", "required" => false, "maxLength" => 1000 },
    { "name" => "distance", "kind" => "checkbox", "label" => "I can swim 200 meters", "required" => true }
  ].freeze

  def form_html(answer: nil)
    form = block("f", "form", { "items" => FORM_FIELDS, "submitLabel" => "Send request", "confirmation" => "Thank you." })
    Nokogiri::HTML5.fragment(render(partial: "blocks/form", locals: { block: form, media: MEDIA, answer: answer }))
  end

  # The control a label names, found as a browser ties them: by the
  # label's for, the id of one element.
  def labelled(html, text)
    label = html.css("label").find { |l| l.text == text }
    assert label, "no label reads #{text.inspect}"
    controls = html.css("input, textarea").select { |c| c["id"] == label["for"] }
    assert_equal 1, controls.size, "the label #{text.inspect} names #{controls.size} controls"
    controls.first
  end

  test "every block of every type has a root that names its id and its type, in document order" do
    html = html_of(page(*every_widget))

    roots = html.css("[data-block-type]")
    assert_equal %w[section column heading text image button divider spacer gallery video map iconbox quote accordion stats steps form logo menu], roots.map { |r| r["data-block-type"] }
    assert_equal %w[s1 c1] + every_widget.map { |w| w["id"] }, roots.map { |r| r["data-block-id"] }
  end

  test "style tokens become classes, overrides become device classes, and data-style repeats what is stored" do
    heading = block("h", "heading", { "level" => 1, "text" => "Swim" },
                    style: { "base" => { "textSize" => "display", "align" => "center" }, "phone" => { "textSize" => "heading-1" } })
    html = html_of(page(heading, column_style: { "base" => { "spaceInside" => "none", "verticalAlign" => "bottom" }, "tablet" => { "spaceInside" => "l" } }))

    root = html.at_css("[data-block-id=h]")
    assert_equal %w[w w-heading size-display phone-size-heading-1 align-center], root["class"].split
    assert_equal "base.align=center;base.textSize=display;phone.textSize=heading-1", root["data-style"]
    column = html.at_css("[data-block-id=c1]")
    assert_equal %w[col pad-none tablet-pad-l valign-bottom], column["class"].split
  end

  test "a heading takes its level's step unless its style names another" do
    html = html_of(page(block("a", "heading", { "level" => 1, "text" => "A" }), block("b", "heading", { "level" => 4, "text" => "B" })))

    assert_includes html.at_css("[data-block-id=a]")["class"].split, "size-heading-1"
    assert_includes html.at_css("[data-block-id=b]")["class"].split, "size-large"
    assert_nil html.at_css("[data-block-id=a]")["data-style"]
  end

  test "a section's columns take their preset widths only when it has one part per column" do
    column = ->(id) { block(id, "column") }
    document = { "schemaVersion" => 1, "title" => "Widths", "sections" => [
      block("two", "section", { "columnWidths" => "3:2" }, children: [ column.call("two-1"), column.call("two-2") ]),
      block("three", "section", { "columnWidths" => "1:2:1" }, children: [ column.call("three-1"), column.call("three-2"), column.call("three-3") ]),
      block("misfit", "section", { "columnWidths" => "2:1:1" }, children: [ column.call("misfit-1"), column.call("misfit-2") ]),
      block("one", "section", { "columnWidths" => "3:2" }, children: [ column.call("one-1") ])
    ] }

    html = html_of(document)

    grids = %w[two three misfit one].map { |id| html.at_css("[data-block-id=#{id}] > .cols")["class"].split }
    assert_equal [ %w[sw-inner cols cols-2 widths-3-2], %w[sw-inner cols cols-3 widths-1-2-1], %w[sw-inner cols cols-2], %w[sw-inner cols cols-1] ], grids
    assert_equal [ "3:2", "1:2:1", nil, nil ], %w[two three misfit one].map { |id| html.at_css("[data-block-id=#{id}]")["data-column-widths"] }
  end

  test "a section's columns fit what they hold where a preset names fit, and stack on phones only or never where the section says, with two columns or more" do
    column = ->(id) { block(id, "column") }
    document = { "schemaVersion" => 1, "title" => "Fit and stack", "sections" => [
      block("bar", "section", { "columnWidths" => "fit:1:fit", "stack" => "never" }, children: [ column.call("bar-1"), column.call("bar-2"), column.call("bar-3") ]),
      block("pair", "section", { "columnWidths" => "1:fit", "stack" => "phone" }, children: [ column.call("pair-1"), column.call("pair-2") ]),
      block("plain", "section", {}, children: [ column.call("plain-1"), column.call("plain-2") ]),
      block("alone", "section", { "stack" => "never" }, children: [ column.call("alone-1") ]),
      block("odd", "section", { "stack" => "sometimes" }, children: [ column.call("odd-1"), column.call("odd-2") ])
    ] }

    html = html_of(document)

    grids = %w[bar pair plain alone odd].map { |id| html.at_css("[data-block-id=#{id}] > .cols")["class"].split }
    assert_equal [ %w[sw-inner cols cols-3 widths-fit-1-fit stack-never], %w[sw-inner cols cols-2 widths-1-fit stack-phone], %w[sw-inner cols cols-2],
                   %w[sw-inner cols cols-1], %w[sw-inner cols cols-2] ], grids
    assert_equal [ "never", "phone", nil, nil, nil ], %w[bar pair plain alone odd].map { |id| html.at_css("[data-block-id=#{id}]")["data-stack"] }
  end

  test "a logo with a name is one link home, the theme's mark and the name; without one, the mark alone, which the block hides from a screen reader" do
    html = html_of(page(block("named", "logo", { "name" => "Slack Water" }), block("bare", "logo")))

    named = html.at_css("[data-block-id=named]")
    assert_equal %w[w w-logo], named["class"].split
    assert_nil named["aria-hidden"]
    link = named.at_css("> a.w-logo-link")
    assert_equal "/", link["href"]
    assert_equal "Slack Water", link.at_css("> span").text
    assert link.at_css("> svg.sw-brand-mark"), "the mark, inside the link"
    bare = html.at_css("[data-block-id=bare]")
    assert_equal "true", bare["aria-hidden"], "the block, hidden as a whole"
    assert_nil bare.at_css("a")
    mark = bare.at_css("> svg.sw-brand-mark")
    assert mark, "the mark alone"
    assert_equal "true", mark["aria-hidden"]
  end

  test "a menu is a named navigation of its links, and Menu, the sheet they fold into, named on the block by the step its words need" do
    links = [ { "label" => "Swims", "href" => "/#swims" }, { "label" => "Gallery", "href" => "/#gallery" }, { "label" => "Meet us", "href" => "/#meet" }, { "label" => "Questions", "href" => "/#questions" } ]
    html = html_of(page(block("m", "menu", { "label" => "Main", "items" => links }), block("unnamed", "menu", { "label" => "", "items" => links.first(1) })))

    menu = html.at_css("[data-block-id=m]")
    assert_equal HeaderFit.menu_fold(links.map { |l| l["label"] }), menu["data-fold"]
    assert_equal "360", menu["data-fold"]
    nav = menu.at_css("> nav")
    assert_equal "Main", nav["aria-label"]
    assert_equal links.map { |l| [ l["label"], l["href"] ] }, nav.css("> .w-menu-links > a").map { |a| [ a.text, a["href"] ] }
    fold = nav.at_css("> details.w-menu-fold")
    assert_equal "Menu", fold.at_css("> summary.sw-menu-button .w-menu-word").text
    assert_equal links.map { |l| l["href"] }, fold.css("> .sw-menu-sheet > a").map { |a| a["href"] }
    assert_equal "Menu", html.at_css("[data-block-id=unnamed] > nav")["aria-label"]
  end

  test "a menu leaves out a link RenderPolicy refuses, and with none left has no Menu to open and nothing to fold" do
    html = html_of(page(block("some", "menu", { "label" => "Main", "items" => [ { "label" => "Run", "href" => "javascript:alert(1)" }, { "label" => "Swims", "href" => "/#swims" } ] }),
                        block("none", "menu", { "label" => "Main", "items" => [ { "label" => "Run", "href" => "javascript:alert(1)" } ] })))

    assert_equal [ "Swims" ], html.css("[data-block-id=some] .w-menu-links a").map(&:text)
    none = html.at_css("[data-block-id=none]")
    assert_empty none.css(".w-menu-links a")
    assert_nil none.at_css(".w-menu-fold")
    assert_nil none["data-fold"]
  end

  test "an image is cropped per device by class, and a crop the schema does not list gives none" do
    html = html_of(page(
      block("a", "image", { "mediaId" => "hero", "alt" => "Bay" }, style: { "base" => { "aspect" => "1:1" }, "tablet" => { "aspect" => "16:9" }, "phone" => { "aspect" => "5:4" } }),
      block("b", "image", { "mediaId" => "hero", "alt" => "Bay" }, style: { "base" => { "aspect" => "21:9" }, "phone" => { "aspect" => "original" } })
    ))

    assert_equal %w[w w-image aspect-1-1 tablet-aspect-16-9 phone-aspect-5-4], html.at_css("[data-block-id=a]")["class"].split
    assert_equal "base.aspect=1:1;tablet.aspect=16:9;phone.aspect=5:4", html.at_css("[data-block-id=a]")["data-style"]
    assert_equal %w[w w-image phone-aspect-original], html.at_css("[data-block-id=b]")["class"].split
  end

  test "a block hidden on one device carries the class that hides it there only" do
    html = html_of(page(block("x", "divider", {}, style: { "base" => { "visibility" => "hidden" }, "tablet" => { "visibility" => "visible" } })))

    assert_equal %w[w w-divider hide-desktop hide-phone], html.at_css("[data-block-id=x]")["class"].split
  end

  test "a value the schema does not list never becomes a class" do
    html = html_of(page(block("x", "heading", { "level" => 2, "text" => "T" }, style: { "base" => { "textSize" => "huge onclick", "color" => "primary" } })))

    assert_equal %w[w w-heading size-heading-2 fg-primary], html.at_css("[data-block-id=x]")["class"].split
  end

  test "the accordion is details and summary, the first one open, and needs no script" do
    html = html_of(page(every_widget.find { |w| w["type"] == "accordion" }))

    details = html.css("[data-block-type=accordion] details")
    assert_equal [ "How cold?", "Wetsuit?" ], details.map { |d| d.at_css("summary").text }
    assert_equal [ true, false ], details.map { |d| d.key?("open") }
    assert_empty html.css("script")
  end

  test "the stats are one description list, each figure its label then its value, and an item that is no object is left out" do
    items = [ { "value" => "12", "label" => "Years on the water" }, "300+", nil, { "value" => "98%", "label" => "Who would come back" }, { "value" => 7 } ]
    style = { "base" => { "color" => "#1d4e6f", "align" => "center" }, "phone" => { "color" => "accent", "align" => "left", "visibility" => "hidden" } }
    html = html_of(page(block("st", "stats", { "items" => items }, style: style)))

    root = html.at_css("[data-block-id=st]")
    assert_equal %w[w w-stats sw-stats phone-fg-accent align-center phone-align-left hide-phone], root["class"].split
    assert_equal "#1d4e6f", root["data-fg"]
    assert_equal %w[dl], root.element_children.map(&:name)
    figures = root.css("dl > div")
    assert_equal [ %w[dt dd] ] * 3, figures.map { |figure| figure.element_children.map(&:name) }
    assert_equal [ [ "Years on the water", "12" ], [ "Who would come back", "98%" ], [ "", "" ] ], figures.map { |figure| [ figure.at_css("dt").text, figure.at_css("dd").text ] }
    assert_empty html.css("script")
  end

  test "the steps are one ordered list, each step its title then its text with its line breaks, the number left to the stylesheet, and an item that is no object is left out" do
    items = [ { "title" => "Get in touch", "text" => "Tell us when.\nOr write." }, "Try it", nil, { "title" => "Join", "text" => "Stay on." }, { "title" => 7 } ]
    style = { "base" => { "color" => "#1d4e6f" }, "tablet" => { "color" => "accent" }, "phone" => { "visibility" => "hidden" } }
    html = html_of(page(block("sp", "steps", { "items" => items }, style: style)))

    root = html.at_css("[data-block-id=sp]")
    assert_equal %w[w w-steps sw-steps tablet-line-accent hide-phone], root["class"].split
    assert_equal "#1d4e6f", root["data-line"]
    assert_equal %w[ol], root.element_children.map(&:name)
    steps = root.css("ol > li")
    assert_equal [ %w[h3 p] ] * 3, steps.map { |step| step.element_children.map(&:name) }
    assert_equal [ [ "Get in touch", "Tell us when.Or write." ], [ "Join", "Stay on." ], [ "", "" ] ], steps.map { |step| [ step.at_css("h3").text, step.at_css("p").text ] }
    assert_equal 1, steps.first.css("p br").size
    # No number is written: the counter is the stylesheet's.
    assert_no_match(/\d/, root.at_css("ol").text)
    assert_empty html.css("script")
  end

  test "the form posts to the page's own address, each field tied to its label, the required ones said and checked by the browser" do
    html = form_html
    form = html.at_css("[data-block-type=form] form.sw-form")

    assert_equal "post", form["method"]
    assert_not form.key?("action"), "a form is sent to the page's own address"
    assert_equal [ %w[form f] ], form.css("input[type=hidden]").map { |i| [ i["name"], i["value"] ] }
    name = labelled(html, "Name (required)")
    assert_equal [ "answers[name]", "text", "100", true ], [ name["name"], name["type"], name["maxlength"], name.key?("required") ]
    email = labelled(html, "Email")
    assert_equal [ "answers[email]", "email", "254", false, "email" ], [ email["name"], email["type"], email["maxlength"], email.key?("required"), email["autocomplete"] ]
    notes = labelled(html, "Anything we should know?")
    assert_equal [ "textarea", "answers[notes]", "1000", false ], [ notes.name, notes["name"], notes["maxlength"], notes.key?("required") ]
    box = labelled(html, "I can swim 200 meters (required)")
    assert_equal [ "answers[distance]", "checkbox", "yes", true, nil ], [ box["name"], box["type"], box["value"], box.key?("required"), box["maxlength"] ]
    assert_equal "Send request", form.at_css("button[type=submit]").text
    # Nothing tells a screen reader of a refusal the page has not had.
    assert_empty html.css("[aria-describedby], [aria-invalid], .sw-field-error")
    assert_empty html.css("script")
  end

  test "the field for robots is hidden from people and from screen readers, and takes no focus" do
    trap = form_html.at_css(".sw-trap")

    assert_equal "true", trap["aria-hidden"]
    assert_equal [ [ "website", "-1", "off" ] ], trap.css("input").map { |i| [ i["name"], i["tabindex"], i["autocomplete"] ] }
  end

  test "a refused form, drawn again, keeps what was written and ties each refusal to its field" do
    html = form_html(answer: {
      "values" => { "name" => "Ann <b>", "email" => "ann@", "notes" => "\nFirst line</textarea><b>x</b><script>y</script>\nsecond", "distance" => true },
      "errors" => { "email" => "Enter an email address, like name@example.org.", "distance" => "Tick this box to send the form." }
    })

    email = labelled(html, "Email")
    assert_equal "ann@", email["value"]
    assert_equal "true", email["aria-invalid"]
    message = html.css("[id]").find { |e| e["id"] == email["aria-describedby"] }
    assert_equal "Enter an email address, like name@example.org.", message&.text
    box = labelled(html, "I can swim 200 meters (required)")
    assert box.key?("checked")
    assert_equal "Tick this box to send the form.", html.css("[id]").find { |e| e["id"] == box["aria-describedby"] }&.text
    # What the visitor wrote comes back as text, line breaks and all; a
    # field with no refusal is not marked. Markup in an attribute's value
    # is never an element (Rails always escapes the quotes there), so the
    # one that can become one is the textarea's text: the answer closes the
    # textarea and opens a b and a script, which stay text, whole.
    name = labelled(html, "Name (required)")
    assert_equal [ "Ann <b>", nil, nil ], [ name["value"], name["aria-invalid"], name["aria-describedby"] ]
    assert_equal "\nFirst line</textarea><b>x</b><script>y</script>\nsecond", labelled(html, "Anything we should know?").text
    assert_empty html.css("b, script")
  end

  test "a page drawn with a visitor's answers gives each form its own, down through its section and column, and is never cached" do
    other = block("other", "form", { "items" => FORM_FIELDS, "submitLabel" => "Send", "confirmation" => "Thank you." })
    document = page(block("f", "form", { "items" => FORM_FIELDS, "submitLabel" => "Send request", "confirmation" => "Thank you." }), other)
    answers = { "f" => { "values" => { "email" => "ann@" }, "errors" => { "email" => "Enter an email address, like name@example.org." } } }
    html = Nokogiri::HTML5.fragment(render_document(document, media: MEDIA, answers: answers))

    assert_equal [ "ann@", nil ], html.css("input[name='answers[email]']").map { |input| input["value"] }
    assert_equal [ "f:email:error" ], html.css(".sw-field-error").map { |p| p["id"] }
    error = assert_raises(ArgumentError) { render_document(document, media: MEDIA, cached: true, answers: answers) }
    assert_equal "a page drawn with a visitor's answers is never cached", error.message
  end

  test "the video and the map are closed details holding a lazy frame, and nothing else names the provider" do
    html = html_of(page(*every_widget))

    { "video" => "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE", "map" => "https://www.openstreetmap.org/export/embed.html?" }.each do |type, src|
      embed = html.at_css("[data-block-type=#{type}] details.sw-embed")
      assert embed, type
      assert_not embed.key?("open"), "#{type} starts open"
      frame = embed.at_css("iframe")
      assert_equal "lazy", frame["loading"], type
      assert frame["src"].start_with?(src), frame["src"]
      assert frame["title"].present?, type
    end
    addresses = html.css("[src], [href]").map { |node| node["src"] || node["href"] }
    assert_equal 2, addresses.count { |a| a.include?("youtube") || a.include?("openstreetmap") }, addresses.inspect
    assert_equal [ "Watch a dawn swim", "Loads a video from the provider when you click.", "Playing from the provider. Click here to close it." ],
                 html.css("[data-block-type=video] .sw-embed-bar > *").map(&:text)
    assert_equal "youtube", html.at_css("[data-block-type=video]")["data-provider"]
  end

  test "library images get their size; others keep their url; decorative ones an empty alt; a missing one nothing" do
    html = html_of(page(
      block("a", "image", { "mediaId" => "hero", "alt" => "The bay" }),
      block("b", "image", { "url" => "https://images.example.org/b.jpg", "alt" => "Buoys" }),
      block("c", "image", { "mediaId" => "hero", "decorative" => true }),
      block("d", "image", { "mediaId" => "gone", "alt" => "Deleted" }),
      block("e", "image", { "url" => "javascript:alert(1)", "alt" => "Bad" })
    ))

    img = ->(id) { html.at_css("[data-block-id=#{id}] img") }
    assert_equal [ "/media/hero.png", "800", "600", "The bay" ], attributes(img.call("a"), "src", "width", "height", "alt")
    assert_equal [ "https://images.example.org/b.jpg", nil, "Buoys" ], attributes(img.call("b"), "src", "width", "alt")
    assert_equal "", img.call("c")["alt"]
    assert_nil img.call("d")
    assert_nil img.call("e")
    assert_equal "hero", html.at_css("[data-block-id=a]")["data-media-id"]
  end

  test "an address RenderPolicy refuses leaves the label or the heading without a link" do
    html = html_of(page(
      block("b", "button", { "label" => "Click", "href" => "javascript:alert(1)" }),
      block("h", "heading", { "level" => 2, "text" => "Title", "href" => "//evil.example" })
    ))

    button = html.at_css("[data-block-id=b] .sw-btn")
    assert_equal [ "a", "Click", nil ], [ button.name, button.text, button["href"] ]
    assert_nil html.at_css("[data-block-id=h] a")
    assert_equal "Title", html.at_css("[data-block-id=h] h2").text
  end

  test "the tree stays strict: a widget outside a column, a section inside one, or an unknown type is left out" do
    stray = block("stray", "heading", { "level" => 2, "text" => "Stray" })
    document = page(block("inner", "section"), block("odd", "carousel"), block("ok", "divider"))
    document["sections"] << stray
    document["sections"].first["children"] << stray

    html = html_of(document)

    assert_equal %w[s1 c1 ok], html.css("[data-block-id]").map { |r| r["data-block-id"] }
  end

  test "an icon box draws its icon inline from the sprite, and an unknown name draws none" do
    html = html_of(page(block("a", "iconbox", { "icon" => "pin", "title" => "Meet", "text" => "Here." }),
                        block("b", "iconbox", { "icon" => "<svg onload=x>", "title" => "Odd", "text" => "No icon." })))

    svg = html.at_css("[data-block-id=a] svg.sw-icon")
    assert_equal [ "0 0 40 40", "true" ], attributes(svg, "viewBox", "aria-hidden")
    assert_equal SiteIcons["pin"].shapes.size, svg.element_children.size
    assert_nil html.at_css("[data-block-id=b] svg")
    assert_nil html.at_css("[data-block-id=b]")["data-icon"]
  end

  test "markup in any text the author typed reaches the visitor as text, never as an element" do
    trap = %(<b class="x">bold</b><img src=x onerror=alert(1)>)
    html = html_of(page(
      block("h", "heading", { "level" => 2, "text" => trap }),
      block("t", "text", { "doc" => { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [ { "type" => "text", "text" => trap } ] } ] } }),
      block("b", "button", { "label" => trap, "href" => "/" }),
      block("i", "iconbox", { "icon" => "cup", "title" => trap, "text" => trap }),
      block("q", "quote", { "text" => trap, "attribution" => trap }),
      block("a", "accordion", { "items" => [ { "question" => trap, "answer" => trap } ] }),
      block("s", "stats", { "items" => [ { "value" => trap, "label" => trap } ] }),
      block("sp", "steps", { "items" => [ { "title" => trap, "text" => trap }, { "title" => trap, "text" => trap } ] }),
      block("v", "video", { "provider" => "vimeo", "videoId" => "76979871", "title" => trap }),
      block("m", "map", { "latitude" => 1, "longitude" => 2, "zoom" => 3, "label" => trap }),
      block("p", "image", { "mediaId" => "hero", "alt" => trap }),
      block("f", "form", { "items" => [ { "name" => "n", "kind" => "text", "label" => trap, "required" => true, "maxLength" => 10 } ], "submitLabel" => trap, "confirmation" => trap })
    ))

    assert_empty html.css("b, [onerror]")
    assert_equal [ "hero.png" ], html.css("img").map { |img| img["src"].split("/").last }
    %w[h t b i q a s sp v m f].each { |id| assert_includes html.at_css("[data-block-id=#{id}]").text, trap, id }
    assert_equal trap, html.at_css("[data-block-id=p] img")["alt"]
  end

  test "no block writes an inline style, which the pages' Content-Security-Policy would block" do
    html = render_document(page(*every_widget), media: MEDIA)

    assert_no_match(/\sstyle=/, html)
  end
end
