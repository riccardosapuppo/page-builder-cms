# frozen_string_literal: true

# The theme around every page: the site style on the page root, and the
# site's header and footer, its parts (SiteParts).
module SiteHelper
  # data-<slot>="<tone>" for every palette slot, and data-type-scale, on
  # .site: tokens.css gives each curated tone a rule on that attribute, so
  # the site style reaches the page without an inline style, which the
  # Content-Security-Policy would block. A value the tokens do not list is
  # left out, and the slot keeps its default tone.
  def site_style_data(style = SiteStyle.current)
    palette = style.palette.is_a?(Hash) ? style.palette : {}
    data = SiteTokens.slots.each_with_object({}) do |(name, slot), out|
      out[name] = palette[name] if slot.tones.include?(palette[name])
    end
    data[:type_scale] = style.type_scale if SiteTokens.type_scales.include?(style.type_scale)
    data
  end

  # A part of the site around the page, in the element the layout gives it
  # (header or footer): its sections, drawn as a page's are, each block a
  # fragment of the cache where the page's are (@cache_blocks), the images
  # it names looked up apart from the page's. A part with no section draws
  # nothing, not even its element.
  def site_part(part, element)
    document = BlockDocument::Upgrade.call(part.document)
    return nil if Array(document["sections"]).empty?

    content_tag(element, class: "sw-#{element}") do
      render_document(document, media: MediaResolver.for_document(document), cached: @cache_blocks)
    end
  end
end
