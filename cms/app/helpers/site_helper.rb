# frozen_string_literal: true

# The theme around every page: the site style on the page root, and the
# links of the header (config/site.yml).
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

  def site_links(links)
    Array(links).filter_map { |link| site_link(link) }
  end

  # A link of the header, if RenderPolicy accepts its address.
  def site_link(link, **attributes)
    return nil unless link.is_a?(Hash)

    href = RenderPolicy.link_href(link[:href])
    href && content_tag(:a, link[:label].to_s, href: href, **attributes)
  end
end
