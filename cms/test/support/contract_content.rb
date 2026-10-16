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
#   "values", as SiteContent.entry makes it;
# - "shop": the shop's settings, "enabled", "currency",
#   "productsCollectionId" and "priceField", as SiteContent#shop reads them.
# A fixture without them draws every list with no collection, every field
# with no entry, and every price as a number. The editor's half of the
# contract reads the same members (builder/src/render/contract.ts).
class ContractContent
  attr_reader :entry, :shop

  def initialize(fixture)
    collections = fixture.is_a?(Hash) && fixture["collections"].is_a?(Array) ? fixture["collections"] : []
    @collections = collections.select { |collection| collection.is_a?(Hash) }.to_h { |collection| [ collection["id"], collection ] }
    @entry = fixture.is_a?(Hash) ? fixture["entry"] : nil
    @shop = fixture.is_a?(Hash) ? fixture["shop"] : nil
  end

  def collection(id)
    @collections[id]
  end
end
