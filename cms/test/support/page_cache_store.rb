# frozen_string_literal: true

# The tests of the page cache: a Solid Cache store on the tests' cache
# database (config/database.yml, test.cache), put where the published
# pages look for one, in place of the :null_store every other test runs
# with; and every call the store receives, kept in order.
#
# The rows a test writes are rolled back with the test, like those of the
# primary database.
module PageCacheStore
  # One call to the store: :read, :read_multi, :write or :write_multi,
  # the keys it named, and those it found (for a read).
  Call = Data.define(:operation, :keys, :hits)

  EVENTS = /\Acache_(read|read_multi|write|write_multi)\.active_support\z/

  # Runs the block with the Solid Cache store in place, and gives back the
  # calls the block made to it.
  def with_page_cache(store = solid_cache_store)
    calls = []
    saved = [ ActionController::Base.cache_store, ActionView::PartialRenderer.collection_cache ]
    ActionController::Base.cache_store = store
    ActionView::PartialRenderer.collection_cache = store
    subscriber = ActiveSupport::Notifications.subscribe(EVENTS) do |name, _start, _finish, _id, payload|
      next unless payload[:store] == store.class.name

      operation = name.delete_prefix("cache_").delete_suffix(".active_support").to_sym
      keys = payload[:key].is_a?(Hash) ? payload[:key].keys : Array(payload[:key])
      hits = operation == :read_multi ? Array(payload[:hits]) : (payload[:hit] ? keys : [])
      calls << Call.new(operation: operation, keys: keys, hits: hits)
    end
    yield calls
    calls
  ensure
    ActiveSupport::Notifications.unsubscribe(subscriber) if subscriber
    ActionController::Base.cache_store, ActionView::PartialRenderer.collection_cache = saved if saved
  end

  # Solid Cache as production configures it (config/cache.yml), without
  # its expiry: after some writes the store deletes old rows on a thread of
  # its own, at random, and that thread's connection would wait on the
  # test's open transaction.
  def solid_cache_store
    store = ActiveSupport::Cache.lookup_store(:solid_cache_store)
    store.define_singleton_method(:track_writes) { |_count| }
    store
  end

  # How many entries the calls wrote, and how many they read, found or
  # missed, in all.
  def written(calls) = calls.select { |call| call.operation.in?(%i[write write_multi]) }.sum { |call| call.keys.size }
  def asked(calls) = calls.select { |call| call.operation.in?(%i[read read_multi]) }.sum { |call| call.keys.size }
  def found(calls) = calls.sum { |call| call.hits.size }
  def reads(calls) = calls.count { |call| call.operation.in?(%i[read read_multi]) }
end
