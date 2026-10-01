# frozen_string_literal: true

# Renders a page document with the partials in app/views/blocks/, one per
# block type. The published page, the draft preview and the contract
# goldens all go through render_document.
#
# The renderer keeps the document's strict tree even when a document did
# not pass the schema: a page holds sections, a section columns, a column
# widgets, and a block of any other type, or in any other place, is left
# out. A library image is looked up through media, which answers
# call(media_id) with a MediaResolver::Image or nil.
module BlocksHelper
  WIDGET_TYPES = %w[heading text image button divider spacer gallery video map iconbox quote accordion].freeze

  def render_document(document, media:)
    sections = document.is_a?(Hash) ? document["sections"] : nil
    render_blocks(sections, allow: %w[section], media: media)
  end

  def render_blocks(blocks, allow:, media:)
    parts = Array(blocks).filter_map do |block|
      next unless block.is_a?(Hash) && allow.include?(block["type"])

      render(partial: "blocks/#{block['type']}", locals: { block: block, media: media })
    end
    safe_join(parts)
  end

  # The attributes of a block's root element: its classes, then
  # data-block-id, data-block-type and data-style (the stored style, for the
  # contract with the editor's renderer), then any data the partial adds.
  def block_root(block, classes, data: {}, **attributes)
    {
      class: classes.flatten.compact,
      **attributes,
      data: {
        block_id: block["id"].to_s,
        block_type: block["type"],
        style: BlockStyle.data_attribute(block["style"]),
        **data
      }.compact
    }
  end

  def block_props(block)
    block["props"].is_a?(Hash) ? block["props"] : {}
  end

  def block_style(block)
    block["style"].is_a?(Hash) ? block["style"] : {}
  end

  # A string prop, or "" when it is missing or not a string.
  def prop_text(props, key)
    props[key].is_a?(String) ? props[key] : ""
  end

  # The image of an image block or a gallery item, as [src, width, height],
  # or nil when there is nothing to show: a library item media does not
  # know, or an address RenderPolicy refuses.
  def block_image(item, media)
    return nil unless item.is_a?(Hash)

    if item["mediaId"].is_a?(String)
      image = media.call(item["mediaId"])
      image && [ image.src, image.width, image.height ]
    elsif (src = RenderPolicy.image_src(item["url"]))
      [ src, nil, nil ]
    end
  end

  # The alt text: empty for a decorative image, which a screen reader then
  # skips; otherwise the block's own.
  def block_image_alt(item)
    return "" if item["decorative"] == true

    item["alt"].is_a?(String) ? item["alt"] : ""
  end

  def block_img(item, media, **attributes)
    src, width, height = block_image(item, media)
    return nil unless src

    tag.img(src: src, width: width, height: height, alt: block_image_alt(item), loading: "lazy", decoding: "async", **attributes)
  end

  # An icon of schema/icons.svg, drawn inline and rebuilt with tag helpers.
  def site_icon(name, css_class:)
    icon = SiteIcons[name]
    return nil unless icon

    shapes = icon.shapes.map { |element, attributes| content_tag(element, nil, attributes) }
    content_tag(:svg, safe_join(shapes), class: css_class, viewBox: icon.view_box, aria: { hidden: true }, focusable: "false")
  end

  # The drawings of the theme itself, the same on every page.
  THEME_SHAPES = {
    # The site's mark: a sea disc, the sun half risen, the waterline.
    "mark" => [ "0 0 24 24", [ [ :circle, { cx: 12, cy: 12, r: 11 } ], [ :path, { class: "sun", d: "M6 13.5a6 6 0 0 1 12 0z" } ], [ :path, { class: "line", d: "M1 13.5h22" } ] ] ],
    # An opening quotation mark, blocks low and tails rising to the right.
    "quote" => [ "0 0 48 36", [ [ :path, { d: "M2 34h18V17h-8c0-5 2-8 6-9V1C7 3 2 9 2 17zM28 34h18V17h-8c0-5 2-8 6-9V1c-9 2-16 8-16 16z" } ] ] ],
    "play" => [ "0 0 20 20", [ [ :path, { d: "M7 5v10l8-5z" } ] ] ],
    "menu" => [ "0 0 20 20", [ [ :path, { d: "M3 5.5h14M3 10h14M3 14.5h14" } ] ] ]
  }.freeze

  def theme_svg(name, css_class:)
    view_box, shapes = THEME_SHAPES.fetch(name)
    content_tag(:svg, safe_join(shapes.map { |element, attributes| content_tag(element, nil, attributes) }),
                class: css_class, viewBox: view_box, aria: { hidden: true }, focusable: "false")
  end
end
