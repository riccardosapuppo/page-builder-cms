require "test_helper"
require "open3"

# config/initializers/site_parts.rb: the header's and footer's starters,
# config/parts/*.json, are read as the CMS starts and checked once it has,
# and a starter that a part's draft could not hold stops it, naming each
# value. The model's tests call SiteParts.check themselves; this one starts
# the CMS, in a process of its own, the way `bin/rails runner` does
# (Bundler, then config/environment, which runs every initializer), with
# the header's starter replaced as the file is read. The file is not
# touched, and nothing about the check is stubbed: remove the initializer,
# or its check, and these fail.
class SiteBootTest < ActiveSupport::TestCase
  # The script the process runs, from its standard input. HEADER_STARTER
  # (JSON, in the environment) is what the app reads for
  # config/parts/header.json, where it reads the file.
  BOOT = <<~RUBY.freeze
    require "./config/boot"
    require "pathname"

    module StarterChanged
      def read(*args, **options)
        replaced = ENV["HEADER_STARTER"]
        return replaced if replaced && to_s.end_with?(File.join("config", "parts", "header.json"))

        super
      end
    end
    Pathname.prepend(StarterChanged)

    require "./config/environment"
    puts "booted with " + Rails.configuration.x.parts.fetch("header").fetch("title").inspect
  RUBY

  def header(title, widgets)
    { "schemaVersion" => 1, "title" => title, "sections" => [ section_block("s", widgets) ] }
  end

  # [standard output, standard error, status]
  def boot(starter)
    Open3.capture3({ "HEADER_STARTER" => JSON.generate(starter) }, RbConfig.ruby, "-", stdin_data: BOOT, chdir: Rails.root.to_s)
  end

  # The same process, the same script, a valid starter: it boots, and the
  # starter is what the app has. Without this, the runs below could stop for
  # any other reason (a missing gem, a mistake in the script) and still pass.
  test "a valid starter boots, and the app has it" do
    out, err, status = boot(header("Tide club", [ heading_block("h", "Tide club", level: 2) ]))

    assert status.success?, err
    assert_equal "booted with \"Tide club\"", out.strip
  end

  test "a starter that breaks a page's rules, or a part's, stops the boot, and the message names each value" do
    link = { "id" => "b", "type" => "button", "props" => { "label" => "Script", "href" => "javascript:alert(1)" }, "style" => { "base" => {} }, "children" => [] }
    out, err, status = boot(header(" ", [ link ]))

    assert_not status.success?, "the CMS booted with a starter the editor could not save back: #{out}"
    assert_not_includes out, "booted"
    assert_includes err, "config/parts"
    [ "header.json", "/title (pattern)", "/sections/0/children/0/children/0/props/href (pattern)" ].each { |named| assert_includes err, named }

    form = { "id" => "f", "type" => "form", "style" => { "base" => {} }, "children" => [],
             "props" => { "items" => [ { "name" => "email", "kind" => "email", "label" => "Email", "required" => true } ], "submitLabel" => "Send", "confirmation" => "Sent." } }
    out, err, status = boot(header("Header", [ form ]))

    assert_not status.success?, "the CMS booted with a form in its header: #{out}"
    assert_includes err, "header.json: /sections/0/children/0/children/0 (part)"
  end
end
