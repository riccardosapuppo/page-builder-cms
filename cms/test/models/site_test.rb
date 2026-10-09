require "test_helper"

class SiteTest < ActiveSupport::TestCase
  AT = Time.utc(2026, 10, 9, 8, 0, 0)

  def changed(**changes)
    Site.defaults.merge(changes.transform_keys(&:to_s))
  end

  def stored_rows
    Site.connection.select_value("SELECT COUNT(*) FROM sites")
  end

  test "until it is changed, the header and footer are config/site.yml's, at revision 0, with no row" do
    site = Site.current

    assert_not site.persisted?
    assert_equal 0, site.revision
    assert_equal "Slack Water", site.name
    assert_equal [ "Swims", "/#swims" ], site.menu.first.values_at("label", "href")
    assert_equal({ "label" => "Join", "href" => "/#join" }, site.action)
    assert_equal({ "lead" => "Slack Water swimming club.", "text" => "Tide times are a guide, not a promise." }, site.footer)
    assert site.valid?
    assert_equal 0, stored_rows
  end

  test "config/site.yml's header and footer pass the rules a change from the editor is held to" do
    assert_nothing_raised { Site.check_defaults! }
  end

  test "defaults that break those rules are refused, each value named, so the CMS does not start on them" do
    bad = {
      name: "A name far too long for a phone's header",
      menu: [ { label: "Script", href: "javascript:alert(1)" } ],
      action: { label: "Join" },
      footer: { lead: "Lead.", text: "Text." },
      time_zone: "Europe/London"
    }

    error = assert_raises(Site::Invalid) { Site.check_defaults!(bad) }

    assert_equal [ [ "/action", "required" ], [ "/menu/0/href", "pattern" ], [ "/name", "maxLength" ] ], error.errors.map { |e| [ e.pointer, e.keyword ] }.sort
  end

  test "the first change makes the row at revision 1, and the next raises it by one, each at the time given" do
    first = Site.replace!(revision: 0, values: changed(name: "Tide club", action: nil), at: AT)

    assert_equal [ 1, "Tide club", nil, AT ], [ first.revision, first.name, first.action, first.updated_at ]
    second = Site.replace!(revision: 1, values: changed(name: "Tide club", menu: []), at: AT + 60)

    assert_equal [ 2, [], AT + 60 ], [ second.revision, second.menu, second.updated_at ]
    assert_equal [ 2, "Tide club", [] ], Site.current.then { |site| [ site.revision, site.name, site.menu ] }
    assert_equal 1, stored_rows
  end

  test "a write from an older revision that would change what is stored is refused with what is there now" do
    Site.replace!(revision: 0, values: changed(menu: []), at: AT)
    Site.replace!(revision: 1, values: changed(menu: [ { "label" => "Tides", "href" => "/tides" } ]), at: AT + 1)

    conflict = assert_raises(Site::Conflict) { Site.replace!(revision: 1, values: changed(name: "Another tab"), at: AT + 2) }

    assert_equal 2, conflict.site.revision
    assert_equal [ { "label" => "Tides", "href" => "/tides" } ], conflict.site.menu
    assert_equal [ 2, "Slack Water" ], [ Site.current.revision, Site.current.name ]
  end

  test "a write from an older revision that asks for exactly what is stored is answered as saved: a retry whose answer was lost" do
    values = changed(name: "Tide club")
    Site.replace!(revision: 0, values: values, at: AT)

    again = Site.replace!(revision: 0, values: values, at: AT + 5)

    assert_equal [ 1, AT ], [ again.revision, again.updated_at ]
  end

  test "of two first changes, the second finds the row the first made: a conflict unless it asks for the same" do
    Site.replace!(revision: 0, values: changed(name: "First tab"), at: AT)

    assert_raises(Site::Conflict) { Site.replace!(revision: 0, values: changed(name: "Second tab"), at: AT) }
    assert_equal "First tab", Site.current.name
  end

  test "a write from a revision the site never had is a conflict too" do
    assert_raises(Site::Conflict) { Site.replace!(revision: 7, values: changed(name: "Tide club"), at: AT) }
    assert_equal 0, stored_rows
  end

  test "values the schema refuses are refused, each at its pointer, and nothing is stored" do
    values = changed(name: "", menu: [ { "label" => "Script", "href" => "javascript:alert(1)" } ], footer: { "lead" => "Lead." })

    invalid = assert_raises(Site::Invalid) { Site.replace!(revision: 0, values: values, at: AT) }

    assert_equal [ [ "/footer", "required" ], [ "/menu/0/href", "pattern" ], [ "/name", "pattern" ] ], invalid.errors.map { |e| [ e.pointer, e.keyword ] }.sort
    assert invalid.errors.all? { |e| e.block_pointer.nil? }
    assert_equal 0, stored_rows
  end

  test "the application rules run before the schema, as for a page" do
    broken = "Slack \xED\xA0\x80 Water".dup.force_encoding(Encoding::UTF_8)

    invalid = assert_raises(Site::Invalid) { Site.replace!(revision: 0, values: changed(name: broken), at: AT) }

    assert_equal [ [ "/name", "wellFormed" ] ], invalid.errors.map { |e| [ e.pointer, e.keyword ] }
  end

  test "the model holds a row written another way to the same rules, under each value's pointer" do
    site = Site.new(id: Site::ID, revision: 1, name: "Tide club", menu: [ { "label" => "Script", "href" => "javascript:alert(1)" } ], action: "Join", footer: { "lead" => "Lead.", "text" => "Text." })

    assert_not site.valid?
    assert_equal({ "menu/0/href" => [ :pattern ], "action" => [ :type ] }, site.errors.details.transform_keys(&:to_s).transform_values { |list| list.map { |d| d[:error] } })
    assert_equal "javascript:alert(1)", site.read_attribute_for_validation(:"menu/0/href")
  end
end
