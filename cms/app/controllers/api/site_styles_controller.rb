# frozen_string_literal: true

module Api
  # The site style: the tone of each palette slot, the type-scale choice
  # and the letter width, with the curated values each may take.
  class SiteStylesController < BaseController
    # GET /api/site-style
    def show
      render json: site_style_json(SiteStyle.current)
    end

    # PUT /api/site-style {palette, typeScale, letterWidth}: the whole
    # style, every slot named; the letter width, when given (without it,
    # the style keeps its own). A value that is not one of tokens.json's is
    # refused with 422.
    def update
      check = BodyCheck.new(body, allowed: %w[palette typeScale letterWidth])
      check.object("palette", required: true)
      check.string("typeScale", required: true)
      check.string("letterWidth")
      check.finish!

      attempts = 0
      begin
        style = SiteStyle.current
        style.update!(palette: body["palette"], type_scale: body["typeScale"], letter_width: body.fetch("letterWidth", style.letter_width))
      rescue ActiveRecord::RecordNotUnique
        # Two first changes at once: both found no row and both inserted
        # id 1. The second now finds the row and updates it.
        attempts += 1
        retry if attempts == 1
        raise
      end
      render json: site_style_json(style)
    end
  end
end
