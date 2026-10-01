# frozen_string_literal: true

# Small helpers that write page documents in the schema's shape, so the
# seed's pages read as content rather than as nested hashes. Every block
# gets the five keys {id, type, props, children, style}; a style is
# {base, tablet?, phone?}, with an override only where it is given.
module DocumentBuilder
  module_function

  def document(title:, sections:, description: nil)
    { "schemaVersion" => 1, "title" => title, "description" => description, "sections" => sections }.compact
  end

  def style(base = {}, tablet: nil, phone: nil)
    { "base" => base, "tablet" => tablet, "phone" => phone }.compact.transform_values { |part| part.transform_keys(&:to_s) }
  end

  def block(id, type, props = {}, children: [], base: {}, tablet: nil, phone: nil)
    { "id" => id, "type" => type, "props" => props.compact.transform_keys(&:to_s), "children" => children, "style" => style(base, tablet: tablet, phone: phone) }
  end

  # widths: the columnWidths preset, such as "3:2"; none means equal.
  def section(id, columns, anchor: nil, label: nil, widths: nil, **style)
    block(id, "section", { anchor: anchor, label: label, columnWidths: widths }, children: columns, **style)
  end

  def column(id, widgets, **style)
    block(id, "column", {}, children: widgets, **style)
  end

  def heading(id, text, level: 2, href: nil, **style)
    block(id, "heading", { level: level, text: text, href: href }, **style)
  end

  # Rich text: each argument is a paragraph (an Array of inline nodes or a
  # String) or a list made with bullets/numbers.
  def text(id, *content, **style)
    nodes = content.map { |part| part.is_a?(Hash) ? part : paragraph(*Array(part)) }
    block(id, "text", { doc: { "type" => "doc", "content" => nodes } }, **style)
  end

  def paragraph(*inline)
    node = { "type" => "paragraph" }
    node["content"] = inline.map { |part| part.is_a?(String) ? { "type" => "text", "text" => part } : part } unless inline.empty?
    node
  end

  def bold(text) = { "type" => "text", "text" => text, "marks" => [ { "type" => "bold" } ] }
  def italic(text) = { "type" => "text", "text" => text, "marks" => [ { "type" => "italic" } ] }
  def line_break = { "type" => "hardBreak" }

  def link(text, href)
    { "type" => "text", "text" => text, "marks" => [ { "type" => "link", "attrs" => { "href" => href } } ] }
  end

  # A list item: its first paragraph, then any nested lists.
  def item(first, *nested)
    { "type" => "listItem", "content" => [ paragraph(*Array(first)), *nested ] }
  end

  def bullets(*items)
    { "type" => "bulletList", "content" => items.map { |i| i.is_a?(Hash) ? i : item(i) } }
  end

  def numbers(*items, start: 1)
    { "type" => "orderedList", "attrs" => { "start" => start, "type" => nil }, "content" => items.map { |i| i.is_a?(Hash) ? i : item(i) } }
  end

  def image(id, media, alt: nil, decorative: nil, **style)
    block(id, "image", { mediaId: media.public_id, alt: alt, decorative: decorative }, **style)
  end

  def gallery(id, items, **style)
    block(id, "gallery", { items: items.map { |media, alt| { "mediaId" => media.public_id, "alt" => alt } } }, **style)
  end

  def button(id, label, href, **style)
    block(id, "button", { label: label, href: href }, **style)
  end

  def iconbox(id, icon, title, text, **style)
    block(id, "iconbox", { icon: icon, title: title, text: text }, **style)
  end

  def quote(id, text, attribution: nil, **style)
    block(id, "quote", { text: text, attribution: attribution }, **style)
  end

  def accordion(id, items, **style)
    block(id, "accordion", { items: items.map { |q, a| { "question" => q, "answer" => a } } }, **style)
  end

  def video(id, provider, video_id, title, **style)
    block(id, "video", { provider: provider, videoId: video_id, title: title }, **style)
  end

  def map(id, latitude, longitude, zoom, label, **style)
    block(id, "map", { latitude: latitude, longitude: longitude, zoom: zoom, label: label }, **style)
  end

  def divider(id, **style) = block(id, "divider", **style)
  def spacer(id, size, **style) = block(id, "spacer", { size: size }, **style)
end
