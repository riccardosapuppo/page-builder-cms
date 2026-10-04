# frozen_string_literal: true

# What the page cache reads and writes for a published page, visit by visit,
# counted as the store receives the calls. Run from cms/, in production, on
# the databases of a run of tools/measure-server.ts, which reads the lines
# that start with "COUNT":
#
#   ruby bin/rails runner ../tools/lib/count-reuse.rb <slug> <heading's block id>
#
# The visits go through the whole application (its middleware, its
# controller, the real Solid Cache), in this process rather than over a
# socket: the counts do not depend on the transport, and the times are not
# taken here. Phases, each a visit to the page:
# - cold: the cache emptied first;
# - warm: the same visit again;
# - not modified: the validator the warm visit gave, sent back;
# - one widget changed: a heading's words changed, the draft saved and
#   published, the visit that follows;
# - site style changed: the type scale changed, the visit that follows.
require "json"

slug, widget_id = ARGV
abort "usage: ruby bin/rails runner ../tools/lib/count-reuse.rb <slug> <block id>" unless slug && widget_id

STORE = Rails.cache.class.name
EVENTS = /\Acache_(read|read_multi|write|write_multi)\.active_support\z/
calls = []
ActiveSupport::Notifications.subscribe(EVENTS) do |name, _start, _finish, _id, payload|
  next unless payload[:store] == STORE

  operation = name.delete_prefix("cache_").delete_suffix(".active_support")
  keys = payload[:key].is_a?(Hash) ? payload[:key].keys : Array(payload[:key])
  hits = case operation
  when "read_multi" then Array(payload[:hits]).size
  when "read" then payload[:hit] ? keys.size : 0
  else 0
  end
  calls << { operation: operation, keys: keys.size, hits: hits }
end

yjit = defined?(RubyVM::YJIT) && RubyVM::YJIT.enabled? ? "on" : "off"
puts "FACT #{RUBY_DESCRIPTION}, YJIT #{yjit}, Rails #{Rails.version}, Puma #{Gem.loaded_specs['puma']&.version}, " \
     "#{Rails.env}, cache store #{STORE}"

session = ActionDispatch::Integration::Session.new(Rails.application)
session.host! "127.0.0.1"

page = Page.find_by!(slug: slug)
count = ->(blocks) { Array(blocks).sum { |block| 1 + count.call(block["children"]) } }
blocks_in_page = count.call(page.published_version.document["sections"])

visit = lambda do |phase, headers = {}|
  calls.clear
  session.get "/#{slug}", headers: headers
  response = session.response
  reads = calls.select { |call| call[:operation].start_with?("read") }
  writes = calls.select { |call| call[:operation].start_with?("write") }
  puts "COUNT #{JSON.generate(
    phase: phase, status: response.status, bytes: response.body.bytesize, etag: response.headers['ETag'],
    blocks: blocks_in_page,
    read_calls: reads.size, keys_asked: reads.sum { |call| call[:keys] }, keys_found: reads.sum { |call| call[:hits] },
    write_calls: writes.size, keys_written: writes.sum { |call| call[:keys] },
    entries: SolidCache::Entry.count
  )}"
  response
end

Rails.cache.clear
visit.call("cold")
warm = visit.call("warm")
visit.call("not modified", { "If-None-Match" => warm.headers["ETag"] })

document = JSON.parse(JSON.generate(page.draft.document))
changed = 0
walk = lambda do |blocks|
  blocks.each do |block|
    if block["id"] == widget_id && block["type"] == "heading"
      block["props"]["text"] = "#{block['props']['text']} (changed)"
      changed += 1
    end
    walk.call(block["children"])
  end
end
walk.call(document["sections"])
abort "#{changed} headings have the id #{widget_id}, not 1" unless changed == 1
Draft.save_document!(page_id: page.id, revision: page.draft.revision, document: document, save_id: "count-reuse-1")
page.reload.publish!
visit.call("one widget changed")

# The style in force (the defaults, until a row exists) and another type
# scale than its own, so that the page's key really changes.
style = SiteStyle.current
style.type_scale = (SiteTokens.type_scales - [ style.type_scale ]).first
style.save!
visit.call("site style changed")
