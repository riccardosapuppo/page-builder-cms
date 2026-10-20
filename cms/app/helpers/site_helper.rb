# frozen_string_literal: true

# The theme around every page: the site style on the page root, and the
# site's header and footer, its parts (SiteParts).
module SiteHelper
  # data-<slot>="<tone>" for every palette slot, data-type-scale and
  # data-letter-width, on .site: tokens.css gives each curated tone a rule on that attribute, so
  # the site style reaches the page without an inline style, which the
  # Content-Security-Policy would block. A value the tokens do not list is
  # left out, and the slot keeps its default tone.
  def site_style_data(style = SiteStyle.current)
    palette = style.palette.is_a?(Hash) ? style.palette : {}
    data = SiteTokens.slots.each_with_object({}) do |(name, slot), out|
      out[name] = palette[name] if slot.tones.include?(palette[name]) || FreeColors.color?(palette[name])
    end
    data[:type_scale] = style.type_scale if SiteTokens.type_scales.include?(style.type_scale)
    data[:letter_width] = style.letter_width if SiteTokens.letter_widths.include?(style.letter_width)
    data
  end

  # The stylesheet of the free colours the page draws (FreeColors), after
  # tokens.css, or nothing when it has none: the site style's own tones, and
  # those the page's blocks and its header's and footer's name.
  def free_colors_link(style = site_style)
    documents = [ @document, *%w[header footer].map { |kind| site_parts.fetch(kind)&.document } ]
    path = FreeColors.path(style, documents)
    tag.link(rel: "stylesheet", href: path) if path
  end

  # The stylesheet of the free type the page draws (FreeType), after the
  # free colours', or nothing when it has none: the sizes, weights, letter
  # spacing, line heights and letter widths the page's headings, texts and
  # quotes set, and those of its header and footer.
  def free_type_link
    documents = [ @document, *%w[header footer].map { |kind| site_parts.fetch(kind)&.document } ]
    path = FreeType.path(documents)
    tag.link(rel: "stylesheet", href: path) if path
  end

  # The site's own stylesheet (CustomCss), after the theme's, the free
  # colours' and the free type's, or nothing when it has none: its address
  # names its version.
  def custom_css_link(style = site_style)
    css = CustomCss.scoped(style.custom_css)
    tag.link(rel: "stylesheet", href: "/custom.css?v=#{CustomCss.digest(css)}") unless css.empty?
  end

  # A part of the site around the page, in the element the layout gives it
  # (header or footer): its sections, drawn as a page's are, each block a
  # fragment of the cache where the page's are (@cache_blocks), the images
  # it names looked up apart from the page's. A part with no section draws
  # nothing, not even its element. A header whose document says it is
  # sticky stays at the top of the window (data-sticky, site.css), which
  # holds its rows on each device (RenderPolicy.sticky_rows). The header's
  # first section loads its picture at once, at the top of the window as
  # the page's first is; the footer's wait until they near the view.
  def site_part(part, element)
    document = BlockDocument::Upgrade.call(part.document)
    return nil if Array(document["sections"]).empty?

    sticky = element == :header ? RenderPolicy.sticky_rows(document) : nil
    content_tag(element, class: "sw-#{element}", data: { sticky: sticky }) do
      render_document(document, media: MediaResolver.for_document(document), content: (@content || SiteContent::NONE).without_entry, cached: @cache_blocks,
                                eager_first: element == :header)
    end
  end
end
