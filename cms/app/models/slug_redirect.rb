# frozen_string_literal: true

# An address a page had before it was published under a new one. Visitors
# who use it are sent to the page's current address.
class SlugRedirect < ApplicationRecord
  belongs_to :page

  validates :from_slug, presence: true, uniqueness: true
end
