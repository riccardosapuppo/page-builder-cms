# frozen_string_literal: true

# A site with nothing in it, for `npm start -- --empty`: no page and no
# image, and the header and footer published with no section. Their
# starters (config/parts) are the example site's own, which every page
# would draw until a part is published: published empty, they are drawn on
# no page until they are given sections of their own in the editor.
#
# Running it again changes nothing: a part already published is left as it
# is, with whatever its owner has published since.
module EmptySite
  module_function

  # Returns, part by part, whether this run published it empty or found it
  # published already, and prints the same.
  def run
    done = Page::PARTS.to_h { |kind| [ kind, put_part(kind) ? :published_empty : :left_as_it_is ] }
    done.each do |kind, what|
      said = what == :published_empty ? "published with no section: no page draws it until it has one" : "already published, left as it is"
      puts "  the #{kind}: #{said}"
    end
    done
  end

  # The part of that kind, its draft emptied and published, and true; or
  # false for a part already published, left as it is.
  def put_part(kind)
    part = Page.part!(kind)
    return false if part.published?

    draft = part.draft
    empty = { "schemaVersion" => BlockDocument::Upgrade::CURRENT, "title" => draft.document["title"], "sections" => [] }
    Draft.save_document!(page_id: part.id, revision: draft.revision, document: empty, save_id: "empty-site")
    part.publish!
    true
  end
end
