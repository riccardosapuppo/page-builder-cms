# frozen_string_literal: true

module Api
  # The entries of a collection: the list, searched and ordered; a new one;
  # one; a save of its draft at a revision; publishing and unpublishing
  # it; deleting it. An entry is found only under its own collection.
  class EntriesController < BaseController
    # The list's query, by parameter: words to look for in the titles, at
    # most 200 characters with no control character, and an order: a key,
    # descending with a minus before it.
    QUERY = {
      "q" => /\A[^\u0000-\u001f\u007f]{0,200}\z/,
      "order" => /\A-?(?:title|updatedAt|publishedAt|createdAt|[a-z][a-z0-9-]{0,63})\z/
    }.freeze
    # The orders the list takes besides a date or number field's key.
    BUILT_IN_ORDERS = %w[title updatedAt publishedAt createdAt].freeze

    # A query this list does not take: a parameter it does not know, one
    # named twice, a value not in its parameter's form, or an order by a
    # field the collection has not, or cannot order by.
    class InvalidQuery < StandardError
      attr_reader :parameter

      def initialize(parameter, message)
        @parameter = parameter
        super(message)
      end
    end

    rescue_from InvalidQuery do |e|
      render_error :bad_request, "invalid_query", e.message, parameter: e.parameter
    end

    # GET /api/collections/:id/entries?q=<words>&order=<key>
    #
    # Every entry of the collection whose title holds q, letters compared
    # without their case where they are ASCII; in the order asked, or the
    # collection's own. An entry with no value to order by (a draft by when
    # it went live, an entry without the field's value) comes last, either
    # way; entries of one value come in the order they were made, or its
    # reverse for a descending order.
    def index
      collection = find_collection
      query = list_query
      entries = collection.entries.to_a
      words = query["q"]
      if words && !words.empty?
        wanted = words.downcase(:ascii)
        entries = entries.select { |entry| entry.title.downcase(:ascii).include?(wanted) }
      end
      render json: { "entries" => ordered(collection, entries, *order_of(collection, query["order"])).map { |entry| entry_json(entry) } }
    end

    # POST /api/collections/:id/entries {title, slug, values}
    def create
      entry = Entry.create_checked!(find_collection, body)
      render json: entry_json(entry), status: :created
    end

    # GET /api/collections/:id/entries/:entry_id
    def show
      render json: entry_json(find_entry)
    end

    # PUT /api/collections/:id/entries/:entry_id {revision, saveId, title, slug, values}
    #
    # 200 with the entry when saved, or when this is a retry of the save
    # that was accepted last (same saveId, revision, title, slug and
    # values). 409 when the entry has moved past the revision sent, with
    # the current revision and the saveId of the save that moved it, as a
    # page's draft does. 422 with pointers into the body otherwise.
    def update
      check = BodyCheck.new(body, allowed: %w[revision saveId title slug values])
      check.integer("revision", required: true, minimum: 0)
      check.string("saveId", required: true, pattern: Draft::SAVE_ID)
      check.finish!

      entry = Entry.save_checked!(find_collection, path_integer(:entry_id), revision: body["revision"], save_id: body["saveId"],
                                  entry: body.slice("title", "slug", "values"))
      render json: entry_json(entry)
    end

    # DELETE /api/collections/:id/entries/:entry_id
    def destroy
      find_entry.delete_entry!
      head :no_content
    end

    # POST /api/collections/:id/entries/:entry_id/publish {revision?}
    #
    # Puts live what the draft holds now, checked again against the
    # collection's fields as they are; with revision, only if the entry is
    # still at it (409 otherwise). The draft's slug becomes its address,
    # and the one it had redirects to it from then on.
    def publish
      check = BodyCheck.new(body(optional: true), allowed: %w[revision])
      check.integer("revision", minimum: 0)
      check.finish!

      render json: entry_json(find_entry.publish!(expected_revision: body(optional: true)["revision"]))
    end

    # POST /api/collections/:id/entries/:entry_id/unpublish
    #
    # Takes it off; an entry not live is answered as it is.
    def unpublish
      render json: entry_json(find_entry.unpublish!)
    end

    private

    def find_collection
      Collection.find(path_integer(:id))
    end

    def find_entry
      find_collection.entries.find(path_integer(:entry_id))
    end

    # The order asked for, or the collection's: [key, descending].
    def order_of(collection, asked)
      return [ collection.default_sort["by"], collection.default_sort["direction"] == "desc" ] if asked.nil?

      key = asked.delete_prefix("-")
      unless BUILT_IN_ORDERS.include?(key) || collection.sortable_keys.include?(key)
        raise InvalidQuery.new("order", "The collection has no date or number field #{key} to order its entries by.")
      end
      [ key, asked.start_with?("-") ]
    end

    # The entries in order (EntryOrder): by the value of key, the ones
    # without one last; each run of one value by id; reversed, the ones
    # without a value apart, for a descending order. A time is compared as
    # the API writes it, to the millisecond, a title by its characters'
    # code points (its UTF-8 bytes), a date field's value as the text it
    # is, a number field's as a number. A value of another kind, one an
    # entry kept from before its field changed, counts as none.
    def ordered(collection, entries, key, descending)
      type = collection.fields.find { |field| field["key"] == key }&.fetch("type")
      EntryOrder.ordered(entries, descending: descending) { |entry| sort_value(entry, key, type) }
    end

    def sort_value(entry, key, type)
      case key
      when "title" then entry.title.b
      when "updatedAt" then iso(entry.updated_at)
      when "createdAt" then iso(entry.created_at)
      when "publishedAt" then iso(entry.published_at)
      else
        found = entry.field_values[key]
        found if (type == "date" && found.is_a?(String)) || (type == "number" && found.is_a?(Numeric))
      end
    end

    # The query, read from the address itself, as ResponsesController reads
    # its own: Rails' params keep only the last of a parameter named twice.
    def list_query
      query = Rack::Utils.parse_query(request.query_string)
      query.each do |name, value|
        pattern = QUERY[name]
        raise InvalidQuery.new(name, "This list takes only the parameters q and order.") unless pattern
        raise InvalidQuery.new(name, "The parameter #{name} is given more than once.") if value.is_a?(Array)
        raise InvalidQuery.new(name, "The parameter #{name} is not in the form it takes.") unless value.is_a?(String) && value.valid_encoding? && value.match?(pattern)
      end
      query
    end
  end
end
