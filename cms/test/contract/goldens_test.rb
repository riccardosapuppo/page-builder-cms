require "test_helper"

# The server's half of the render contract (contract/README.md): every
# document in contract/fixtures renders, through the block partials, to
# exactly the bytes of contract/rendered/<name>.html.
#
#   UPDATE_GOLDEN=1 ruby bin/rails test test/contract/goldens_test.rb
#
# writes the goldens again, with contract/rendered/manifest.json, which
# records the sha256 of every fixture, every golden and every source file
# of the renderer. The editor's half (stage 2) reads the manifest to know
# the goldens are current before it compares its own render with them.
class ContractGoldensTest < ActiveSupport::TestCase
  include VisibleText

  REPOSITORY = Rails.root.join("..").expand_path
  FIXTURES = REPOSITORY.join("contract", "fixtures")
  RENDERED = REPOSITORY.join("contract", "rendered")
  MANIFEST = RENDERED.join("manifest.json")

  # What decides the bytes of a golden, besides the fixture itself.
  RENDERER_SOURCES = %w[
    cms/app/views/blocks/*.html.erb
    cms/app/helpers/blocks_helper.rb
    cms/app/helpers/rich_text_helper.rb
    cms/app/models/block_style.rb
    cms/app/models/render_policy.rb
    cms/app/models/site_icons.rb
    cms/lib/site_theme/token_css.rb
    cms/test/support/contract_media.rb
    schema/icons.svg
    schema/block-document.schema.json
  ].freeze

  BLOCK_TYPES = %w[section column heading text image button divider spacer gallery video map iconbox quote accordion].freeze

  def self.fixture_names
    Dir.children(FIXTURES).select { |name| name.end_with?(".json") }.sort
  end

  def render_fixture(name)
    document = JSON.parse(FIXTURES.join(name).read)
    ApplicationController.render(inline: "<%= render_document(document, media: media) %>", locals: { document: document, media: ContractMedia })
  end

  def golden_name(fixture) = fixture.delete_suffix(".json") + ".html"

  def sha256(path) = Digest::SHA256.file(path).hexdigest

  def manifest
    sources = RENDERER_SOURCES.flat_map { |pattern| Dir.glob(REPOSITORY.join(pattern).to_s) }.sort.map { |path| Pathname(path) }
    {
      "about" => "Written by `UPDATE_GOLDEN=1 ruby bin/rails test test/contract/goldens_test.rb` from cms/. See contract/README.md.",
      "media" => "ContractMedia: every mediaId is /media/<id>.png, 800 x 600; an id starting with \"missing\" has no image.",
      "fixtures" => self.class.fixture_names.to_h { |name| [ name, sha256(FIXTURES.join(name)) ] },
      "rendered" => self.class.fixture_names.to_h { |name| [ golden_name(name), sha256(RENDERED.join(golden_name(name))) ] },
      "renderer" => sources.to_h { |path| [ path.relative_path_from(REPOSITORY).to_s, sha256(path) ] }
    }
  end

  if ENV["UPDATE_GOLDEN"] == "1"
    test "write the goldens and the manifest" do
      FileUtils.mkdir_p(RENDERED)
      (Dir.children(RENDERED) - self.class.fixture_names.map { |name| golden_name(name) } - [ "manifest.json" ]).each { |stale| File.delete(RENDERED.join(stale)) }
      self.class.fixture_names.each { |name| File.binwrite(RENDERED.join(golden_name(name)), render_fixture(name)) }
      File.binwrite(MANIFEST, JSON.pretty_generate(manifest) + "\n")
      puts "\ncontract: wrote #{self.class.fixture_names.size} golden(s) and manifest.json"
      pass
    end
  else
    test "the fixtures are there, with traps for every block type" do
      names = self.class.fixture_names
      assert_operator names.size, :>=, 6, "only #{names.size} fixture(s) in contract/fixtures"

      seen = Set.new
      walk = ->(node) do
        case node
        when Hash then seen << node["type"] if BLOCK_TYPES.include?(node["type"]) && node.key?("id"); node.each_value { |v| walk.call(v) }
        when Array then node.each { |v| walk.call(v) }
        end
      end
      names.each { |name| walk.call(JSON.parse(FIXTURES.join(name).read)) }
      assert_equal BLOCK_TYPES.sort, seen.to_a.sort
    end

    fixture_names.each do |name|
      test "#{name} renders to the bytes of its golden" do
        golden = RENDERED.join(golden_name(name))
        assert golden.file?, "#{golden.relative_path_from(REPOSITORY)} is missing: run UPDATE_GOLDEN=1 ruby bin/rails test #{__FILE__.delete_prefix("#{Rails.root}/")}"

        html = render_fixture(name)
        expected = golden.binread.force_encoding(Encoding::UTF_8)
        next pass if html == expected

        line = html.lines.zip(expected.lines).index { |a, b| a != b }.to_i
        want = expected.lines[line].to_s
        got = html.lines[line].to_s
        column = (0...[ want.length, got.length ].max).find { |i| want[i] != got[i] }.to_i
        from = [ column - 80, 0 ].max
        flunk "#{name}: the render differs from #{golden.basename} at line #{line + 1}, column #{column + 1}:\n" \
              "  golden: #{want[from, 200].inspect}\n  render: #{got[from, 200].inspect}"
      end
    end

    test "every golden has its fixture, and the manifest is current" do
      assert MANIFEST.file?, "contract/rendered/manifest.json is missing"
      goldens = Dir.children(RENDERED).reject { |name| name == "manifest.json" }.sort
      assert_equal self.class.fixture_names.map { |name| golden_name(name) }.sort, goldens

      stored = JSON.parse(MANIFEST.read)
      current = manifest
      %w[fixtures rendered renderer].each do |part|
        assert_equal current[part], stored[part], "manifest.json is stale (#{part}): run UPDATE_GOLDEN=1 ruby bin/rails test test/contract/goldens_test.rb"
      end
    end

    test "no golden shows a visitor the name of a provider or another brand" do
      found = self.class.fixture_names.to_h { |name| [ golden_name(name), brands_in(RENDERED.join(golden_name(name)).read) ] }.reject { |_, brands| brands.empty? }

      assert_empty found
    end

    test "the 500-block fixture is a page the server would accept, of exactly 500 blocks" do
      document = JSON.parse(FIXTURES.join("large-500.json").read)
      count = ->(blocks) { blocks.sum { |b| 1 + count.call(b["children"]) } }

      assert_equal 500, count.call(document["sections"])
      result = BlockDocument.check(document)
      assert result.ok?, result.errors.first(3).map(&:message).inspect
    end
  end
end
