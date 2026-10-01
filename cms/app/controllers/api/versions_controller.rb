# frozen_string_literal: true

module Api
  # The versions of a page: the list, one version, "Save version", and
  # restoring a version into the draft.
  class VersionsController < BaseController
    # GET /api/pages/:id/versions, newest first, without their documents.
    def index
      page = find_page
      versions = page.versions.order(number: :desc)
      render json: { "versions" => versions.map { |v| version_json(v, published_version_id: page.published_version_id) } }
    end

    # GET /api/pages/:id/versions/:number, with its document, upgraded to
    # the current schemaVersion.
    def show
      page = find_page
      version = page.versions.find_by!(number: path_integer(:number))
      render json: version_json(version, published_version_id: page.published_version_id, document: true)
    end

    # POST /api/pages/:id/versions {name?}: "Save version".
    def create
      check = BodyCheck.new(body(optional: true), allowed: %w[name])
      check.string("name")
      check.finish!

      page = find_page
      version = page.save_version!(name: body(optional: true)["name"])
      render json: version_json(version, published_version_id: page.published_version_id), status: :created
    end

    # POST /api/pages/:id/versions/:number/restore
    def restore
      page = find_page
      draft, version = page.restore!(path_integer(:number))
      render json: { "draft" => draft_json(draft), "version" => version_json(version, published_version_id: page.published_version_id) }
    end

    private

    def find_page
      Page.find(path_integer(:id))
    end

    def record_error_pointers
      { name: "/name" }
    end
  end
end
