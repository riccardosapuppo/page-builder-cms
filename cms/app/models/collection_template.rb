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

  # The entry a template's preview is drawn with when its collection has
  # none: a value of every field made up from its type, as the editor's
  # canvas makes them (builder/src/editor/collections/content.ts,
  # sampleEntry): its label for a text, a line about it for a paragraph
  # and a rich text, its lowest number (or its highest, or 12), today, its
  # label and the top of the page for a link, a toggle on, its first
  # option; no image, which no field could make up.
  def sample(collection, today: Time.zone.today)
    values = collection.fields.each_with_object({}) do |field, made|
      value = sample_value(field, today)
      made[field["key"]] = value unless value.nil?
    end
    { "fields" => collection.fields, "title" => SAMPLE_TITLE, "slug" => "sample", "values" => values }
  end

  SAMPLE_TITLE = "The title of an entry"

  def sample_value(field, today)
    label = field["label"].to_s
    case field["type"]
    when "text" then label
    when "paragraph" then "#{label}: a few lines, as each entry writes them."
    when "richText" then { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [ { "type" => "text", "text" => "#{label}: paragraphs, lists and links, as each entry writes them." } ] } ] }
    when "number" then field["min"] || field["max"] || 12
    when "date" then today.iso8601
    when "link" then { "label" => label, "href" => "#" }
    when "toggle" then true
    when "choice" then Array(field["options"]).first
    end
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
