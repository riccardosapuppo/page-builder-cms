# frozen_string_literal: true

# A collection's template: the document each entry of the collection is
# drawn with, kept as a page of its own kind, "template" (Page::KINDS),
# which belongs to its collection. Like the site's parts (SiteParts) it is
# edited, versioned and published as a page is, by the page API, by its
# id; it has no address of its own and is never the home page.
#
# Its document is a page's, held to a page's rules and to one of its own:
# no form. A form's answers are kept with the page and the published
# version they were sent from (Submission), and an entry is drawn on an
# address that is no page's. A section anchor is a page's, as the
# template is the whole of what its entry's page holds between the
# header and the footer, which take none.
module CollectionTemplate
  # The words of its rule.
  FORM = "A template holds no form: a form's answers belong to the page they are sent from, and an entry is no page."

  module_function

  # A new collection's template: an empty document titled with the
  # collection's name. Nothing is live until it is published.
  def starter(name)
    { "schemaVersion" => BlockDocument::Upgrade::CURRENT, "title" => name, "sections" => [] }
  end

  # The checks of a template's document: a page's (BlockDocument.check),
  # then its own rule, at each form block.
  def check(document)
    result = BlockDocument.check(document)
    return result unless result.ok?

    errors = SiteParts.forms(result.document).map { |pointer| BlockDocument::Error.at(pointer, "template", FORM) }
    errors.empty? ? result : BlockDocument::Result.new(document: nil, errors: errors)
  end
end
