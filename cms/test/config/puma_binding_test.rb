require "test_helper"
require "puma"
require "puma/configuration"

# config/puma.rb: every server of the project listens on this machine only,
# because the API has no authentication. Puma's configuration is built
# here as `puma` and `rails server` build it, from the same file, and its
# plugins are started as Puma's launcher starts them, before it opens any
# socket. tools/check-production.ts does the same with a real server.
class PumaBindingTest < ActiveSupport::TestCase
  CONFIG = Rails.root.join("config", "puma.rb").to_s

  # binds: what -b and -p turn into, or a bind line; nil for none.
  def configuration(binds: nil)
    user = { config_files: [ CONFIG ] }
    user[:binds] = binds if binds
    Puma::Configuration.new(user, {}).tap(&:clamp)
  end

  # What a launcher shows its plugins.
  def launcher_for(configuration)
    Struct.new(:options).new(configuration.options)
  end

  def without_port
    saved = ENV.delete("PORT")
    yield
  ensure
    ENV["PORT"] = saved if saved
  end

  test "with no address and no port, the server listens on 127.0.0.1:3900" do
    without_port do
      assert_equal [ "tcp://127.0.0.1:3900" ], configuration.options[:binds]
    end
  end

  # 203.0.113.10 is in a range kept for documentation (RFC 5737): an
  # address of another machine, as one on the local network would be.
  test "an address outside this machine stops the boot before any socket is opened" do
    [ "tcp://0.0.0.0:3901", "tcp://[::]:3901", "tcp://203.0.113.10:3901", "tcp://example.com:3901", "tcp://:3901",
      "ssl://0.0.0.0:3901?key=k&cert=c" ].each do |bind|
      config = configuration(binds: [ bind ])

      _, err = capture_io do
        assert_raises(SystemExit, bind) { config.plugins.fire_starts(launcher_for(config)) }
      end
      # Without IPv6, Puma itself turns [::] into 0.0.0.0 first.
      assert_includes err, "Refusing to listen on #{config.options[:binds].join(', ')}:", bind
    end
  end

  test "this machine's addresses start" do
    config = configuration(binds: [ "tcp://127.0.0.1:3901", "tcp://127.0.0.2:3901", "tcp://[::1]:3901", "tcp://localhost:3901", "unix://tmp/sockets/puma.sock" ])
    plugin = Puma::Plugins.find("loopback_only")

    assert_includes config.plugins.instance_variable_get(:@instances).map(&:class), plugin, "config/puma.rb loads the plugin"
    assert_nil plugin.new.start(launcher_for(config))
  end
end
