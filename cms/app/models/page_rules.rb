# frozen_string_literal: true

# The checks of a page's document, one of the site's own pages: a page's
# (BlockDocument.check), then its own rules: no Field block, and no Add to
# cart block. A Field block draws a value of the entry a collection's
# template is drawn with (EntryField), and an Add to cart block puts that
# entry in a visitor's cart (AddToCart), so each goes only in a template
# (CollectionTemplate); on a page, which has no entry, it would draw
# nothing. The site's header and footer hold neither (SiteParts). The
# editor offers them only in a template, and refuses them the same way, at
# the same pointers (builder/src/shared/validate.ts, pageFaults).
module PageRules
  # The words of its rules.
  FIELD = "A Field block draws a value of a collection's entry: it goes only in the collection's template."
  CART = "An Add to cart block puts a collection's entry in a visitor's cart: it goes only in the collection's template."

  module_function

  def check(document)
    result = BlockDocument.check(document)
    return result unless result.ok?

    errors = faults(result.document)
    errors.empty? ? result : BlockDocument::Result.new(document: nil, errors: errors)
  end

  # Every fault of the rules, at each Field block, then at each Add to
  # cart block, in page order.
  def faults(document)
    fields(document).map { |pointer| BlockDocument::Error.at(pointer, "field", FIELD) } +
      carts(document).map { |pointer| BlockDocument::Error.at(pointer, "addToCart", CART) }
  end

  # The pointer of every Field block of a document, in page order.
  def fields(document) = widgets(document, "field")

  # The pointer of every Add to cart block of a document, in page order.
  def carts(document) = widgets(document, "addToCart")

  def widgets(document, type)
    Array(document["sections"]).each_with_index.flat_map do |section, s|
      Array(section["children"]).each_with_index.flat_map do |column, c|
        Array(column["children"]).each_with_index.filter_map do |block, w|
          "/sections/#{s}/children/#{c}/children/#{w}" if block.is_a?(Hash) && block["type"] == type
        end
      end
    end
  end
end
