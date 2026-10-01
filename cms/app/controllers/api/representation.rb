# frozen_string_literal: true

module Api
  # The JSON shapes of the API's resources, in one place so every endpoint
  # answers with the same shape for the same thing. cms/openapi.yaml
  # describes each of them, and the request tests hold every response to it.
  # Member names are camelCase; times are ISO 8601 in UTC.
  module Representation
    private

    def page_summary_json(page)
      draft = page.draft
      {
        "id" => page.id,
        "title" => draft.document["title"],
        "slug" => draft.slug,
        "home" => page.home?,
        "revision" => draft.revision,
        "updatedAt" => iso([ page.updated_at, draft.updated_at ].max),
        "published" => published_json(page),
        "links" => page_links_json(page)
      }
    end

    def page_json(page)
      {
        "page" => {
          "id" => page.id,
          "title" => page.draft.document["title"],
          "slug" => page.draft.slug,
          "home" => page.home?,
          "createdAt" => iso(page.created_at)
        },
        "draft" => draft_json(page.draft),
        "published" => published_json(page),
        "links" => page_links_json(page)
      }
    end

    def draft_json(draft, document: true)
      json = { "revision" => draft.revision, "lastSaveId" => draft.last_save_id, "updatedAt" => iso(draft.updated_at) }
      json["document"] = BlockDocument::Upgrade.call(draft.document) if document
      json
    end

    def published_json(page)
      return nil unless page.published?

      { "slug" => page.slug, "versionNumber" => page.published_version.number, "publishedAt" => iso(page.published_at) }
    end

    # Where to go next from a page. preview and live are the pages a
    # browser opens (the draft as it would look, and the live page); the
    # others are this API.
    def page_links_json(page)
      base = "/api/pages/#{page.id}"
      {
        "self" => base,
        "draft" => "#{base}/draft",
        "versions" => "#{base}/versions",
        "publish" => "#{base}/publish",
        "preview" => "/preview/#{page.id}",
        "live" => page.live_path
      }
    end

    def version_json(version, published_version_id:, document: false)
      json = {
        "number" => version.number,
        "reason" => version.reason,
        "name" => version.name,
        "restoredFrom" => version.restored_from,
        "createdAt" => iso(version.created_at),
        "published" => version.id == published_version_id
      }
      json["document"] = BlockDocument::Upgrade.call(version.document) if document
      json
    end

    def media_json(item)
      blob = item.file.blob
      {
        "id" => item.public_id,
        "alt" => item.alt,
        "width" => item.width,
        "height" => item.height,
        "contentType" => blob.content_type,
        "byteSize" => blob.byte_size,
        "filename" => blob.filename.to_s,
        "url" => Rails.application.routes.url_helpers.rails_blob_path(blob, only_path: true),
        "createdAt" => iso(item.created_at)
      }
    end

    def site_style_json(style)
      colors = SiteTokens.read.fetch("color")
      {
        "palette" => style.palette,
        "typeScale" => style.type_scale,
        "updatedAt" => iso(style.updated_at),
        "choices" => {
          "palette" => SiteTokens.slots.transform_values do |slot|
            slot.tones.map { |tone| { "color" => tone, "label" => slot.tone_labels.fetch(tone), "hex" => colors.fetch(tone) } }
          end,
          "typeScales" => SiteTokens.type_scale_labels.map { |name, label| { "name" => name, "label" => label } }
        }
      }
    end
  end
end
