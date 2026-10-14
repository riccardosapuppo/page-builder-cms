# frozen_string_literal: true

# The server's side of builder/src/render/twins.rails.test.ts: answers, for
# every value the test generated, what the server's own RenderPolicy and
# RichTextHelper make of it, so the editor's twins can be compared with
# them value for value.
#
#   ruby twins.rb <input.json> <output.json>
#
# Run with BUNDLE_GEMFILE pointing at cms/Gemfile: the helper needs
# ActionView's tag helpers, and nothing else of Rails.
require "bundler/setup"
require "json"
require "action_view"

cms = File.expand_path("../../../cms", __dir__)
require File.join(cms, "lib/block_document/rules")
require File.join(cms, "app/models/render_policy")
require File.join(cms, "app/helpers/rich_text_helper")

view = Object.new
view.extend(ActionView::Helpers::TagHelper, ActionView::Helpers::OutputSafetyHelper, RichTextHelper)

input = JSON.parse(File.read(ARGV.fetch(0), encoding: "UTF-8"))
output = {
  "links" => input.fetch("links").map { |value| RenderPolicy.link_href(value) },
  "images" => input.fetch("images").map { |value| RenderPolicy.image_src(value) },
  "videos" => input.fetch("videos").map { |provider, id| RenderPolicy.video_src(provider, id) },
  "providers" => input.fetch("videos").map { |provider, _| RenderPolicy.video_provider?(provider) },
  "anchors" => input.fetch("anchors").map { |value| RenderPolicy.anchor(value) },
  "classes" => input.fetch("classes").map { |value| JSON.generate(RenderPolicy.classes(value)) },
  "maps" => input.fetch("maps").map { |latitude, longitude, zoom| RenderPolicy.map_src(latitude, longitude, zoom) },
  "decimals" => input.fetch("decimals").map { |number| RenderPolicy.decimal(number) },
  "richTexts" => input.fetch("richTexts").map { |doc| view.rich_text(doc).to_str }
}
File.binwrite(ARGV.fetch(1), JSON.generate(output))
