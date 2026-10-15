# frozen_string_literal: true

# The content of the contract goldens (contract/README.md): what a
# fixture's Collection lists and Field blocks draw from, read from the
# fixture itself rather than from a database, so every machine draws the
# same page. A fixture may hold, beside its document's members:
# - "collections": the collections its lists name, each its "id",
#   "prefix", "fields" and published "entries" (each its "id", "title",
#   "slug", "values" and "publishedAt"), as SiteContent reads them;
# - "entry": the entry a template is drawn with, its "id" and its
#   "collectionId", its collection's "fields", its "title", "slug" and
#   "values", as SiteContent.entry makes it.
# A fixture without them draws every list with no collection and every
# field with no entry. The editor's half of the contract reads the same
# members (builder/src/render/render.contract.test.tsx).
class ContractContent
  attr_reader :entry

  def initialize(fixture)
    collections = fixture.is_a?(Hash) && fixture["collections"].is_a?(Array) ? fixture["collections"] : []
    @collections = collections.select { |collection| collection.is_a?(Hash) }.to_h { |collection| [ collection["id"], collection ] }
    @entry = fixture.is_a?(Hash) ? fixture["entry"] : nil
  end

  def collection(id)
    @collections[id]
  end
end
