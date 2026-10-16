# frozen_string_literal: true

# What the cart's page (CartController, app/views/cart/show.html.erb) shows
# of each line's product besides its words and its price: the address of
# the product's page, while its collection's template is live (an entry's
# page is the 404 page until then), and its picture, the value of the
# collection's first image field, which the page draws as a Field block
# draws an image (BlocksHelper#block_img), its alt text the entry's.
#
# The twin of the browser demo's cartShown (builder/src/demo/cart-page.ts),
# which draws the same cart from the browser's storage; the cart's
# contract holds the two to one page (contract/cart/).
module CartPage
  # href: the product's page, or nil; image: an image field's value
  # ({ "mediaId", "alt" }), or nil for none.
  Shown = Data.define(:href, :image)

  module_function

  # By entry id, for each line whose product is published: lines, the
  # cart priced (ShopRules.price_cart's lines); fields and prefix, the
  # products collection's; live, whether its template is published;
  # published, by entry id, what each product went live with,
  # { "slug", "values" }. A product gone has no entry here.
  def shown(lines, fields:, prefix:, live:, published:)
    picture = fields.find { |field| field["type"] == "image" }&.dig("key")
    lines.each_with_object({}) do |line, shown|
      row = published[line.entry_id] or next

      image = picture && row["values"].is_a?(Hash) ? row["values"][picture] : nil
      image = nil unless image.is_a?(Hash) && image["mediaId"].is_a?(String)
      shown[line.entry_id] = Shown.new(href: live ? "/#{prefix}/#{row['slug']}" : nil, image: image)
    end
  end

  # The library's items for those pictures, in one query, as the renderer
  # asks for an image (MediaResolver): an item no longer there draws none.
  def media(shown)
    ids = shown.values.filter_map { |one| one.image&.fetch("mediaId") }.uniq
    MediaResolver.new(ids.empty? ? {} : MediaItem.where(public_id: ids).includes(file_attachment: :blob).index_by(&:public_id))
  end
end
