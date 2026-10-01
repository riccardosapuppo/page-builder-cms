# frozen_string_literal: true

# The media resolver of the contract goldens: the same answer for the same
# mediaId on every machine. The real one (MediaResolver) names Active
# Storage's proxy route with a signed id, and a signed id depends on the
# app's secret, so goldens rendered with it would differ from one checkout
# to the next.
#
# Every id resolves to /media/<id>.png, 800 by 600 pixels, except an id
# that starts with "missing", which stands for an item deleted from the
# library: no image. The editor's half of the contract uses the same rule.
module ContractMedia
  module_function

  def call(media_id)
    return nil if media_id.start_with?("missing")

    MediaResolver::Image.new(src: "/media/#{media_id}.png", width: 800, height: 600)
  end
end
