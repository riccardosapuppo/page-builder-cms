# frozen_string_literal: true

module Api
  # The JSON shapes of the API's resources, in one place so every endpoint
  # answers with the same shape for the same thing. cms/openapi.yaml
  # describes each of them, and the request tests hold every response to it.
  # Member names are camelCase; times are ISO 8601 in UTC.
  module Representation
    private

    # kind is page, or header or footer for the site's parts, which have no
    # address (slug null) and are never home.
    def page_summary_json(page)
      draft = page.draft
      {
        "id" => page.id,
        "kind" => page.kind,
        "title" => draft.document["title"],
        "slug" => draft.slug,
        "home" => page.home?,
        "revision" => draft.revision,
        "updatedAt" => iso([ page.updated_at, draft.updated_at ].max),
        "published" => published_json(page),
        "scheduled" => page.pending_schedule && schedule_json(page.pending_schedule),
        "links" => page_links_json(page)
      }
    end

    def page_json(page)
      {
        "page" => {
          "id" => page.id,
          "kind" => page.kind,
          "title" => page.draft.document["title"],
          "slug" => page.draft.slug,
          "home" => page.home?,
          "createdAt" => iso(page.created_at)
        },
        "draft" => draft_json(page.draft),
        "published" => published_json(page),
        "scheduled" => page.pending_schedule && schedule_json(page.pending_schedule),
        "links" => page_links_json(page)
      }
    end

    # A publish set for a time. at is when it goes live; revision and
    # versionNumber are what goes live: the draft as it was at that
    # revision, kept as that version. state is pending until it is
    # published, cancelled, replaced by a newer one, superseded (a publish
    # had already put that revision or a later one live) or failed;
    # settledAt says when it stopped being pending.
    def schedule_json(schedule)
      {
        "id" => schedule.id,
        "at" => iso(schedule.publish_at),
        "revision" => schedule.revision,
        "versionNumber" => schedule.version.number,
        "state" => schedule.state,
        "createdAt" => iso(schedule.created_at),
        "settledAt" => iso(schedule.settled_at),
        "publishedVersionNumber" => schedule.published_version&.number
      }
    end

    def draft_json(draft, document: true)
      json = { "revision" => draft.revision, "lastSaveId" => draft.last_save_id, "updatedAt" => iso(draft.updated_at) }
      json["document"] = BlockDocument::Upgrade.call(draft.document) if document
      json
    end

    # draftRevision is the draft's revision the live version was taken
    # from: the draft holds saves that are not live while its own revision
    # is past it, as many as the difference.
    def published_json(page)
      return nil unless page.published?

      {
        "slug" => page.slug,
        "versionNumber" => page.published_version.number,
        "draftRevision" => page.published_revision,
        "publishedAt" => iso(page.published_at)
      }
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
        "schedules" => "#{base}/schedules",
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

    # A collection: its definition (fields as the schema has them, sort
    # the order its entries are listed in by default), the changes visitors
    # could see of it so far, how many entries it has and how many are
    # live, and its template, the page that draws them, as the page list
    # summarises a page. counts is {collection_id => [entries, live]}.
    def collection_json(collection, counts)
      entries, live = counts.fetch(collection.id, [ 0, 0 ])
      {
        "id" => collection.id,
        "name" => collection.name,
        "prefix" => collection.prefix,
        "fields" => collection.fields,
        "sort" => collection.default_sort,
        "publishedRevision" => collection.published_revision,
        "entryCount" => entries,
        "publishedCount" => live,
        "createdAt" => iso(collection.created_at),
        "updatedAt" => iso(collection.updated_at),
        "template" => page_summary_json(collection.template)
      }
    end

    # How many entries each collection has, and how many of them are live,
    # read in two queries: {collection_id => [entries, live]}.
    def entry_counts(collection_ids)
      all = Entry.where(collection_id: collection_ids).group(:collection_id).count
      live = Entry.where(collection_id: collection_ids).where.not(published_at: nil).group(:collection_id).count
      all.to_h { |id, count| [ id, [ count, live.fetch(id, 0) ] ] }
    end

    # An entry: its draft at its revision, the saveId of the save that took
    # it there, and what is live: the title, slug and values it was
    # published with, the draft revision they came from (the draft holds
    # that many saves visitors do not see while its revision is past it),
    # and when it went live; null before its first publish and after an
    # unpublish.
    def entry_json(entry)
      {
        "id" => entry.id,
        "collectionId" => entry.collection_id,
        "title" => entry.title,
        "slug" => entry.slug,
        "values" => entry.field_values,
        "revision" => entry.revision,
        "lastSaveId" => entry.last_save_id,
        "createdAt" => iso(entry.created_at),
        "updatedAt" => iso(entry.updated_at),
        "published" => entry.published? ? {
          "title" => entry.published_title,
          "slug" => entry.published_slug,
          "values" => entry.published_field_values,
          "draftRevision" => entry.published_revision,
          "publishedAt" => iso(entry.published_at)
        } : nil
      }
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
        # The address the published page gives the same image (MediaResolver),
        # so the canvas and the page show one address, and the browser
        # caches the bytes once.
        "url" => Rails.application.routes.url_helpers.rails_storage_proxy_path(blob, only_path: true),
        "createdAt" => iso(item.created_at)
      }
    end

    # An answer to a form, as a list shows it. versionNumber is the
    # published version the form was read from; the row is loaded with it
    # (ResponsesController#with_version_number), not with the version's
    # document.
    def response_summary_json(submission)
      {
        "id" => submission.id,
        "formId" => submission.form_id,
        "versionNumber" => submission.version_number,
        "submittedAt" => iso(submission.created_at),
        "excerpt" => submission.excerpt
      }
    end

    # An answer whole: the form's fields as that version had them, and the
    # answer to each by its name (text, "" when left empty, or whether the
    # box was ticked). What a visitor wrote is returned as the string it
    # was, never as markup.
    def response_json(submission)
      {
        "id" => submission.id,
        "formId" => submission.form_id,
        "versionNumber" => submission.version_number,
        "submittedAt" => iso(submission.created_at),
        "fields" => submission.fields,
        "answers" => submission.answers
      }
    end

    # The header and footer as stored (or the defaults, at revision 0), the
    # revision a change must name, and the site's time zone: the IANA name,
    # which a browser's Intl reads, so the editor works out from it the
    # offset of any date, summer time included.
    def site_json
      { "timeZone" => Time.zone.tzinfo.name }
    end

    # The shop's settings, when they last changed (null until they first
    # do), and whether checkout is set up on this CMS: a test key where it
    # runs (StripeSettings), and if not, why not. Never the key.
    def shop_json(shop, stripe = StripeSettings.current)
      {
        "enabled" => shop.enabled,
        "currency" => shop.currency,
        "productsCollectionId" => shop.products_collection_id,
        "priceField" => shop.price_field,
        "updatedAt" => iso(shop.changed_at),
        "checkout" => { "ready" => stripe.ready?, "reason" => stripe.reason }
      }
    end

    # An order: its lines as they were sold (each product's entry id, its
    # title and unit price then, in the currency's smallest unit, and the
    # quantity), the total in that unit, the currency, Stripe's Checkout
    # Session's id (null for the moment the checkout asks for it), its
    # status, and the email Stripe gave and when the CMS learned it was
    # paid, null until it is.
    def order_json(order)
      {
        "id" => order.id,
        "status" => order.status,
        "currency" => order.currency,
        "lines" => order.lines,
        "total" => order.total,
        "stripeSessionId" => order.stripe_session_id,
        "email" => order.email,
        "paidAt" => iso(order.paid_at),
        "createdAt" => iso(order.created_at),
        "updatedAt" => iso(order.updated_at)
      }
    end

    def site_style_json(style)
      colors = SiteTokens.read.fetch("color")
      {
        "palette" => style.palette,
        "typeScale" => style.type_scale,
        "letterWidth" => style.letter_width,
        "customCss" => style.custom_css,
        "updatedAt" => iso(style.updated_at),
        "kept" => style.kept,
        "choices" => {
          "palette" => SiteTokens.slots.transform_values do |slot|
            slot.tones.map { |tone| { "color" => tone, "label" => slot.tone_labels.fetch(tone), "hex" => colors.fetch(tone) } }
          end,
          "typeScales" => SiteTokens.type_scale_labels.map { |name, label| { "name" => name, "label" => label } },
          "letterWidths" => SiteTokens.letter_width_labels.map { |name, label| { "name" => name, "label" => label } }
        }
      }
    end
  end
end
