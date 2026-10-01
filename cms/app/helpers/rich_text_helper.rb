# frozen_string_literal: true

# Rich text as the editor stores it (TipTap's JSON, cut down by the schema
# to paragraphs, line breaks, bullet and numbered lists, bold, italic and
# links) turned into HTML.
#
# Every element is built with tag, content_tag and safe_join, so the result
# is a SafeBuffer in which every piece of the author's text went through
# ActionView's escaping: nothing here marks a string as safe, and there is
# no raw. A link whose address RenderPolicy refuses is dropped and its text
# kept; a node or a mark the schema does not know is left out, with its
# text if it has any.
#
# The output follows TipTap's own: marks nest in the order they are stored,
# the first one innermost, and an ordered list writes start only when it
# does not start at 1. Links carry only their href: the renderer opens no
# new window and adds no rel of its own.
module RichTextHelper
  ORDERED_TYPES = %w[a A i I].freeze

  def rich_text(doc)
    return ActiveSupport::SafeBuffer.new unless doc.is_a?(Hash) && doc["type"] == "doc"

    rich_text_nodes(doc["content"])
  end

  # A plain-text field that may hold line breaks (\n only): each break
  # becomes a <br>, everything else is escaped text.
  def text_with_breaks(text)
    safe_join(text.to_s.split("\n", -1), tag.br)
  end

  private

  def rich_text_nodes(nodes)
    safe_join(Array(nodes).map { |node| rich_text_node(node) })
  end

  def rich_text_node(node)
    return nil unless node.is_a?(Hash)

    case node["type"]
    when "paragraph" then content_tag(:p, rich_text_nodes(node["content"]))
    when "bulletList" then content_tag(:ul, rich_text_nodes(node["content"]))
    when "orderedList" then content_tag(:ol, rich_text_nodes(node["content"]), **ordered_list_attributes(node["attrs"]))
    when "listItem" then content_tag(:li, rich_text_nodes(node["content"]))
    when "hardBreak" then tag.br
    when "text" then marked_text(node["text"], node["marks"])
    end
  end

  def ordered_list_attributes(attrs)
    return {} unless attrs.is_a?(Hash)

    start = attrs["start"]
    type = attrs["type"]
    {
      start: (start if start.is_a?(Integer) && start > 1),
      type: (type if ORDERED_TYPES.include?(type))
    }.compact
  end

  def marked_text(text, marks)
    html = ERB::Util.html_escape(text.is_a?(String) ? text : "")
    Array(marks).each { |mark| html = apply_mark(mark, html) }
    html
  end

  def apply_mark(mark, inner)
    return inner unless mark.is_a?(Hash)

    case mark["type"]
    when "bold" then content_tag(:strong, inner)
    when "italic" then content_tag(:em, inner)
    when "link"
      attrs = mark["attrs"]
      href = RenderPolicy.link_href(attrs.is_a?(Hash) ? attrs["href"] : nil)
      href ? content_tag(:a, inner, href: href) : inner
    else inner
    end
  end
end
