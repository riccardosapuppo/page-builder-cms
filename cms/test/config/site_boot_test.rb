require "test_helper"
require "open3"

# config/initializers/site.rb: config/site.yml's header and footer are
# checked as the CMS starts, and a value that a change from the editor could
# not hold stops it, naming each one. The model's tests call
# Site.check_defaults! themselves; this one starts the CMS, in a process of
# its own, the way `bin/rails runner` does (Bundler, then config/environment,
# which runs every initializer), with some values of config/site.yml changed
# as the file is read. The file is not touched, and nothing about the check
# is stubbed: remove the initializer, or its call, and these fail.
class SiteBootTest < ActiveSupport::TestCase
  # The script the process runs, from its standard input. `changes` (JSON,
  # in the environment) is put over the file's shared values where
  # ActiveSupport reads the file for config_for, so what the app boots with
  # is the file with those values changed.
  BOOT = <<~RUBY.freeze
    require "./config/boot"
    require "json"
    require "active_support"
    require "active_support/configuration_file"

    module SiteChanged
      def parse(content_path, **options)
        parsed = super
        return parsed unless File.basename(content_path.to_s) == "site.yml"

        parsed.merge("shared" => parsed.fetch("shared").merge(JSON.parse(ENV.fetch("SITE_CHANGES"))))
      end
    end
    ActiveSupport::ConfigurationFile.singleton_class.prepend(SiteChanged)

    require "./config/environment"
    puts "booted with " + Rails.configuration.x.site.fetch(:name).inspect
  RUBY

  # [standard output, standard error, status]
  def boot(changes = {})
    Open3.capture3({ "SITE_CHANGES" => JSON.generate(changes) }, RbConfig.ruby, "-", stdin_data: BOOT, chdir: Rails.root.to_s)
  end

  # The same process, the same script, a valid change: it boots, and the
  # change is what the app has. Without this, the run below could stop for
  # any other reason (a missing gem, a mistake in the script) and still pass.
  test "a valid change boots, and the app has it" do
    out, err, status = boot("name" => "Tide club")

    assert status.success?, err
    assert_equal "booted with \"Tide club\"", out.strip
  end

  test "defaults that break the rules stop the boot, and the message names each value" do
    menu = [ { "label" => "Script", "href" => "javascript:alert(1)" }, { "label" => "L" * 25, "href" => "/ok" } ]
    out, err, status = boot("name" => " ", "menu" => menu, "footer" => { "lead" => "Slack Water.", "text" => "x" * 161 })

    assert_not status.success?, "the CMS booted with defaults the editor could not save back: #{out}"
    assert_not_includes out, "booted"
    assert_includes err, "config/site.yml"
    [ "/name (pattern)", "/menu/0/href (pattern)", "/menu/1/label (maxLength)", "/footer/text (maxLength)" ].each do |named|
      assert_includes err, named
    end
  end
end
