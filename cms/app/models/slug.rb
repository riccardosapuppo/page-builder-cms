# frozen_string_literal: true

# The address of a page: /<slug>. Lowercase ASCII letters and digits in
# words joined by single hyphens, so it never needs escaping and never holds
# a dot that a server could read as a file extension.
module Slug
  FORMAT = /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/
  MAX_LENGTH = 64

  # Paths the application answers itself: the API, the health check, the
  # stylesheets and fonts, Active Storage, the draft preview, and the
  # shop's cart, /cart and the addresses below it (CartController), which
  # answer only while the shop is open but are reserved whether it is on
  # or off. Taken by a collection's prefix too, since a prefix is never one
  # of these (Collection). For new writes only (SlugValidator): a page or
  # a collection that held cart before it was reserved keeps it, and the
  # shop is not turned on while one does (ShopSetting).
  RESERVED = %w[api up assets rails preview cart].freeze

  module_function

  # Reserved too: any name a file in public/ already answers, such as 404
  # for public/404.html, because the static file server answers before the
  # router and the page would never be seen.
  def reserved?(slug)
    RESERVED.include?(slug) ||
      Rails.public_path.join("#{slug}.html").file? ||
      Rails.public_path.join(slug, "index.html").file?
  end
end
