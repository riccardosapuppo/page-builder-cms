# frozen_string_literal: true

module Api
  # The draft of a page: read it, and save it.
  class DraftsController < BaseController
    # GET /api/pages/:id/draft
    def show
      draft = Draft.find_by!(page_id: path_integer(:id))
      render json: draft_json(draft)
    end

    # PUT /api/pages/:id/draft {revision, document, saveId}
    #
    # 200 when saved, or when this is a retry of the save that was accepted
    # last (same saveId, revision and document). 409 when the draft has
    # moved past the revision sent, with the current revision and the saveId
    # of the save that moved it, so the editor can tell its own lost save
    # from someone else's.
    # 422 with pointers into the body when the document is not valid.
    def update
      check = BodyCheck.new(body, allowed: %w[revision document saveId])
      check.integer("revision", required: true, minimum: 0)
      check.string("saveId", required: true, pattern: Draft::SAVE_ID)
      check.required("document")
      check.finish!

      draft = Draft.save_document!(page_id: path_integer(:id), revision: body["revision"], document: body["document"], save_id: body["saveId"])
      render json: draft_json(draft, document: false)
    end
  end
end
