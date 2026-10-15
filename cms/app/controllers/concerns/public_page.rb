# frozen_string_literal: true

# What every page a visitor sees shares: the public layout, the block
# partials, and a Content-Security-Policy written out in full.
#
# The policy is static. No script at all; styles, fonts and images from this
# site (and images from https sites, which documents may name); frames only
# from the video and map providers of RenderPolicy. There is no nonce:
# Rails' nonce generator reads the session, and a session puts Set-Cookie
# on a response meant to be cached and shared. Nothing here touches the
# session, and the tests check that no public response sets a cookie.
module PublicPage
  extend ActiveSupport::Concern

  # The 404 page's content: a document like any other, rendered through
  # the same partials, so it has the site's look.
  NOT_FOUND = {
    "schemaVersion" => 1,
    "title" => "Page not found",
    "sections" => [
      {
        "id" => "not-found", "type" => "section", "props" => {}, "style" => { "base" => { "spaceAbove" => "section-l", "spaceBelow" => "section-l" } },
        "children" => [
          {
            "id" => "not-found-column", "type" => "column", "props" => {}, "style" => { "base" => {} },
            "children" => [
              { "id" => "not-found-heading", "type" => "heading", "props" => { "level" => 1, "text" => "There is no page here" }, "style" => { "base" => {} }, "children" => [] },
              {
                "id" => "not-found-text", "type" => "text", "style" => { "base" => { "textSize" => "large" } }, "children" => [],
                "props" => {
                  "doc" => {
                    "type" => "doc",
                    "content" => [
                      {
                        "type" => "paragraph",
                        "content" => [
                          { "type" => "text", "text" => "The page may have moved, or the address may be mistyped. " },
                          { "type" => "text", "text" => "Go to the home page", "marks" => [ { "type" => "link", "attrs" => { "href" => "/" } } ] }
                        ]
                      }
                    ]
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  }.freeze

  included do
    layout "public"
    helper_method :site_style, :site_parts

    # Every fragment of these pages belongs to the release that drew it: a
    # deploy that changes how a page is drawn finds none of the old ones.
    fragment_cache_key { PageCache.revision }

    content_security_policy do |policy|
      policy.default_src :none
      policy.script_src :none
      policy.style_src :self
      policy.font_src :self
      policy.img_src :self, :https
      policy.frame_src(*RenderPolicy::FRAME_ORIGINS)
      policy.base_uri :none
      policy.form_action :self
      policy.frame_ancestors :self
    end
  end

  private

  # The site style, read once per request: the ETag, the outer fragment's
  # key and the layout's data attributes all see the same one.
  def site_style
    @site_style ||= SiteStyle.current
  end

  # The site's header and footer as the published pages draw them
  # (SiteParts.live), read once per request in the same way, without their
  # versions' documents until a page is drawn. The preview draws their
  # drafts instead (PreviewsController).
  def site_parts
    @site_parts ||= SiteParts.live
  end

  # A published page, cached at three levels.
  #
  # In the browser: "max-age=0, public, must-revalidate" and an ETag
  # (PageCache.etag), with no Last-Modified, since a restore that is then
  # published would make it go back in time. Every visit asks again, and a
  # page that has not changed costs a 304 with no body, decided before the
  # version's document is even read; a publish shows at the next request.
  #
  # In Solid Cache: the page's whole HTML, one entry per version, site
  # style and header and footer; inside it, one entry per block
  # (BlocksHelper#render_blocks), the header's and footer's too, so a new
  # version redraws only the blocks that changed and those around them, a
  # new style none, and a new header only its own blocks that changed,
  # once for every page. With caching off (perform_caching), every request
  # renders.
  #
  # A page that lists a collection's entries, or whose header or footer
  # does, is keyed on those collections too (SiteContent#keys, read in one
  # query from the rows): a publish of an entry is a new key for every page
  # that lists its collection, and for its lists' blocks, and for no other.
  def render_published(page)
    content = SiteContent.new(ids: page.listed_collections + site_parts.values.flat_map(&:listed))
    render_cached(PageCache.etag(page, site_style, site_parts, content), PageCache.page_fragment(page, site_style, site_parts, content)) do
      render_document(page.published_version.document, content: content)
    end
  end

  # What a published page and an entry's page share: the browser's
  # validator, a 304 when it still holds, the whole page from Solid Cache,
  # or, drawn by the block given, the page written to it, its blocks
  # fragments of their own.
  def render_cached(etag, key)
    expires_in 0, public: true, must_revalidate: true
    response.weak_etag = etag
    return head(:not_modified) if request.fresh?(response)

    if (html = read_fragment(key))
      render html: html.html_safe
    else
      @cache_blocks = true
      yield
      write_fragment(key, response.body)
    end
  end

  # Renders a stored document, upgraded to the current schemaVersion. The
  # images it names are looked up in one query, made only if a block that
  # shows one is drawn rather than read from the cache; an entry's image a
  # list or a field draws, on its own. content: what its lists and fields
  # draw from (SiteContent), the header and footer drawn with it but its
  # entry. title and description, an entry's page's own over its
  # template's.
  def render_document(document, status: :ok, title: nil, description: nil, content: SiteContent::NONE)
    @document = BlockDocument::Upgrade.call(document)
    @media = MediaResolver.for_document(@document)
    @content = content
    @title = title || @document["title"]
    @description = description || @document["description"]
    render "pages/show", status: status
  end

  def render_not_found
    render_document(NOT_FOUND, status: :not_found)
  end
end
