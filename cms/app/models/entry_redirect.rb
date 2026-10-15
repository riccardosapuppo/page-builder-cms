# frozen_string_literal: true

# An address an entry had in its collection before it was published under
# a new one: /<prefix>/<from_slug>. Visitors who use it are sent to the
# entry's live address, as a page's old address sends them to the page
# (SlugRedirect). Unique in its collection; a live entry's address wins
# over a redirect from it, which its publish deletes.
class EntryRedirect < ApplicationRecord
  belongs_to :collection
  belongs_to :entry

  validates :from_slug, presence: true, uniqueness: { scope: :collection_id }
end
