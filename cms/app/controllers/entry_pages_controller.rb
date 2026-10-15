# frozen_string_literal: true

# The pages of a collection's entries: /<prefix>/<slug> draws the
# collection's published template with the entry's published values,
# inside the site's header and footer, as a page is drawn, under the
# entry's title (and the description its values give, else its template's:
# Entry#description), cached as a page is (PublicPage#render_cached, keyed
# by PageCache.entry_etag).
#
# A draft entry, an unknown slug, an unknown prefix, and an entry of a
# collection whose template has nothing live are the site's 404 page. An
# address an entry had before it was published under a new one answers
# 301 to where it is now (EntryRedirect), as a page's old address does. A
# collection's old prefix leads nowhere: a new prefix moves every entry.
#
# The route takes two parts in a slug's form (config/routes.rb), so it is
# never a page's address, which is one part, nor one of the application's
# own: a prefix is never a page's slug or a reserved address (Collection).
class EntryPagesController < ApplicationController
  include PublicPage

  # GET /:prefix/:slug
  def show
    prefix = request.path_parameters[:prefix].to_s
    slug = request.path_parameters[:slug].to_s
    collection = Collection.includes(:template).find_by(prefix: prefix)
    template = collection&.template
    return render_not_found unless template&.published?

    if (entry = collection.entries.find_by(published_slug: slug))
      render_entry(collection, entry, template)
    elsif (moved = EntryRedirect.includes(:entry).find_by(collection_id: collection.id, from_slug: slug)) && moved.entry.published?
      redirect_to "/#{collection.prefix}/#{moved.entry.published_slug}", status: :moved_permanently
    else
      render_not_found
    end
  end

  private

  def render_entry(collection, entry, template)
    content = SiteContent.new(ids: template.listed_collections + site_parts.values.flat_map(&:listed), entry: SiteContent.entry(entry))
    etag = PageCache.entry_etag(collection, entry, template, site_style, site_parts, content)
    render_cached(etag, PageCache.entry_fragment(collection, entry, template, site_style, site_parts, content)) do
      document = template.published_version.document
      render_document(document, title: entry.published_title, description: entry.description || document["description"], content: content)
    end
  end
end
