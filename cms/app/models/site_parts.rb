# frozen_string_literal: true

# The site's header and footer: documents like a page's, made of sections,
# columns and blocks, kept as pages of their own kind (Page::PARTS) and
# edited, versioned, scheduled and published as pages are. The layout draws
# them around every page a visitor sees (layouts/public.html.erb), and a
# publish of one shows on every page at its next visit.
#
# Until a part is published, the pages draw its starter, config/parts/
# <kind>.json: the example site's header and footer, which a new site
# starts from, and which a part made for the editor holds as its first
# draft. The starters are read once, as the app starts, and checked then as
# a part's draft is (config/initializers/site_parts.rb): a starter the
# editor could not save back stops the CMS, naming each value.
#
# A part holds no form: a form's answers belong to the page they were sent
# from, and are kept with its version (FormBlock). Its other rule is a
# page's.
module SiteParts
  KINDS = Page::PARTS

  # A part as the published pages draw it: the part's page row, if the CMS
  # has made it, and what it draws, the published version or the starter.
  # Its key names what is drawn without reading a version's document, so a
  # request a browser's copy answers (304) reads none.
  LivePart = Data.define(:kind, :page) do
    def published?
      page&.published? || false
    end

    def key
      published? ? PageCache.published_key(page) : [ "starter" ]
    end

    def document
      published? ? page.published_version.document : SiteParts.starter(kind)
    end
  end

  # A part's draft, as previews and the editor's canvas draw it: the
  # draft's document, or the starter while the CMS has not made the part.
  DraftPart = Data.define(:kind, :page) do
    def key = nil

    def document
      page&.draft ? page.draft.document : SiteParts.starter(kind)
    end
  end

  module_function

  # The starter of a part, as the app read it when it started
  # (config.x.parts).
  def starter(kind)
    Rails.configuration.x.parts.fetch(kind)
  end

  # Each starter's faults, by kind: those a part's draft is refused for.
  def starter_errors(starters = Rails.configuration.x.parts)
    KINDS.to_h { |kind| [ kind, check(starters.fetch(kind)).errors ] }.reject { |_, errors| errors.empty? }
  end

  # The checks of a part's document: a page's (BlockDocument.check), then
  # the part's own rule, no form.
  def check(document)
    result = BlockDocument.check(document)
    return result unless result.ok?

    errors = forms(result.document).map do |pointer|
      BlockDocument::Error.at(pointer, "part", "A header or footer holds no form: a form's answers belong to the page it is on.")
    end
    errors.empty? ? result : BlockDocument::Result.new(document: nil, errors: errors)
  end

  # The pointer of every form block of a document.
  def forms(document)
    Array(document["sections"]).each_with_index.flat_map do |section, s|
      Array(section["children"]).each_with_index.flat_map do |column, c|
        Array(column["children"]).each_with_index.filter_map do |block, w|
          "/sections/#{s}/children/#{c}/children/#{w}" if block.is_a?(Hash) && block["type"] == "form"
        end
      end
    end
  end

  # The parts the published pages draw, read in one query, without their
  # versions' documents.
  def live
    pages = Page.where(kind: KINDS).index_by(&:kind)
    KINDS.to_h { |kind| [ kind, LivePart.new(kind: kind, page: pages[kind]) ] }
  end

  # The parts' drafts, for a preview.
  def drafts
    pages = Page.includes(:draft).where(kind: KINDS).index_by(&:kind)
    KINDS.to_h { |kind| [ kind, DraftPart.new(kind: kind, page: pages[kind]) ] }
  end
end
