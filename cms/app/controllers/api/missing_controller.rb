# frozen_string_literal: true

module Api
  # Every address under /api/ that no route of the API names, with any
  # method: a 404 in the API's error shape, so a client never gets the
  # site's HTML 404 page from the API.
  class MissingController < BaseController
    def show
      raise ActiveRecord::RecordNotFound
    end
  end
end
