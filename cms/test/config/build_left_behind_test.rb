require "test_helper"

# config/environments/test.rb: the tests read the stylesheets of app/assets
# as Propshaft compiles them, never a production build that
# assets:precompile left in public/assets. A build is planted there as a
# killed run of tools/check-production.ts or tools/measure-server.ts leaves
# one: tokens.css under its source's own digest in the text a build made on
# Windows has (every line ending in CRLF), and a manifest that names an
# older digest, with that file beside it. The folder is left as it was
# found. With the environment's two settings taken out, this test fails on
# each part: the public file server answers with the planted files, and
# Propshaft, built as the app builds it at boot, takes the planted
# manifest's digest.
class BuildLeftBehindTest < ActionDispatch::IntegrationTest
  FOLDER = Rails.public_path.join("assets")
  # A digest the source does not have, as an older build names it.
  STALE = "tokens-5ta1eb11.css".freeze

  test "a build left in public/assets is never what the tests read: not its stylesheets, not its manifest" do
    source = Rails.application.assets.load_path.find("tokens.css")
    own = "/assets/#{source.digested_path}"
    assert_equal own, ActionController::Base.helpers.asset_path("tokens.css")
    planted = source.compiled_content.b.gsub("\n", "\r\n")
    manifest = { "tokens.css" => { "digested_path" => STALE, "integrity" => nil } }.to_json

    with_build_left_behind(source.digested_path.to_s => planted, STALE => "/* an older build */", ".manifest.json" => manifest) do
      get own
      assert_response :ok
      body = response.body.b
      assert body == source.compiled_content.b,
             "#{own} answered #{body.bytesize} bytes, #{body.scan("\r\n").size} lines ending in CRLF" \
             "#{' (the file planted in public/assets)' if body == planted}; the source compiles to #{source.compiled_content.bytesize}"

      get "/assets/#{STALE}"
      assert_response :not_found, "the older build's file, planted in public/assets, was served"

      # As the app builds it at boot (the propshaft.assets_middleware
      # initializer): whether it reads a manifest is decided there, once.
      booted = Propshaft::Assembly.new(Rails.application.config.assets)
      assert_equal own, booted.resolver.resolve("tokens.css"), "a boot with this build in public/assets named the manifest's digest"
    end
  end

  private

  # Writes the files into public/assets and, whatever happens, leaves the
  # folder as it was: a file that was there gets its bytes back, one that
  # was not is removed, and the folder too when it was made here.
  def with_build_left_behind(files)
    made = !FOLDER.exist?
    kept = files.keys.select { |name| FOLDER.join(name).file? }.to_h { |name| [ name, FOLDER.join(name).binread ] }
    begin
      FileUtils.mkdir_p(FOLDER)
      files.each { |name, bytes| FOLDER.join(name).binwrite(bytes) }
      yield
    ensure
      if made
        FileUtils.rm_rf(FOLDER)
      else
        files.each_key { |name| kept.key?(name) ? FOLDER.join(name).binwrite(kept[name]) : FileUtils.rm_f(FOLDER.join(name)) }
      end
    end
  end
end
