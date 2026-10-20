# frozen_string_literal: true

module Api
  # The site style: the tone of each palette slot, the type-scale choice,
  # the letter width, with the curated values each may take, and the site's
  # custom CSS.
  class SiteStylesController < BaseController
    # What a change may do with the style kept to be put back.
    KEPT = %w[now none].freeze

    # GET /api/site-style
    def show
      render json: site_style_json(SiteStyle.current)
    end

    # PUT /api/site-style {palette, typeScale, letterWidth, customCss, kept}:
    # the whole style, every slot named; the letter width and the custom
    # CSS, when given (without one, the style keeps its own). A value that
    # is not one of tokens.json's, or CSS that does not keep to the site
    # (CustomCss.check), is refused with 422. kept "now" keeps the style as
    # it was before this change, to be put back (the Assistant's new site),
    # in place of one kept before; "none" lets go of the one kept (it was
    # put back); without it, what is kept stays.
    def update
      check = BodyCheck.new(body, allowed: %w[palette typeScale letterWidth customCss kept])
      check.object("palette", required: true)
      check.string("typeScale", required: true)
      check.string("letterWidth")
      check.string("customCss")
      check.choice("kept", KEPT)
      check.finish!

      attempts = 0
      begin
        style = SiteStyle.current
        style.update!(palette: body["palette"], type_scale: body["typeScale"], letter_width: body.fetch("letterWidth", style.letter_width), custom_css: body.fetch("customCss", style.custom_css), kept: kept_after(style))
      rescue ActiveRecord::RecordNotUnique
        # Two first changes at once: both found no row and both inserted
        # id 1. The second now finds the row and updates it.
        attempts += 1
        retry if attempts == 1
        raise
      end
      render json: site_style_json(style)
    end

    private

    # The style kept to be put back once this change is made: the style as
    # it is now, none, or the one kept before.
    def kept_after(style)
      case body["kept"]
      when "now" then style.keepable
      when "none" then nil
      else style.kept
      end
    end
  end
end
