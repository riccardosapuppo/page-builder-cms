require "test_helper"

# Two tabs save the same draft from the same revision at the same moment.
#
# Real concurrency, so not inside a test transaction: each request runs in
# its own thread with its own integration session and its own database
# connection, and a barrier releases both at once. The test removes what it
# wrote at the end.
#
# Released together is not enough on its own. Ruby runs one thread at a
# time, and a small save takes less than one turn, so the first request can
# finish its transaction before the second reaches the database: the
# requests overlap but the writes do not. So the first UPDATE of each round
# holds its transaction open for a moment (HOLD, a sleep in an
# instrumentation subscriber, which lets the other thread run), and the
# test measures that the second transaction began while the first was still
# open: the database really had two writers at once.
class Api::DraftConcurrencyTest < ActionDispatch::IntegrationTest
  self.use_transactional_tests = false

  ROUNDS = 10
  HOLD = 0.05

  setup do
    @page_ids = []
    # Load what the requests use before the threads start.
    [ Api::DraftsController, Api::JsonBody, Api::BodyCheck, Draft, PageVersion, MediaUsage, BlockDocument::Schema ].each(&:name)
  end

  teardown do
    Page.where(id: @page_ids).delete_all
  end

  test "of two saves from the same revision at the same moment, one is saved and the other is told who won" do
    held = Concurrent::AtomicBoolean.new(false)
    spans = Concurrent::Map.new
    watch = lambda do |_name, start, finish, _id, payload|
      tab = Thread.current[:race_tab] or next
      sql = payload[:sql]
      if sql.start_with?("BEGIN")
        spans[tab] = [ start, nil ]
      elsif sql.start_with?("COMMIT", "ROLLBACK")
        spans[tab] = [ spans[tab]&.first, finish ]
      elsif sql.start_with?(%(UPDATE "drafts")) && held.make_true
        sleep HOLD
      end
    end
    overlapping_requests = 0
    overlapping_transactions = 0

    ActiveSupport::Notifications.subscribed(watch, "sql.active_record") do
      ROUNDS.times do |round|
        page = Page.create_with_draft!(title: "Race #{round}", slug: "race-#{round}-#{SecureRandom.hex(3)}")
        @page_ids << page.id
        held.make_false
        spans.clear
        barrier = Concurrent::CyclicBarrier.new(2)

        results = %w[a b].map do |tab|
          Thread.new do
            # A failure in here reaches the test through value; Ruby need
            # not print it a second time.
            Thread.current.report_on_exception = false
            Thread.current[:race_tab] = tab
            session = open_session
            body = { "revision" => 0, "saveId" => "tab-#{tab}-#{round}", "document" => page_document(title: "Tab #{tab}") }.to_json
            barrier.wait(10)
            started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
            session.put "/api/pages/#{page.id}/draft", params: body, headers: ApiRequests::JSON_HEADERS
            finished = Process.clock_gettime(Process::CLOCK_MONOTONIC)
            { tab: tab, status: session.response.status, body: JSON.parse(session.response.body), started: started, finished: finished }
          end
        end.map(&:value)

        first, second = results
        overlapping_requests += 1 if first[:started] < second[:finished] && second[:started] < first[:finished]
        a, b = spans["a"], spans["b"]
        if a&.all? && b&.all? && a.first < b.last && b.first < a.last
          overlapping_transactions += 1
        end

        winner = results.find { |r| r[:status] == 200 }
        loser = results.find { |r| r[:status] == 409 }
        assert winner && loser, "round #{round}: #{results.map { |r| [ r[:tab], r[:status], r[:body] ] }.inspect}"

        # Read past this thread's query cache, which still holds the draft
        # as it was created.
        draft = Draft.uncached { Draft.find_by!(page_id: page.id) }
        assert_equal 1, draft.revision, "round #{round}"
        assert_equal "Tab #{winner[:tab]}", draft.document["title"], "round #{round}: the stored document is the winner's"
        assert_equal({ "currentRevision" => 1, "lastSaveId" => "tab-#{winner[:tab]}-#{round}" },
                     loser[:body].slice("currentRevision", "lastSaveId"), "round #{round}: the loser learns who won")
      end
    end

    puts "\n[draft concurrency] #{ROUNDS} rounds: requests overlapping in #{overlapping_requests}, transactions overlapping in #{overlapping_transactions}"
    assert overlapping_requests.positive?, "the two requests never overlapped: nothing concurrent was tested"
    assert overlapping_transactions.positive?, "the two transactions never overlapped: the database never had two writers at once"
  end
end
