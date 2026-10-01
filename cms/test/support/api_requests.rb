# frozen_string_literal: true

# Requests to the API the way the editor makes them: JSON in, JSON out.
module ApiRequests
  JSON_HEADERS = { "CONTENT_TYPE" => "application/json", "ACCEPT" => "application/json" }.freeze

  # Sends body as JSON. A String is sent exactly as written, for bodies a
  # JSON encoder would never produce (a repeated name, a broken text).
  def api(method, path, body = nil)
    text = body.is_a?(String) ? body.dup : body&.to_json
    public_send(method, path, params: text, headers: JSON_HEADERS)
    response
  end

  def json
    JSON.parse(response.body)
  end

  def create_page(title: "Winter series", slug: "winter")
    Page.create_with_draft!(title: title, slug: slug)
  end

  def save_draft(page, revision:, document:, save_id: "save-#{revision}")
    api(:put, "/api/pages/#{page.id}/draft", { "revision" => revision, "document" => document, "saveId" => save_id })
  end

  def error_pointers
    json.fetch("errors").map { |e| [ e["pointer"], e["keyword"] ] }
  end
end
