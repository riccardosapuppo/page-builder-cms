# frozen_string_literal: true

# The draft of a page as it would look published: the same layout and
# partials as the live page, from the draft's document, inside the drafts
# of the site's header and footer, so a preview shows the site as the
# editor holds it. Never stored by a cache (Cache-Control: no-store), since
# a draft changes with every save, and never indexed (X-Robots-Tag and a
# robots meta tag). A Collection list draws its collection's published
# entries, as it does on the site.
#
# The header and footer have no page of their own: the preview of one is
# the home page's draft inside them, or no page at all when the site has
# no home page.
#
# Nor has a collection's template: its preview is the template's draft
# drawn with an entry's draft, the one ?entry=<id> names, else the first
# published in the collection's own order, else its first, else values
# made up from its fields' types (CollectionTemplate.sample) for a
# collection with no entry, under the entry's title. So
# /preview/<template id>?entry=<entry id> is also the preview of an
# entry's draft, as its page would show it.
class PreviewsController < ApplicationController
  include PublicPage

  # What a part's preview shows below and above it when the site has no
  # home page.
  NO_HOME = { "schemaVersion" => 1, "title" => "No home page", "sections" => [] }.freeze

  before_action :never_store

  # GET /preview/:page_id(?entry=<entry id>)
  def show
    @noindex = true
    id = request.path_parameters[:page_id].to_s
    draft = Draft.includes(:page).find_by(page_id: id.to_i) if id.match?(/\A[1-9][0-9]{0,17}\z/)
    return render_not_found unless draft

    page = draft.page
    document = page.part? ? Page.home_page&.draft&.document || NO_HOME : draft.document
    title = "Preview: #{draft.document['title']}"
    if page.template? && page.collection
      entry = shown_entry(page.collection)
      title = "Preview: #{entry['title']}" if entry["title"].is_a?(String)
    end
    render_document(document, title: title, content: SiteContent.new(ids: CollectionList.ids(document) + site_parts.values.flat_map(&:listed), entry: entry))
  end

  private

  # The parts' drafts, which the editor holds, rather than what is live.
  def site_parts
    @site_parts ||= SiteParts.drafts
  end

  # The entry a template's preview is drawn with, its draft: the one the
  # address names, if it is the collection's; else the first published in
  # the collection's order (Collection#default_sort), else its first; else,
  # for a collection with none or an address that asks for them
  # (?entry=sample), values made up from its fields' types.
  def shown_entry(collection)
    asked = request.query_parameters["entry"]
    return CollectionTemplate.sample(collection) if asked == "sample"

    entry = collection.entries.find_by(id: asked.to_i) if asked.is_a?(String) && asked.match?(/\A[1-9][0-9]{0,17}\z/)
    entry ||= first_entry(collection)
    entry ? SiteContent.entry(entry, published: false) : CollectionTemplate.sample(collection)
  end

  def first_entry(collection)
    by = collection.default_sort["by"]
    field = collection.fields.find { |one| one["key"] == by }
    value = lambda do |entry|
      case by
      when "title" then entry.title
      when "updatedAt" then entry.updated_at
      when "publishedAt" then entry.published_at
      else
        found = entry.field_values[by]
        found if (field&.dig("type") == "date" && found.is_a?(String)) || (field&.dig("type") == "number" && found.is_a?(Numeric))
      end
    end
    ordered = EntryOrder.ordered(collection.entries.to_a, descending: collection.default_sort["direction"] == "desc", &value)
    ordered.find(&:published?) || ordered.first
  end

  def never_store
    no_store
    response.headers["X-Robots-Tag"] = "noindex"
  end
end
