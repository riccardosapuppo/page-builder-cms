require "test_helper"

# test/support/openapi_contract.rb fails the run unless every API request
# had its response checked. On Linux and macOS the tests run in forked
# workers: each leaves its two counts in a file as it stops, and the main
# process adds them to its own after the run. Windows runs the tests in
# one process and never takes that path, so it runs here, on a folder of
# its own, with a worker's file written by the same method a worker calls
# and another standing for a worker that missed a check.
class OpenapiCountsTest < ActiveSupport::TestCase
  test "the main process adds each worker's counts to its own, and removes their files" do
    dir = Rails.root.join("tmp", "openapi-counts-#{SecureRandom.hex(4)}")
    seen = OpenapiContract.seen
    checked = OpenapiContract.checked

    OpenapiContract.save_counts(3, dir: dir)
    assert_equal({ "seen" => seen, "checked" => checked }, JSON.parse(dir.join("worker-3-#{Process.pid}.json").read))
    dir.join("worker-4-1.json").write(JSON.generate("seen" => 40, "checked" => 39))

    assert_equal [ 2 * seen + 40, 2 * checked + 39 ], OpenapiContract.totals(dir: dir)
    assert_not dir.exist?
  ensure
    FileUtils.rm_rf(dir) if dir
  end
end
