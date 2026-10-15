# frozen_string_literal: true

# The checks of a page's document, one of the site's own pages: a page's
# (BlockDocument.check), then the one rule of its own: no Field block. A
# Field block draws a value of the entry a collection's template is drawn
# with (EntryField), so it goes only in a template (CollectionTemplate); on
# a page, which has no entry, it would draw nothing. The site's header and
# footer hold none either (SiteParts). The editor offers it only in a
# template, and refuses it the same way, at the same pointers
# (builder/src/shared/validate.ts, fieldFaults).
module PageRules
  # The words of its rule.
  FIELD = "A Field block draws a value of a collection's entry: it goes only in the collection's template."

  module_function

  def check(document)
    result = BlockDocument.check(document)
    return result unless result.ok?

    errors = fields(result.document).map { |pointer| BlockDocument::Error.at(pointer, "field", FIELD) }
    errors.empty? ? result : BlockDocument::Result.new(document: nil, errors: errors)
  end

  # The pointer of every Field block of a document, in page order.
  def fields(document)
    Array(document["sections"]).each_with_index.flat_map do |section, s|
      Array(section["children"]).each_with_index.flat_map do |column, c|
        Array(column["children"]).each_with_index.filter_map do |block, w|
          "/sections/#{s}/children/#{c}/children/#{w}" if block.is_a?(Hash) && block["type"] == "field"
        end
      end
    end
  end
end
