require "test_helper"

# test/support/openapi_contract.rb fails the run unless every API request
# had its response checked. On Linux and macOS the tests run in forked
# workers: each leaves its two counts in a file as it stops, and the main
# process adds them to its own after the run. Windows runs the tests in
# one process and never takes that path, so it runs here, on a folder of
# its own, with a worker's file written by the same method a worker calls
# and another standing for a worker that missed a check.
class OpenapiCountsTest < ActiveSupport::TestCase
  # The process's counts are whatever the run has reached, 0 and 0 when
  # this test runs first or alone, and a sum that left them out would
  # still add up then. So each step gets counts of its own, all different:
  # any one left out changes the totals.
  def with_counts(seen, checked)
    saved = %i[seen checked].index_with { |name| OpenapiContract.method(name) }
    OpenapiContract.define_singleton_method(:seen) { seen }
    OpenapiContract.define_singleton_method(:checked) { checked }
    yield
  ensure
    saved&.each { |name, method| OpenapiContract.define_singleton_method(name, method) }
  end

  test "the main process adds each worker's counts to its own, and removes their files" do
    dir = Rails.root.join("tmp", "openapi-counts-#{SecureRandom.hex(4)}")

    with_counts(3, 2) { OpenapiContract.save_counts(3, dir: dir) }
    assert_equal({ "seen" => 3, "checked" => 2 }, JSON.parse(dir.join("worker-3-#{Process.pid}.json").read))
    dir.join("worker-4-1.json").write(JSON.generate("seen" => 40, "checked" => 39))

    totals = with_counts(7, 5) { OpenapiContract.totals(dir: dir) }
    assert_equal [ 7 + 3 + 40, 5 + 2 + 39 ], totals
    assert_not dir.exist?
  ensure
    FileUtils.rm_rf(dir) if dir
  end
end
