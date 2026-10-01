require "test_helper"

class BlockDocumentUpgradeTest < ActiveSupport::TestCase
  # Two made-up steps standing for a schema that has moved on twice: version
  # 2 renamed "title" to "name", version 3 added a "language".
  FUTURE_STEPS = {
    1 => ->(doc) { doc.except("title").merge("schemaVersion" => 2, "name" => doc["title"]) },
    2 => ->(doc) { doc.merge("schemaVersion" => 3, "language" => "en") }
  }.freeze

  test "a document of the current version goes through unchanged" do
    document = page_document

    assert_same document, BlockDocument::Upgrade.call(document)
    assert_equal 1, BlockDocument::Upgrade::CURRENT
  end

  test "an older document goes through every step up to the current version" do
    upgraded = BlockDocument::Upgrade.call(page_document(title: "Tides"), steps: FUTURE_STEPS, current: 3)

    assert_equal 3, upgraded["schemaVersion"]
    assert_equal "Tides", upgraded["name"]
    assert_equal "en", upgraded["language"]
    assert_not upgraded.key?("title")
  end

  test "a document newer than the server is refused, not guessed at" do
    error = assert_raises(BlockDocument::Upgrade::Unsupported) do
      BlockDocument::Upgrade.call(page_document.merge("schemaVersion" => 2))
    end
    assert_match "newer than this server's 1", error.message
  end

  test "a version with no step to the next is refused" do
    error = assert_raises(BlockDocument::Upgrade::Unsupported) do
      BlockDocument::Upgrade.call(page_document, steps: { 2 => FUTURE_STEPS[2] }, current: 3)
    end
    assert_match "no upgrade from schemaVersion 1", error.message
  end

  test "a step that does not move the version on is refused instead of looping" do
    stuck = { 1 => ->(doc) { doc } }

    assert_raises(BlockDocument::Upgrade::Unsupported) do
      BlockDocument::Upgrade.call(page_document, steps: stuck, current: 2)
    end
  end

  test "a document without a schemaVersion is refused" do
    assert_raises(BlockDocument::Upgrade::Unsupported) do
      BlockDocument::Upgrade.call(page_document.except("schemaVersion"))
    end
  end
end
