# frozen_string_literal: true

module Api
  # The collections: the list, a new one with its template, one, a change
  # of its definition, and deleting one with its entries and template. The
  # template itself is read, saved, kept and published by the page routes,
  # by its id, as the site's parts are.
  class CollectionsController < BaseController
    # The members of a definition, as collection.schema.json names them.
    MEMBERS = %w[name prefix fields sort].freeze

    # GET /api/collections, oldest first.
    def index
      collections = with_template.order(:id).to_a
      counts = entry_counts(collections.map(&:id))
      render json: { "collections" => collections.map { |collection| collection_json(collection, counts) } }
    end

    # POST /api/collections {name, prefix, fields, sort}
    #
    # The body is the definition, held to the collection's schema and
    # rules whole; then the prefix to the CMS's own: taken by another
    # collection, a page's address, or one the application answers itself.
    # The template is made with it, empty, nothing live.
    def create
      collection = Collection.create_with_template!(body)
      render json: collection_json(find_collection(collection.id), entry_counts([ collection.id ])), status: :created
    end

    # GET /api/collections/:id
    def show
      collection = find_collection
      render json: collection_json(collection, entry_counts([ collection.id ]))
    end

    # PATCH /api/collections/:id {name?, prefix?, fields?, sort?}
    #
    # The members given replace the definition's own, and the definition is
    # checked whole: a field the sort follows cannot go without a new sort
    # (422 at /sort/by), nor the shop's price stop being a number field
    # (422 at /fields or at its type, shopPrice). The entries' values under
    # a key no field has any more stay until each one's next save leaves
    # them out.
    def update
      check = BodyCheck.new(body, allowed: MEMBERS)
      check.any_of(*MEMBERS)
      check.finish!

      find_collection.update_definition!(body)
      collection = find_collection
      render json: collection_json(collection, entry_counts([ collection.id ]))
    end

    # DELETE /api/collections/:id: with its entries, their redirects, and
    # its template with the template's draft and versions; 409
    # collection_in_shop while the shop's settings name it.
    def destroy
      Collection.find(path_integer(:id)).delete_unless_sold!
      head :no_content
    end

    private

    def with_template
      Collection.includes(template: [ :draft, :published_version, { pending_schedule: :version } ])
    end

    def find_collection(id = path_integer(:id))
      with_template.find(id)
    end
  end
end
